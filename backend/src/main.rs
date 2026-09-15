//! Skateboard backend process entry: bind HTTP, serve, shut down on SIGTERM.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use skateboard_backend::http;
use skateboard_backend::json::Json;
use skateboard_backend::routes;
use skateboard_backend::state::AppState;

fn main() {
    let state = match AppState::open() {
        Ok(s) => Arc::new(s),
        Err(e) => {
            eprintln!("failed to start: {e}");
            std::process::exit(1);
        }
    };

    spawn_cleanup(Arc::clone(&state));

    let mut cfg = http::Config::default();
    cfg.port = state.port;
    let st = Arc::clone(&state);
    let server = match http::serve(cfg, move |req| routes::handle(&st, req)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to bind port {}: {e}", state.port);
            std::process::exit(1);
        }
    };

    state.log.info(
        "Server started successfully",
        &[
            ("port", Json::Num(f64::from(state.port))),
            (
                "environment",
                Json::Str(if state.prod {
                    "production".into()
                } else {
                    "development".into()
                }),
            ),
        ],
    );

    install_signals();
    while !STOP.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(200));
    }

    let name = if LAST_SIGNAL.load(Ordering::SeqCst) == 2 {
        "SIGINT"
    } else {
        "SIGTERM"
    };
    eprintln!("{name} received. Shutting down gracefully...");
    server.shutdown(Duration::from_secs(10));
    state.pool.close_all();
    eprintln!("Server closed");
    eprintln!("Database connections closed");
}

static STOP: AtomicBool = AtomicBool::new(false);
static LAST_SIGNAL: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

extern "C" fn on_signal(sig: i32) {
    LAST_SIGNAL.store(sig as u8, Ordering::SeqCst);
    STOP.store(true, Ordering::SeqCst);
}

/// Install SIGINT/SIGTERM handlers. System `signal(3)`, not a crate.
fn install_signals() {
    #[cfg(unix)]
    unsafe {
        libc_signal(2, on_signal); // SIGINT
        libc_signal(15, on_signal); // SIGTERM
    }
}

#[cfg(unix)]
extern "C" {
    #[link_name = "signal"]
    fn libc_signal(sig: i32, handler: extern "C" fn(i32)) -> usize;
}

fn spawn_cleanup(state: Arc<AppState>) {
    spawn_periodic(&state, "csrf-cleanup", 60 * 60, routes::run_csrf_cleanup);
    spawn_periodic(&state, "lockout-cleanup", 15 * 60, routes::run_lockout_cleanup);
    spawn_periodic(&state, "webhook-cleanup", 60 * 60, routes::run_webhook_cleanup);
}

/// Run `task` against shared state forever, every `period_secs`.
///
/// A failed spawn is logged rather than dropped silently — losing a janitor
/// thread means a store grows unbounded, which is worth an operator's attention.
fn spawn_periodic(
    state: &Arc<AppState>,
    name: &str,
    period_secs: u64,
    task: fn(&AppState),
) {
    let state_for_thread = Arc::clone(state);
    let spawned = thread::Builder::new()
        .name(name.to_string())
        .spawn(move || loop {
            thread::sleep(Duration::from_secs(period_secs));
            task(&state_for_thread);
        });
    if let Err(e) = spawned {
        state.log.error(
            "Failed to start cleanup thread",
            &[
                ("thread", Json::Str(name.to_string())),
                ("error", Json::Str(e.to_string())),
            ],
        );
    }
}

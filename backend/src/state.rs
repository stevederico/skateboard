use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::config::{self, BackendConfig, Logger};
use crate::db::{DbError, Pool};
use crate::http;
use crate::stores::{LockoutStore, RateLimitStore};
use crate::stripe::StripeClient;
use crate::stripe_worker::StripeWorker;

const REMOTE_OPEN_RETRY: Duration = Duration::from_secs(180);

fn open_remote_with_retry(
    log: &Logger,
    url: &str,
    namespace: &str,
    size: usize,
    retry_for: Duration,
) -> Result<Pool, DbError> {
    let deadline = Instant::now() + retry_for;
    let mut wait = Duration::from_secs(1);
    loop {
        match Pool::open_remote(url, namespace, size) {
            Ok(pool) => return Ok(pool),
            Err(e) if Instant::now() + wait < deadline => {
                log.warn(
                    "Shared libSQL not reachable yet, retrying",
                    &[
                        ("error", crate::json::Json::Str(e.to_string())),
                        ("retryInSecs", crate::json::i(wait.as_secs() as i64)),
                    ],
                );
                std::thread::sleep(wait);
                wait = (wait * 2).min(Duration::from_secs(15));
            }
            Err(e) => return Err(e),
        }
    }
}

pub struct AppState {
    pub cfg: BackendConfig,
    pub log: Logger,
    pub pool: Pool,
    pub lockout: LockoutStore,
    pub auth_rate: RateLimitStore,
    pub stripe: Option<StripeWorker>,
    pub stripe_lookup_keys: Vec<String>,
    pub stripe_endpoint_secret: Option<String>,
    pub jwt_secret: Option<String>,
    pub cors_origins: Vec<String>,
    pub static_dir: PathBuf,
    pub port: u16,
    pub free_usage_limit: i64,
    pub prod: bool,
}

impl AppState {
    pub fn resolve_cors_origins() -> Vec<String> {
        match config::env("CORS_ORIGINS") {
            Some(v) => v.split(',').map(|o| o.trim().to_string()).collect(),
            None => vec![
                "http://localhost:5173".to_string(),
                "http://localhost:8000".to_string(),
                "http://127.0.0.1:5173".to_string(),
                "http://127.0.0.1:8000".to_string(),
            ],
        }
    }

    pub fn resolve_port() -> u16 {
        let raw = config::env("PORT").unwrap_or_default();
        let digits: String = raw
            .trim_start()
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        digits.parse::<u16>().unwrap_or(8000)
    }

    pub fn resolve_free_usage_limit() -> i64 {
        let raw = config::env("FREE_USAGE_LIMIT").unwrap_or_default();
        let digits: String = raw
            .trim_start()
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        digits.parse::<i64>().unwrap_or(20)
    }

    pub fn redirect_origin(&self, request_origin: Option<&str>) -> String {
        config::env_nonempty("FRONTEND_URL")
            .or_else(|| allowed_origin(&self.cors_origins, request_origin))
            .unwrap_or_else(|| format!("http://localhost:{}", self.port))
    }

    pub fn open() -> Result<AppState, String> {
        let prod = config::is_prod();
        let log = Logger::new(prod);
        let dir = config::backend_dir();
        if !prod {
            config::load_local_env_before_any_thread_spawns(&dir, &log);
        }
        AppState::open_in(&dir, http::Config::default().threads, log)
    }

    pub fn open_in(dir: &Path, pool_size: usize, log: Logger) -> Result<AppState, String> {
        let prod = config::is_prod();
        let cfg = config::load_config(dir, &log);
        if config::validate_environment(&cfg, &log) {
            log.info("Environment variables validated successfully", &[]);
        }
        if prod {
            config::check_prod_jwt_secret(config::env_nonempty("JWT_SECRET").as_deref())?;
        }
        if cfg.database.db_type != "sqlite" {
            return Err(format!(
                "sqlite-only backend; database.dbType is '{}'",
                cfg.database.db_type
            ));
        }

        let pool = if let Some(url) = config::env_nonempty("LIBSQL_URL") {
            let namespace = cfg.database.db.clone();
            log.info(
                "Opening shared libSQL namespace",
                &[("namespace", crate::json::Json::Str(namespace.clone()))],
            );
            open_remote_with_retry(&log, &url, &namespace, pool_size, REMOTE_OPEN_RETRY)
                .map_err(|e| format!("failed to open libsql namespace {namespace} at {url}: {e}"))?
        } else {
            let conn = PathBuf::from(&cfg.database.connection_string);
            let db_path = if conn.is_absolute() {
                conn
            } else {
                dir.join(conn)
            };
            Pool::open(&db_path.to_string_lossy(), pool_size)
                .map_err(|e| format!("failed to open sqlite at {}: {e}", db_path.display()))?
        };

        if config::env_nonempty("STRIPE_KEY").is_none() {
            log.warn("STRIPE_KEY not set - Stripe functionality disabled", &[]);
        }
        log.info("Single-client backend initialized", &[]);

        let static_dir = dir.join(&cfg.static_dir);
        Ok(AppState {
            cfg,
            log,
            pool,
            lockout: LockoutStore::new(),
            auth_rate: RateLimitStore::new(),
            stripe: config::env_nonempty("STRIPE_KEY")
                .map(StripeClient::new)
                .map(StripeWorker::spawn),
            stripe_lookup_keys: config::load_stripe_lookup_keys(dir),
            stripe_endpoint_secret: config::env_nonempty("STRIPE_ENDPOINT_SECRET"),
            jwt_secret: config::env_nonempty("JWT_SECRET"),
            cors_origins: AppState::resolve_cors_origins(),
            static_dir,
            port: AppState::resolve_port(),
            free_usage_limit: AppState::resolve_free_usage_limit(),
            prod,
        })
    }

    pub fn app_name() -> Option<String> {
        config::env_nonempty("APP_NAME")
            .or_else(|| config::env_nonempty("RAILWAY_SERVICE_NAME"))
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
    }
}

fn allowed_origin(cors_origins: &[String], request_origin: Option<&str>) -> Option<String> {
    let candidate = request_origin?.trim();
    if candidate.is_empty() {
        return None;
    }
    cors_origins
        .iter()
        .find(|allowed| allowed.as_str() == candidate)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_open_retries_then_gives_up() {
        let start = Instant::now();
        let result = open_remote_with_retry(
            &Logger::new(false),
            "http://127.0.0.1:1",
            "T",
            1,
            Duration::from_millis(2500),
        );
        assert!(result.is_err());
        let took = start.elapsed();
        assert!(
            took >= Duration::from_secs(1),
            "should retry at least once, took {took:?}"
        );
        assert!(
            took < Duration::from_secs(5),
            "should stop near the deadline, took {took:?}"
        );
    }

    #[test]
    fn port_defaults_to_8000() {
        std::env::remove_var("PORT");
        assert_eq!(AppState::resolve_port(), 8000);
    }

    #[test]
    fn port_reads_env() {
        std::env::set_var("PORT", "9123");
        assert_eq!(AppState::resolve_port(), 9123);
        std::env::remove_var("PORT");
    }

    #[test]
    fn usage_limit_defaults_to_20() {
        std::env::remove_var("FREE_USAGE_LIMIT");
        assert_eq!(AppState::resolve_free_usage_limit(), 20);
    }

    #[test]
    fn cors_origins_default_to_dev_list() {
        std::env::remove_var("CORS_ORIGINS");
        assert_eq!(AppState::resolve_cors_origins().len(), 4);
    }

    fn origins() -> Vec<String> {
        vec![
            "https://app.example.com".to_string(),
            "https://admin.example.com".to_string(),
        ]
    }

    #[test]
    fn allowed_origin_accepts_a_listed_origin() {
        assert_eq!(
            allowed_origin(&origins(), Some("https://app.example.com")),
            Some("https://app.example.com".to_string())
        );
    }

    #[test]
    fn allowed_origin_refuses_anything_unlisted() {
        for hostile in [
            "https://evil.com",
            "https://app.example.com.evil.com",
            "https://app.example.com/../evil",
            "http://app.example.com",
            "app.example.com",
            "",
            "   ",
        ] {
            assert_eq!(
                allowed_origin(&origins(), Some(hostile)),
                None,
                "must refuse {hostile:?}"
            );
        }
    }

    #[test]
    fn allowed_origin_refuses_a_missing_header() {
        assert_eq!(allowed_origin(&origins(), None), None);
    }

    #[test]
    fn cors_origins_split_and_trim() {
        std::env::set_var("CORS_ORIGINS", "https://a.com, https://b.com");
        assert_eq!(
            AppState::resolve_cors_origins(),
            vec!["https://a.com".to_string(), "https://b.com".to_string()]
        );
        std::env::remove_var("CORS_ORIGINS");
    }
}

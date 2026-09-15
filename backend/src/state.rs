//! Shared server state and its construction from config + environment.

use std::path::{Path, PathBuf};

use crate::config::{self, BackendConfig, Logger};
use crate::db::Pool;
use crate::http;
use crate::stores::{CsrfStore, LockoutStore, RateLimitStore};
use crate::stripe::StripeClient;
use crate::stripe_worker::StripeWorker;

/// Everything a request handler needs, shared across worker threads.
///
/// Held behind an `Arc`; every field is either immutable after startup or
/// internally synchronized.
pub struct AppState {
    /// Resolved `config.json`.
    pub cfg: BackendConfig,
    /// Structured logger.
    pub log: Logger,
    /// SQLite connection pool.
    pub pool: Pool,
    /// Per-user CSRF tokens.
    pub csrf: CsrfStore,
    /// Failed-sign-in counters.
    pub lockout: LockoutStore,
    /// Per-IP sliding window on signup/signin.
    pub auth_rate: RateLimitStore,
    /// Stripe worker handle, or `None` when `STRIPE_KEY` is unset (routes 503).
    pub stripe: Option<StripeWorker>,
    /// Sellable `lookup_key`s from `src/constants.json` `stripeProducts`.
    pub stripe_lookup_keys: Vec<String>,
    /// Webhook signing secret, or `None` when unset (webhook 503s).
    pub stripe_endpoint_secret: Option<String>,
    /// JWT signing secret, or `None` when unset (auth routes 503).
    pub jwt_secret: Option<String>,
    /// Allowed CORS origins.
    pub cors_origins: Vec<String>,
    /// Absolute path of the built frontend assets.
    pub static_dir: PathBuf,
    /// Listen port, used to build the dev fallback origin for Stripe redirects.
    pub port: u16,
    /// Monthly operation allowance for non-subscribers.
    pub free_usage_limit: i64,
    /// Cached production flag; `NODE_ENV` does not change after startup.
    pub prod: bool,
}

impl AppState {
    /// Resolve CORS origins from `CORS_ORIGINS`, falling back to the dev list.
    ///
    /// Matches `__testResolveCorsOrigins`: a comma-separated list, each entry
    /// trimmed.
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

    /// Resolve the listen port from `PORT`, defaulting to 8000.
    ///
    /// Node's `parseInt` accepts a leading-numeric string such as `"8000x"`;
    /// this mirrors that leniency rather than rejecting it, so a typo produces
    /// the same port on both servers.
    pub fn resolve_port() -> u16 {
        let raw = config::env("PORT").unwrap_or_default();
        let digits: String = raw.trim_start().chars().take_while(char::is_ascii_digit).collect();
        digits.parse::<u16>().unwrap_or(8000)
    }

    /// Resolve `FREE_USAGE_LIMIT`, defaulting to 20.
    pub fn resolve_free_usage_limit() -> i64 {
        let raw = config::env("FREE_USAGE_LIMIT").unwrap_or_default();
        let digits: String = raw.trim_start().chars().take_while(char::is_ascii_digit).collect();
        digits.parse::<i64>().unwrap_or(20)
    }

    /// The origin used for Stripe success/cancel/return URLs.
    ///
    /// `FRONTEND_URL` wins, then the request's `Origin` header *if it is an
    /// allowed origin*, then a localhost fallback.
    ///
    /// The allow-list check is what keeps this from being an open redirect.
    /// These origins are pasted into URLs that Stripe sends the user back to,
    /// so taking the `Origin` header on trust lets an attacker hand a victim a
    /// checkout link that returns them to an attacker-controlled site wearing
    /// the trust of a payment flow. `Origin` is attacker-settable on a
    /// non-browser request, so it cannot be used unchecked.
    ///
    /// # Arguments
    ///
    /// * `request_origin` - Value of the request's `Origin` header, if present.
    pub fn redirect_origin(&self, request_origin: Option<&str>) -> String {
        config::env_nonempty("FRONTEND_URL")
            .or_else(|| allowed_origin(&self.cors_origins, request_origin))
            .unwrap_or_else(|| format!("http://localhost:{}", self.port))
    }

    /// Boot state: load `.env` outside production, then open the database.
    ///
    /// # Errors
    /// Returns a human-readable message when `dbType` is not `sqlite` or the
    /// database file cannot be opened.
    pub fn open() -> Result<AppState, String> {
        let prod = config::is_prod();
        let log = Logger::new(prod);
        let dir = config::backend_dir();
        if !prod {
            config::load_local_env(&dir, &log);
        }
        AppState::open_in(&dir, http::Config::default().threads, log)
    }

    /// Build state from `dir` (the folder holding `config.json` and `.env`).
    ///
    /// Skips `.env` loading so tests can inject environment variables first.
    ///
    /// # Errors
    /// Same as [`AppState::open`].
    pub fn open_in(dir: &Path, pool_size: usize, log: Logger) -> Result<AppState, String> {
        let prod = config::is_prod();
        let cfg = config::load_config(dir, &log);
        if config::validate_environment(&cfg, &log) {
            log.info("Environment variables validated successfully", &[]);
        }
        // Development tolerates a missing secret (auth routes answer 503); production
        // must not start, or it would serve sessions nobody can trust.
        if prod {
            config::check_prod_jwt_secret(config::env_nonempty("JWT_SECRET").as_deref())?;
        }
        if cfg.database.db_type != "sqlite" {
            return Err(format!(
                "sqlite-only backend; database.dbType is '{}'",
                cfg.database.db_type
            ));
        }

        let conn = PathBuf::from(&cfg.database.connection_string);
        let db_path = if conn.is_absolute() {
            conn
        } else {
            dir.join(conn)
        };
        let pool = Pool::open(&db_path.to_string_lossy(), pool_size)
            .map_err(|e| format!("failed to open sqlite at {}: {e}", db_path.display()))?;

        if config::env_nonempty("STRIPE_KEY").is_none() {
            log.warn("STRIPE_KEY not set - Stripe functionality disabled", &[]);
        }
        log.info("Single-client backend initialized", &[]);

        let static_dir = dir.join(&cfg.static_dir);
        Ok(AppState {
            cfg,
            log,
            pool,
            csrf: CsrfStore::new(),
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

    /// Lowercased app name stamped on Stripe Checkout metadata, when set.
    pub fn app_name() -> Option<String> {
        config::env_nonempty("APP_NAME")
            .or_else(|| config::env_nonempty("RAILWAY_SERVICE_NAME"))
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
    }
}

/// `request_origin` if it exactly matches one of `cors_origins`.
///
/// Matching is exact, never prefix or substring: both `https://evil.com` and
/// `https://app.example.com.evil.com` have to fail, and a `contains`-style
/// test would admit the second.
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

    /// The origins a deployment would configure.
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
        // Each of these would otherwise be pasted into a Stripe return URL.
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

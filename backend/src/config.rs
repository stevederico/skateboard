//! Configuration, environment loading, and structured logging.
//!
//! Zero-crate port of `backend/lib/env.ts`, `backend/lib/logger.ts`, and the
//! `config.json` loading in `backend/server.ts`. There is no dotenv: `.env`
//! files are parsed by hand, exactly as the Node backend does.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::json::{self, Json};

// ==== ENVIRONMENT ====

/// True when `NODE_ENV` is exactly `production`.
///
/// Matches `isProd()` in `lib/env.ts`: any other value — including unset — is
/// treated as development.
pub fn is_prod() -> bool {
    std::env::var("NODE_ENV").as_deref() == Ok("production")
}

/// Read an environment variable, treating an unset variable as `None`.
///
/// An empty string is returned as `Some("")`, matching `process.env` semantics
/// where a set-but-blank variable is distinct from an unset one.
pub fn env(key: &str) -> Option<String> {
    std::env::var(key).ok()
}

/// Read an environment variable, returning `None` for unset *or* empty.
///
/// Used where the Node code tests truthiness (`if (!stripeKey)`), for which
/// an empty string is falsy.
pub fn env_nonempty(key: &str) -> Option<String> {
    env(key).filter(|v| !v.is_empty())
}

/// Whether a path exists and is a symbolic link (does not follow the link).
///
/// Mirrors `isEnvSymlink` — a symlinked `.env` is refused because it can
/// dereference to a secrets store outside the project.
pub fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

/// Whether a path exists as a regular file that is not a symlink.
fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_type().is_file() && !m.file_type().is_symlink())
        .unwrap_or(false)
}

/// Parse a `.env` file into a key/value map without touching the process
/// environment.
///
/// Skips blank lines, `#` comments, and lines with an empty key. A key with no
/// value yields an empty string. Values may contain `=`, and a single pair of
/// surrounding quotes is stripped. **Refuses symlinks** (secret-leak risk).
///
/// Returns `None` when the file is missing, unreadable, or refused.
pub fn parse_env_file(path: &Path, log: &Logger) -> Option<BTreeMap<String, String>> {
    if is_symlink(path) {
        log.error(
            "Refusing to load .env symlink (secret-leak risk). Use a regular file.",
            &[("filePath", Json::Str(path.display().to_string()))],
        );
        return None;
    }
    let data = fs::read_to_string(path).ok()?;
    let mut parsed = BTreeMap::new();
    for line in data.lines() {
        let trimmed = line.trim_start();
        if line.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = raw_key.trim();
        if key.is_empty() {
            continue;
        }
        parsed.insert(key.to_string(), strip_quotes(raw_value.trim()));
    }
    Some(parsed)
}

/// Strip one matching pair of leading/trailing single or double quotes.
///
/// Matches the Node regex `/^["']|["']$/g`, which also strips a *mismatched*
/// leading and trailing quote — replicated here for parity.
fn strip_quotes(value: &str) -> String {
    let bytes = value.as_bytes();
    let lead = matches!(bytes.first(), Some(b'"') | Some(b'\''));
    let trail = bytes.len() > if lead { 1 } else { 0 }
        && matches!(bytes.last(), Some(b'"') | Some(b'\''));
    let start = usize::from(lead);
    let end = value.len() - usize::from(trail);
    value[start..end].to_string()
}

/// Ensure `.env` is a regular file, creating it from `.env.example` if absent.
///
/// A symlink is removed first. Returns whether a regular `.env` is ready.
fn ensure_regular_env_file(env_path: &Path, example_path: &Path, log: &Logger) -> bool {
    if is_symlink(env_path) {
        log.error(
            "backend/.env is a symlink — removing (secret-leak risk)",
            &[("filePath", Json::Str(env_path.display().to_string()))],
        );
        if let Err(e) = fs::remove_file(env_path) {
            log.error("Failed to remove .env symlink", &[("error", Json::Str(e.to_string()))]);
            return false;
        }
    }
    if is_regular_file(env_path) {
        return true;
    }
    match fs::read(example_path).and_then(|data| {
        let mut f = fs::File::create(env_path)?;
        f.write_all(&data)
    }) {
        Ok(()) => true,
        Err(e) => {
            log.error("Failed to create .env from template", &[("error", Json::Str(e.to_string()))]);
            false
        }
    }
}

/// Load `.env` then `.env.local` from `base_dir` into the process environment.
///
/// `.env.local` wins over `.env`, but neither overrides a variable already set
/// on the process — shell, CI, and test values win. Only called outside
/// production; Railway injects variables directly there.
pub fn load_local_env(base_dir: &Path, log: &Logger) {
    let env_path = base_dir.join(".env");
    let local_path = base_dir.join(".env.local");
    let example_path = base_dir.join(".env.example");

    let mut from_files: BTreeMap<String, String> = BTreeMap::new();
    if ensure_regular_env_file(&env_path, &example_path, log) {
        if let Some(m) = parse_env_file(&env_path, log) {
            from_files.extend(m);
        }
    }
    if let Some(m) = parse_env_file(&local_path, log) {
        from_files.extend(m);
    }

    for (key, value) in from_files {
        if std::env::var_os(&key).is_none() {
            // SAFETY-equivalent note: set_var is safe on this edition; the
            // call happens during single-threaded startup before any worker
            // thread is spawned.
            std::env::set_var(&key, &value);
        }
    }
}

/// Expand `${VAR}` placeholders in a configuration string.
///
/// An undefined variable leaves the placeholder in place and logs a warning,
/// matching `resolveEnvironmentVariables`.
pub fn resolve_env_placeholders(input: &str, log: &Logger) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' && bytes.get(i + 1) == Some(&b'{') {
            if let Some(close) = input[i + 2..].find('}') {
                let name = &input[i + 2..i + 2 + close];
                let placeholder = &input[i..i + 3 + close];
                match std::env::var(name) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        log.warn(
                            "Environment variable not defined, using placeholder",
                            &[
                                ("varName", Json::Str(name.to_string())),
                                ("placeholder", Json::Str(placeholder.to_string())),
                            ],
                        );
                        out.push_str(placeholder);
                    }
                }
                i += 3 + close;
                continue;
            }
        }
        // Copy one UTF-8 scalar so multi-byte characters survive intact.
        let ch = input[i..].chars().next().unwrap_or('\u{fffd}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

// ==== CONFIG FILE ====

/// Database selection from `config.json`.
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    /// Logical database name, used as the connection cache key.
    pub db: String,
    /// Adapter selector. Only `sqlite` is supported by this backend.
    pub db_type: String,
    /// SQLite file path, after `${VAR}` expansion.
    pub connection_string: String,
}

/// Resolved backend configuration.
#[derive(Debug, Clone)]
pub struct BackendConfig {
    /// Directory of built frontend assets, relative to the binary's config dir.
    pub static_dir: String,
    /// Database selection.
    pub database: DatabaseConfig,
}

impl BackendConfig {
    /// Defaults used when `config.json` is missing or malformed.
    ///
    /// Mirrors the catch branch of `__testLoadApplicationConfig`, including the
    /// `TEST_DATABASE_PATH` override.
    fn defaults() -> BackendConfig {
        BackendConfig {
            static_dir: "../dist".to_string(),
            database: DatabaseConfig {
                db: "MyApp".to_string(),
                db_type: "sqlite".to_string(),
                connection_string: env("TEST_DATABASE_PATH")
                    .unwrap_or_else(|| "./databases/MyApp.db".to_string()),
            },
        }
    }
}

/// Load `config.json` from `dir`, falling back to defaults on any failure.
///
/// The `database.connectionString` has `${VAR}` placeholders expanded. A file
/// that parses but has the wrong shape is treated as a failure, matching the
/// `isRawConfig` guard in the Node server.
pub fn load_config(dir: &Path, log: &Logger) -> BackendConfig {
    let path = dir.join("config.json");
    let Ok(text) = fs::read(&path) else {
        log.error(
            "Failed to load config, using defaults",
            &[("error", Json::Str(format!("cannot read {}", path.display())))],
        );
        return BackendConfig::defaults();
    };
    let parsed = match json::parse(&text) {
        Ok(v) => v,
        Err(e) => {
            log.error("Failed to load config, using defaults", &[("error", Json::Str(e.to_string()))]);
            return BackendConfig::defaults();
        }
    };
    let Some(database) = parsed.get("database") else {
        log.error(
            "Failed to load config, using defaults",
            &[("error", Json::Str("Invalid config.json shape".into()))],
        );
        return BackendConfig::defaults();
    };
    let (Some(db), Some(db_type), Some(conn)) = (
        database.get_str("db"),
        database.get_str("dbType"),
        database.get_str("connectionString"),
    ) else {
        log.error(
            "Failed to load config, using defaults",
            &[("error", Json::Str("Invalid config.json shape".into()))],
        );
        return BackendConfig::defaults();
    };

    BackendConfig {
        static_dir: parsed
            .get_str("staticDir")
            .filter(|s| !s.is_empty())
            .unwrap_or("../dist")
            .to_string(),
        database: DatabaseConfig {
            db: db.to_string(),
            db_type: db_type.to_string(),
            connection_string: resolve_env_placeholders(conn, log),
        },
    }
}

/// Sellable Stripe `lookup_key`s from `src/constants.json`.
///
/// Checkout rejects anything not in this list so a client cannot pick an
/// internal or legacy price that still has a lookup_key on the Stripe account.
/// Missing or unreadable constants yield an empty list (fail closed).
pub fn load_stripe_lookup_keys(backend_dir: &Path) -> Vec<String> {
    let path = backend_dir.join("../src/constants.json");
    let Ok(bytes) = fs::read(&path) else {
        return Vec::new();
    };
    let Ok(parsed) = json::parse(&bytes) else {
        return Vec::new();
    };
    let Some(items) = parsed.get("stripeProducts").and_then(Json::as_arr) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| item.get_str("lookup_key"))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Warn about missing required environment variables.
///
/// Never exits: the Node server starts with reduced functionality and this
/// port matches that. Returns whether everything required was present.
pub fn validate_environment(config: &BackendConfig, log: &Logger) -> bool {
    let mut missing: Vec<Json> = Vec::new();
    if env_nonempty("STRIPE_KEY").is_none() {
        missing.push(Json::Str("STRIPE_KEY".into()));
    }
    if env_nonempty("STRIPE_ENDPOINT_SECRET").is_none() {
        missing.push(Json::Str("STRIPE_ENDPOINT_SECRET".into()));
    }
    if env_nonempty("JWT_SECRET").is_none() {
        missing.push(Json::Str("JWT_SECRET".into()));
    }
    // An unexpanded ${VAR} in the connection string means the variable is unset.
    let conn = &config.database.connection_string;
    let mut i = 0;
    while let Some(start) = conn[i..].find("${") {
        let abs = i + start;
        let Some(close) = conn[abs + 2..].find('}') else { break };
        let name = &conn[abs + 2..abs + 2 + close];
        missing.push(Json::Str(format!("{name} (referenced in database config)")));
        i = abs + 3 + close;
    }

    if missing.is_empty() {
        return true;
    }
    log.warn(
        "Missing environment variables - server continuing with limited functionality",
        &[
            ("missing", Json::Arr(missing)),
            (
                "hint",
                Json::Str(
                    "See backend/.env.example; STRIPE_KEY and JWT_SECRET are needed for payments and auth"
                        .into(),
                ),
            ),
        ],
    );
    false
}

/// Shortest `JWT_SECRET` accepted in production (HMAC-SHA256 block size).
pub const MIN_JWT_SECRET_LEN: usize = 32;

/// Reject a production boot that cannot mint trustworthy sessions.
///
/// Development keeps the warn-and-continue behaviour so the template runs
/// before any secret exists, but a deployed server with a missing or guessable
/// `JWT_SECRET` would silently serve unauthenticated traffic, so it must not start.
///
/// @param secret - Value read from `JWT_SECRET`, if any
/// @returns `Err` with an operator-facing reason when the secret is unusable
pub fn check_prod_jwt_secret(secret: Option<&str>) -> Result<(), String> {
    match secret {
        None => Err("JWT_SECRET is not set - refusing to start in production".into()),
        Some(value) if value.len() < MIN_JWT_SECRET_LEN => Err(format!(
            "JWT_SECRET must be at least {MIN_JWT_SECRET_LEN} characters in production (got {})",
            value.len()
        )),
        // The published template value must never reach production.
        Some(value) if value.starts_with("your_super_secure_jwt_secret") => {
            Err("JWT_SECRET is still the .env.example placeholder - refusing to start".into())
        }
        Some(_) => Ok(()),
    }
}

/// Resolve the directory holding `config.json`, `.env`, and `databases/`.
///
/// Uses `SKATEBOARD_BACKEND_DIR` when set (tests and containers), otherwise the
/// directory containing the running executable's parent project — falling back
/// to the current working directory, which is what `cargo run` and the
/// production image both provide.
pub fn backend_dir() -> PathBuf {
    if let Some(dir) = env_nonempty("SKATEBOARD_BACKEND_DIR") {
        return PathBuf::from(dir);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cwd.join("config.json").is_file() {
        return cwd;
    }
    // `cargo run --manifest-path backend/Cargo.toml` from the repo root.
    let nested = cwd.join("backend");
    if nested.join("config.json").is_file() {
        return nested;
    }
    cwd
}

// ==== LOGGER ====

/// Structured JSON logger.
///
/// Port of `createLogger`: pretty-printed JSON in development, compact JSON in
/// production, and `debug` suppressed in production. Errors and warnings go to
/// stderr; info and debug go to stdout, matching `console.error`/`console.warn`
/// versus `console.log`.
pub struct Logger {
    prod: AtomicBool,
}

impl Logger {
    /// Create a logger for the given mode.
    pub fn new(prod: bool) -> Logger {
        Logger { prod: AtomicBool::new(prod) }
    }

    /// Whether production formatting is active.
    fn is_prod(&self) -> bool {
        self.prod.load(Ordering::Relaxed)
    }

    /// Log at ERROR to stderr.
    pub fn error(&self, message: &str, meta: &[(&str, Json)]) {
        self.emit("ERROR", message, meta, true);
    }

    /// Log at WARN to stderr.
    pub fn warn(&self, message: &str, meta: &[(&str, Json)]) {
        self.emit("WARN", message, meta, true);
    }

    /// Log at INFO to stdout.
    pub fn info(&self, message: &str, meta: &[(&str, Json)]) {
        self.emit("INFO", message, meta, false);
    }

    /// Log at DEBUG to stdout. Suppressed entirely in production.
    pub fn debug(&self, message: &str, meta: &[(&str, Json)]) {
        if self.is_prod() {
            return;
        }
        self.emit("DEBUG", message, meta, false);
    }

    fn emit(&self, level: &str, message: &str, meta: &[(&str, Json)], to_stderr: bool) {
        let mut map = std::collections::BTreeMap::new();
        map.insert("level".to_string(), Json::Str(level.to_string()));
        map.insert("timestamp".to_string(), Json::Str(iso_now()));
        map.insert("message".to_string(), Json::Str(message.to_string()));
        for (k, v) in meta {
            map.insert((*k).to_string(), v.clone());
        }
        let entry = Json::Obj(map);
        let line = if self.is_prod() {
            json::stringify(&entry)
        } else {
            pretty(&entry, 0)
        };
        if to_stderr {
            eprintln!("{line}");
        } else {
            println!("{line}");
        }
    }
}

/// Two-space-indented JSON, matching `JSON.stringify(entry, null, 2)`.
fn pretty(v: &Json, depth: usize) -> String {
    let pad = "  ".repeat(depth + 1);
    let close_pad = "  ".repeat(depth);
    match v {
        Json::Obj(m) if !m.is_empty() => {
            let body: Vec<String> = m
                .iter()
                .map(|(k, val)| format!("{pad}{}: {}", json::stringify(&Json::Str(k.clone())), pretty(val, depth + 1)))
                .collect();
            format!("{{\n{}\n{close_pad}}}", body.join(",\n"))
        }
        Json::Arr(items) if !items.is_empty() => {
            let body: Vec<String> = items.iter().map(|it| format!("{pad}{}", pretty(it, depth + 1))).collect();
            format!("[\n{}\n{close_pad}]", body.join(",\n"))
        }
        other => json::stringify(other),
    }
}

/// Milliseconds since the Unix epoch.
///
/// Equivalent to JavaScript's `Date.now()`. A clock before the epoch is
/// clamped to 0 rather than panicking.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Seconds since the Unix epoch, floored — equivalent to
/// `Math.floor(Date.now() / 1000)`.
pub fn now_secs() -> i64 {
    now_ms().div_euclid(1000)
}

/// Current time as an ISO-8601 UTC string with milliseconds,
/// e.g. `2026-09-14T12:34:56.789Z` — matching `new Date().toISOString()`.
pub fn iso_now() -> String {
    iso_from_ms(now_ms())
}

/// Format epoch milliseconds as `YYYY-MM-DDTHH:MM:SS.sssZ`.
///
/// Hand-rolled civil-from-days conversion (Howard Hinnant's algorithm) so no
/// date crate is needed. Handles negative timestamps correctly.
pub fn iso_from_ms(ms: i64) -> String {
    let (days, rem_ms) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    let (y, m, d) = civil_from_days(days);
    let secs_of_day = rem_ms / 1000;
    let millis = rem_ms % 1000;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y,
        m,
        d,
        secs_of_day / 3600,
        (secs_of_day % 3600) / 60,
        secs_of_day % 60,
        millis
    )
}

/// Format epoch **seconds** as an ISO-8601 UTC string with milliseconds.
///
/// Stripe period ends are in seconds; the Node server renders them with
/// `new Date(expires * 1000).toISOString()`.
pub fn iso_from_secs(secs: i64) -> String {
    iso_from_ms(secs * 1000)
}

/// Convert days since the Unix epoch to a proleptic Gregorian `(year, month, day)`.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn log() -> Logger {
        Logger::new(true)
    }

    #[test]
    fn prod_jwt_secret_accepts_a_long_random_value() {
        assert!(check_prod_jwt_secret(Some(&"a".repeat(MIN_JWT_SECRET_LEN))).is_ok());
    }

    #[test]
    fn prod_jwt_secret_rejects_a_missing_value() {
        assert!(check_prod_jwt_secret(None).is_err());
    }

    #[test]
    fn prod_jwt_secret_rejects_a_short_value() {
        assert!(check_prod_jwt_secret(Some("too-short")).is_err());
    }

    #[test]
    fn prod_jwt_secret_rejects_the_example_placeholder() {
        let placeholder = "your_super_secure_jwt_secret_here_make_it_long_and_random";
        assert!(check_prod_jwt_secret(Some(placeholder)).is_err());
    }

    #[test]
    fn iso_matches_known_timestamps() {
        assert_eq!(iso_from_ms(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_from_ms(1_000), "1970-01-01T00:00:01.000Z");
        // 2026-09-14T00:00:00.000Z
        assert_eq!(iso_from_ms(1_789_344_000_000), "2026-09-14T00:00:00.000Z");
        // Leap day.
        assert_eq!(iso_from_ms(1_709_164_800_000), "2024-02-29T00:00:00.000Z");
    }

    #[test]
    fn iso_handles_pre_epoch() {
        assert_eq!(iso_from_ms(-1), "1969-12-31T23:59:59.999Z");
    }

    #[test]
    fn strips_quotes_like_node() {
        assert_eq!(strip_quotes("\"abc\""), "abc");
        assert_eq!(strip_quotes("'abc'"), "abc");
        assert_eq!(strip_quotes("abc"), "abc");
        assert_eq!(strip_quotes("\""), ""); // Node `/^["']|["']$/g` strips a lone quote.
    }

    #[test]
    fn parses_env_pairs_with_equals_in_value() {
        let dir = std::env::temp_dir().join(format!("sk-env-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(".env");
        std::fs::write(&p, "# comment\nA=1\nB=a=b\nC=\n\nD=\"quoted\"\n").unwrap();
        let m = parse_env_file(&p, &log()).unwrap();
        assert_eq!(m.get("A").map(String::as_str), Some("1"));
        assert_eq!(m.get("B").map(String::as_str), Some("a=b"));
        assert_eq!(m.get("C").map(String::as_str), Some(""));
        assert_eq!(m.get("D").map(String::as_str), Some("quoted"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn leaves_unset_placeholders_in_place() {
        let out = resolve_env_placeholders("./db/${SK_NOT_SET_XYZ}.db", &log());
        assert_eq!(out, "./db/${SK_NOT_SET_XYZ}.db");
    }

    #[test]
    fn expands_set_placeholders() {
        std::env::set_var("SK_TEST_PLACEHOLDER", "value");
        let out = resolve_env_placeholders("a/${SK_TEST_PLACEHOLDER}/b", &log());
        assert_eq!(out, "a/value/b");
        std::env::remove_var("SK_TEST_PLACEHOLDER");
    }

    #[test]
    fn missing_config_falls_back_to_defaults() {
        let cfg = load_config(Path::new("/nonexistent-skateboard-dir"), &log());
        assert_eq!(cfg.static_dir, "../dist");
        assert_eq!(cfg.database.db_type, "sqlite");
    }

    #[test]
    fn load_stripe_lookup_keys_reads_constants() {
        let n = std::process::id();
        let root = std::env::temp_dir().join(format!("sk-keys-{n}"));
        let backend = root.join("backend");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(&backend).unwrap();
        std::fs::write(
            root.join("src/constants.json"),
            r#"{"stripeProducts":[{"lookup_key":"pro_monthly"},{"lookup_key":" "},{"title":"x"}]}"#,
        )
        .unwrap();
        let keys = load_stripe_lookup_keys(&backend);
        assert_eq!(keys, vec!["pro_monthly".to_string()]);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn load_stripe_lookup_keys_missing_file_is_empty() {
        assert!(load_stripe_lookup_keys(Path::new("/nonexistent-skateboard-dir")).is_empty());
    }
}

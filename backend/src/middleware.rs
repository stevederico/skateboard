//! Cross-cutting request middleware: CORS, security headers, request logging.
//!
//! Each function reproduces the exact wire behavior of the Hono middleware it
//! replaces (`hono/cors`, `hono/secure-headers`, and the Apache-format logger
//! in `server.ts`), because the parity harness diffs real responses.

use crate::config::{self, Logger};
use crate::http::{Request, Response};
use crate::json::Json;

/// Methods advertised on a CORS preflight, in the order `server.ts` lists them.
const ALLOW_METHODS: &str = "GET,POST,PUT,DELETE,OPTIONS";
/// Request headers accepted cross-origin.
const ALLOW_HEADERS: &str = "Content-Type,Authorization,x-csrf-token";

/// Apply CORS response headers for a non-preflight request.
///
/// `Access-Control-Allow-Origin` is echoed only for an allow-listed origin; a
/// disallowed origin still gets a normal response without that header, which
/// is what `hono/cors` does (it never rejects with 403). Credentials are always
/// advertised, and `Vary: Origin` is appended because the response varies by
/// origin.
pub fn apply_cors(res: Response, req: &Request, allowed: &[String]) -> Response {
    let mut out = res;
    if let Some(origin) = req.header("origin") {
        if allowed.iter().any(|a| a == origin) {
            out = out.set_header("Access-Control-Allow-Origin", origin);
        }
    }
    out = out.set_header("Access-Control-Allow-Credentials", "true");
    out.header("Vary", "Origin")
}

/// Build the 204 response for a CORS preflight.
///
/// `hono/cors` short-circuits `OPTIONS` before any later middleware runs, so
/// the preflight carries **no** security headers and no body — replicated here
/// deliberately.
pub fn preflight(req: &Request, allowed: &[String]) -> Response {
    let mut res = Response::empty(204);
    if let Some(origin) = req.header("origin") {
        if allowed.iter().any(|a| a == origin) {
            res = res.set_header("Access-Control-Allow-Origin", origin);
        }
    }
    res.set_header("Access-Control-Allow-Credentials", "true")
        .set_header("Vary", "Origin")
        .set_header("Access-Control-Allow-Methods", ALLOW_METHODS)
        .set_header("Access-Control-Allow-Headers", ALLOW_HEADERS)
        .header("Vary", "Access-Control-Request-Headers")
}

/// Content-Security-Policy value assembled from the `server.ts` directive list.
///
/// Kept as one literal rather than rebuilt from a map: the directive order is
/// part of the header bytes, and there is exactly one policy.
const CSP: &str = "default-src 'self'; \
script-src 'self'; \
style-src 'self' 'unsafe-inline'; \
img-src 'self' https:; \
font-src 'self'; \
connect-src 'self'; \
frame-ancestors 'none'";

/// Permissions-Policy value: every listed feature disabled.
const PERMISSIONS_POLICY: &str = "camera=(), microphone=(), geolocation=(), payment=()";

/// HSTS value used in production. Omitted entirely outside production, matching
/// `strictTransportSecurity: false` in the dev branch of the Hono options.
const HSTS: &str = "max-age=31536000; includeSubDomains; preload";

/// Apply the security headers `hono/secure-headers` emits for this config.
///
/// Includes the Hono defaults the server does not override
/// (`Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`, and friends), so
/// the header set matches the Node server exactly.
pub fn apply_secure_headers(res: Response, prod: bool) -> Response {
    let mut out = res
        .set_header("Cross-Origin-Resource-Policy", "same-origin")
        .set_header("Cross-Origin-Opener-Policy", "same-origin")
        .set_header("Origin-Agent-Cluster", "?1")
        .set_header("Referrer-Policy", "strict-origin-when-cross-origin")
        .set_header("X-Content-Type-Options", "nosniff")
        .set_header("X-DNS-Prefetch-Control", "off")
        .set_header("X-Download-Options", "noopen")
        .set_header("X-Frame-Options", "DENY")
        .set_header("X-Permitted-Cross-Domain-Policies", "none")
        .set_header("X-XSS-Protection", "0");
    if prod {
        out = out.set_header("Strict-Transport-Security", HSTS);
    }
    out.set_header("Content-Security-Policy", CSP)
        .set_header("Permissions-Policy", PERMISSIONS_POLICY)
}

/// Emit the Apache-style access log line the Node server writes to stdout.
///
/// Format: `[YYYY-MM-DD HH:MM:SS] "METHOD /path" STATUS (Nms)`. The timestamp
/// is UTC with the milliseconds and trailing `Z` stripped, matching
/// `toISOString().replace('T',' ').replace(/\.\d{3}Z$/,'')`.
pub fn access_log(method: &str, path: &str, status: u16, duration_ms: i64) {
    let iso = config::iso_now();
    let stamp = iso.replacen('T', " ", 1);
    let stamp = stamp.split('.').next().unwrap_or(&stamp);
    println!("[{stamp}] \"{method} {path}\" {status} ({duration_ms}ms)");
}

/// Log a received request at DEBUG outside production.
///
/// The Node middleware attaches a random request id; that id appears only in
/// logs, never in a response, so a simple counter-free random suffix is used.
pub fn dev_request_log(log: &Logger, req: &Request, prod: bool) {
    if prod {
        return;
    }
    log.debug(
        "Request received",
        &[
            ("method", Json::Str(req.method.clone())),
            ("path", Json::Str(req.path.clone())),
            ("requestId", Json::Str(request_id())),
        ],
    );
}

/// A short opaque id for correlating log lines.
///
/// Mirrors `Math.random().toString(36).substr(2, 9)` in shape (9 base-36
/// characters). Log correlation only — never used for anything security
/// relevant, so a cheap non-cryptographic source is fine.
pub fn request_id() -> String {
    // Cheap, allocation-free entropy from the clock plus the thread id; a
    // collision only makes two log lines share a tag.
    let ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    let mut x = ns ^ (std::thread::current().id().as_u64_fallback() << 32);
    let mut out = String::with_capacity(9);
    for _ in 0..9 {
        // xorshift keeps successive characters from repeating.
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let digit = (x % 36) as u32;
        out.push(char::from_digit(digit, 36).unwrap_or('0'));
    }
    out
}

/// Extension used to get a numeric value out of a `ThreadId` without the
/// unstable `as_u64` accessor.
trait ThreadIdFallback {
    fn as_u64_fallback(&self) -> u64;
}

impl ThreadIdFallback for std::thread::ThreadId {
    /// Hash the `ThreadId` to a `u64`. Only used to salt a log correlation id.
    fn as_u64_fallback(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        self.hash(&mut h);
        h.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(origin: Option<&str>) -> Request {
        let mut r = Request::for_test("GET", "/api/health");
        if let Some(o) = origin {
            r.set_test_header("origin", o);
        }
        r
    }

    fn allowed() -> Vec<String> {
        vec!["http://localhost:5173".to_string()]
    }

    fn header<'a>(res: &'a Response, name: &str) -> Option<&'a str> {
        res.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    #[test]
    fn echoes_allowed_origin() {
        let res = apply_cors(Response::empty(200), &req(Some("http://localhost:5173")), &allowed());
        assert_eq!(header(&res, "Access-Control-Allow-Origin"), Some("http://localhost:5173"));
    }

    #[test]
    fn omits_origin_header_for_disallowed_origin_without_rejecting() {
        let res = apply_cors(Response::empty(200), &req(Some("https://evil.example")), &allowed());
        assert_eq!(header(&res, "Access-Control-Allow-Origin"), None);
        assert_eq!(res.status, 200, "hono/cors does not reject, it just withholds the header");
    }

    #[test]
    fn preflight_is_204_with_no_body() {
        let res = preflight(&req(Some("http://localhost:5173")), &allowed());
        assert_eq!(res.status, 204);
        assert!(res.body.is_empty());
        assert_eq!(header(&res, "Access-Control-Allow-Methods"), Some(ALLOW_METHODS));
        assert_eq!(header(&res, "Access-Control-Allow-Headers"), Some(ALLOW_HEADERS));
    }

    #[test]
    fn preflight_carries_no_security_headers() {
        let res = preflight(&req(Some("http://localhost:5173")), &allowed());
        assert_eq!(header(&res, "Content-Security-Policy"), None);
        assert_eq!(header(&res, "X-Frame-Options"), None);
    }

    #[test]
    fn hsts_only_in_production() {
        assert!(header(&apply_secure_headers(Response::empty(200), false), "Strict-Transport-Security").is_none());
        assert_eq!(
            header(&apply_secure_headers(Response::empty(200), true), "Strict-Transport-Security"),
            Some(HSTS)
        );
    }

    #[test]
    fn csp_matches_the_hono_directive_order() {
        let res = apply_secure_headers(Response::empty(200), false);
        assert_eq!(
            header(&res, "Content-Security-Policy"),
            Some("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        );
    }

    #[test]
    fn request_ids_are_nine_base36_chars() {
        let id = request_id();
        assert_eq!(id.len(), 9);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    }
}

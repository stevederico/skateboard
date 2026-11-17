use crate::config::{self, Logger};
use crate::http::{Request, Response};
use crate::json::Json;

const ALLOW_METHODS: &str = "GET,POST,PUT,DELETE,OPTIONS";
const ALLOW_HEADERS: &str = "Content-Type,Authorization,x-csrf-token";

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

const CSP: &str = "default-src 'self'; \
script-src 'self'; \
style-src 'self' 'unsafe-inline'; \
img-src 'self' https:; \
font-src 'self'; \
connect-src 'self'; \
frame-ancestors 'none'";

const PERMISSIONS_POLICY: &str = "camera=(), microphone=(), geolocation=(), payment=()";

const HSTS: &str = "max-age=31536000; includeSubDomains; preload";

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

pub fn access_log(method: &str, path: &str, status: u16, duration_ms: i64) {
    let iso = config::iso_now();
    let stamp = iso.replacen('T', " ", 1);
    let stamp = stamp.split('.').next().unwrap_or(&stamp);
    println!("[{stamp}] \"{method} {path}\" {status} ({duration_ms}ms)");
}

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

pub fn request_id() -> String {
    let ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    let mut x = ns ^ (std::thread::current().id().as_u64_fallback() << 32);
    let mut out = String::with_capacity(9);
    for _ in 0..9 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let digit = (x % 36) as u32;
        out.push(char::from_digit(digit, 36).unwrap_or('0'));
    }
    out
}

trait ThreadIdFallback {
    fn as_u64_fallback(&self) -> u64;
}

impl ThreadIdFallback for std::thread::ThreadId {
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

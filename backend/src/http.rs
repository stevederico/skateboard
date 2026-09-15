//! Blocking HTTP/1.1 server built on `std::net::TcpListener` and a fixed-size
//! OS thread pool.
//!
//! Zero-crate replacement for the Node/Hono listener. There is no TLS here —
//! the process runs behind a TLS-terminating proxy, so this speaks cleartext
//! HTTP/1.1 only. One OS thread owns a connection for its whole keep-alive
//! lifetime; there is no async runtime and no `unsafe`.
//!
//! Scope, deliberately: HTTP/1.1 and HTTP/1.0 request framing with
//! `Content-Length` and `Transfer-Encoding: chunked` bodies. No HTTP/2, no
//! compression, no response streaming (a handler returns a complete body), no
//! `Upgrade`/WebSocket, and no trailer exposure (trailers are read and
//! discarded).

use std::io::{BufRead, BufReader, ErrorKind, Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// ==== HEADERS ====

/// Request headers, in the order they arrived.
///
/// Field names are matched case-insensitively (RFC 7230 §3.2); duplicates are
/// preserved rather than merged, so `Set-Cookie`-style repeated fields survive
/// a round trip.
#[derive(Debug, Clone, Default)]
pub struct Headers(Vec<(String, String)>);

impl Headers {
    /// Build a header set from raw name/value pairs, preserving order.
    ///
    /// Mainly for tests and for callers that synthesize a request.
    pub fn from_pairs(pairs: Vec<(String, String)>) -> Self {
        Headers(pairs)
    }

    /// First value for `name`, matched case-insensitively. `None` when absent.
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    /// Every value for `name`, in arrival order. Empty when absent.
    pub fn get_all(&self, name: &str) -> Vec<&str> {
        self.0
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
            .collect()
    }

    /// Iterate every (name, value) pair in arrival order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> + '_ {
        self.0.iter().map(|(k, v)| (k.as_str(), v.as_str()))
    }

    /// Number of header lines received.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// True when no headers were received.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Append a header, preserving existing fields of the same name.
    pub fn append(&mut self, name: &str, value: &str) {
        self.0.push((name.to_string(), value.to_string()));
    }
}

// ==== REQUEST ====

/// A fully-read HTTP request.
///
/// The body is buffered in memory and bounded by [`Config::max_body_bytes`],
/// so handlers never have to deal with partial reads.
#[derive(Debug, Clone)]
pub struct Request {
    /// Request method, upper-cased (e.g. `"GET"`).
    pub method: String,
    /// Percent-decoded path, without the query string.
    pub path: String,
    /// Path exactly as received: still percent-encoded, no query string.
    pub raw_path: String,
    /// Raw query string, without the leading `?`. Empty when there is none.
    pub query: String,
    /// Request headers.
    pub headers: Headers,
    /// Request body bytes. Empty when the request had no body.
    pub body: Vec<u8>,
    /// IP address of the peer socket, or empty when it could not be read.
    ///
    /// This is the *transport* peer, not a forwarded client address: it is
    /// taken from the socket and cannot be spoofed by a header, which is what
    /// makes it usable for abuse accounting. Behind a proxy every request will
    /// share the proxy's address, so treat it as a coarse bucket rather than a
    /// client identity.
    pub peer_ip: String,
}

impl Request {
    /// First value of header `name`, matched case-insensitively.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name)
    }

    /// Percent-decoded value of cookie `name` from the `Cookie` header.
    ///
    /// Cookie names are matched case-sensitively, per RFC 6265. Returns `None`
    /// when there is no `Cookie` header or the name is absent.
    pub fn cookie(&self, name: &str) -> Option<String> {
        let raw = self.headers.get("cookie")?;
        for pair in raw.split(';') {
            let pair = pair.trim();
            let (k, v) = pair.split_once('=')?;
            if k.trim() == name {
                return Some(percent_decode(v.trim(), false));
            }
        }
        None
    }

    /// Percent-decoded value of query parameter `name`.
    ///
    /// Applies form decoding: `+` becomes a space. Returns the first match when
    /// a parameter repeats, and `Some("")` for a valueless key (`?flag`).
    pub fn query_param(&self, name: &str) -> Option<String> {
        for pair in self.query.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            if percent_decode(k, true) == name {
                return Some(percent_decode(v, true));
            }
        }
        None
    }

    /// Build a request for unit tests. Path is used as both decoded and raw.
    #[cfg(test)]
    pub fn for_test(method: &str, path: &str) -> Self {
        Request {
            method: method.to_string(),
            path: path.to_string(),
            raw_path: path.to_string(),
            query: String::new(),
            headers: Headers::default(),
            body: Vec::new(),
            peer_ip: String::new(),
        }
    }

    /// Append a header on a test request.
    #[cfg(test)]
    pub fn set_test_header(&mut self, name: &str, value: &str) {
        self.headers.append(name, value);
    }

    /// Replace the body on a test request.
    #[cfg(test)]
    pub fn set_test_body(&mut self, body: impl Into<Vec<u8>>) {
        self.body = body.into();
    }
}

// ==== RESPONSE ====

/// A complete HTTP response produced by a handler.
///
/// `Date`, `Connection` and `Content-Length` are written by the server; any
/// copies a handler puts in `headers` are dropped so the wire framing stays
/// authoritative.
#[derive(Debug, Clone)]
pub struct Response {
    /// HTTP status code.
    pub status: u16,
    /// Response headers, in the order they will be written.
    pub headers: Vec<(String, String)>,
    /// Response body. Empty for bodyless statuses.
    pub body: Vec<u8>,
}

impl Response {
    /// An empty response with `status` and no headers.
    pub fn new(status: u16) -> Self {
        Response {
            status,
            headers: Vec::new(),
            body: Vec::new(),
        }
    }

    /// A JSON response. Sets `Content-Type: application/json`.
    pub fn json(status: u16, body: &str) -> Self {
        Response::bytes(status, "application/json", body.as_bytes().to_vec())
    }

    /// A plain-text response. Sets `Content-Type: text/plain; charset=UTF-8`.
    pub fn text(status: u16, body: &str) -> Self {
        Response::bytes(
            status,
            "text/plain; charset=UTF-8",
            body.as_bytes().to_vec(),
        )
    }

    /// An HTML response. Sets `Content-Type: text/html; charset=UTF-8`.
    pub fn html(status: u16, body: &str) -> Self {
        Response::bytes(status, "text/html; charset=UTF-8", body.as_bytes().to_vec())
    }

    /// A response with an explicit content type and raw body bytes.
    pub fn bytes(status: u16, content_type: &str, body: Vec<u8>) -> Self {
        Response {
            status,
            headers: vec![("Content-Type".to_string(), content_type.to_string())],
            body,
        }
    }

    /// A response with no body and no content type (e.g. 204, 304).
    pub fn empty(status: u16) -> Self {
        Response::new(status)
    }

    /// Append a header, keeping any existing field of the same name.
    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    /// Set a header, removing every existing field of the same name first.
    pub fn set_header(mut self, name: &str, value: &str) -> Self {
        self.headers.retain(|(k, _)| !k.eq_ignore_ascii_case(name));
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    /// Append a `Set-Cookie` header for `c`.
    pub fn cookie(self, c: &Cookie) -> Self {
        let v = c.to_header_value();
        self.header("Set-Cookie", &v)
    }
}

// ==== COOKIES ====

/// `SameSite` cookie attribute.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SameSite {
    Strict,
    Lax,
    None,
}

impl SameSite {
    /// Attribute spelling as it appears on the wire.
    fn as_str(self) -> &'static str {
        match self {
            SameSite::Strict => "Strict",
            SameSite::Lax => "Lax",
            SameSite::None => "None",
        }
    }
}

/// A cookie to serialize into a `Set-Cookie` header.
///
/// Attribute order and casing match Hono's `setCookie`/`deleteCookie` output so
/// responses byte-match the Node backend.
#[derive(Debug, Clone)]
pub struct Cookie {
    /// Cookie name, written verbatim.
    pub name: String,
    /// Cookie value; URL-encoded on serialization.
    pub value: String,
    /// Emit the `HttpOnly` attribute.
    pub http_only: bool,
    /// Emit the `Secure` attribute.
    pub secure: bool,
    /// `SameSite` attribute; always emitted.
    pub same_site: SameSite,
    /// `Path` attribute; omitted when empty.
    pub path: String,
    /// `Max-Age` in seconds. `Some(0)` with an empty value deletes the cookie.
    pub max_age: Option<i64>,
}

impl Cookie {
    /// A cookie with Hono's defaults: `Path=/`, `SameSite=Lax`, not secure,
    /// not HttpOnly, no `Max-Age`.
    pub fn new(name: &str, value: &str) -> Self {
        Cookie {
            name: name.to_string(),
            value: value.to_string(),
            http_only: false,
            secure: false,
            same_site: SameSite::Lax,
            path: "/".to_string(),
            max_age: None,
        }
    }

    /// Serialize to a `Set-Cookie` field value.
    ///
    /// Order is `name=value; Max-Age=N; Path=/; HttpOnly; Secure; SameSite=X`,
    /// with unset attributes omitted. The value is URL-encoded the way
    /// `encodeURIComponent` encodes it.
    pub fn to_header_value(&self) -> String {
        let mut out = String::with_capacity(64);
        out.push_str(&self.name);
        out.push('=');
        out.push_str(&percent_encode_component(&self.value));
        if let Some(age) = self.max_age {
            out.push_str("; Max-Age=");
            out.push_str(&age.to_string());
        }
        if !self.path.is_empty() {
            out.push_str("; Path=");
            out.push_str(&self.path);
        }
        if self.http_only {
            out.push_str("; HttpOnly");
        }
        if self.secure {
            out.push_str("; Secure");
        }
        out.push_str("; SameSite=");
        out.push_str(self.same_site.as_str());
        out
    }
}

// ==== PERCENT ENCODING ====

/// Percent-decode `s`.
///
/// A malformed escape (`%` not followed by two hex digits) is passed through
/// literally, matching how browsers and Node's `URL` recover. Bytes that do not
/// form valid UTF-8 after decoding become U+FFFD. When `plus_as_space` is true,
/// `+` decodes to a space (form encoding) — pass false for paths and cookies.
pub fn percent_decode(s: &str, plus_as_space: bool) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => match (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                (Some(h), Some(l)) => {
                    out.push((h << 4) | l);
                    i += 3;
                }
                _ => {
                    out.push(b'%');
                    i += 1;
                }
            },
            b'+' if plus_as_space => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Percent-encode `s` the way JavaScript's `encodeURIComponent` does.
///
/// Leaves `A-Z a-z 0-9 - _ . ! ~ * ' ( )` unescaped; everything else becomes
/// `%XX` over the UTF-8 bytes.
pub fn percent_encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &byte in s.as_bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(byte as char),
            _ => {
                out.push('%');
                out.push(HEX[(byte >> 4) as usize] as char);
                out.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }
    out
}

/// Upper-case hex digits, used by [`percent_encode_component`].
const HEX: &[u8; 16] = b"0123456789ABCDEF";

/// Numeric value of one ASCII hex digit, or `None` when it is not one.
fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

// ==== SERVER CONFIG ====

/// Server tuning knobs.
///
/// The byte limits are the only defence against a hostile client in this
/// process; everything else (TLS, IP filtering) lives in the proxy in front.
#[derive(Debug, Clone)]
pub struct Config {
    /// TCP port to bind. `0` asks the OS for a free port (used by tests).
    pub port: u16,
    /// Worker threads. Each owns one connection at a time.
    pub threads: usize,
    /// Per-read socket timeout; a floor under the wall-clock budgets below.
    pub read_timeout: Duration,
    /// Per-write socket timeout.
    pub write_timeout: Duration,
    /// Wall-clock cap for reading one request line, headers, and body.
    ///
    /// `read_timeout` is per syscall, so a client that dribbles one byte just
    /// inside that window can pin a worker forever. This budget is absolute.
    pub request_timeout: Duration,
    /// Wall-clock cap for an idle keep-alive wait between requests.
    pub idle_timeout: Duration,
    /// Largest accepted request body. Larger requests get 413.
    pub max_body_bytes: usize,
    /// Largest accepted request line + header block. Larger gets 431.
    pub max_header_bytes: usize,
    /// Connections that may sit accepted-but-unhandled before new ones are
    /// shed.
    ///
    /// Every queued connection holds a file descriptor and its kernel buffers
    /// while doing nothing. With an unbounded queue, a client opening
    /// connections faster than the workers drain them makes the process
    /// accumulate descriptors until it hits `EMFILE`, at which point it cannot
    /// accept *any* connection, including from healthy clients. Shedding at a
    /// fixed depth keeps that failure local to the excess traffic.
    pub max_queued_connections: usize,
}

impl Default for Config {
    /// Port 8000, `available_parallelism() * 4` threads (minimum 8), 30s
    /// socket timeouts, 15s per-request wall clock, 30s keep-alive idle, 2 MiB
    /// body cap, 32 KiB header cap, and an intake queue eight deep per worker.
    fn default() -> Self {
        let cores = thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
        let threads = (cores * 4).max(8);
        Config {
            port: 8000,
            threads,
            read_timeout: Duration::from_secs(30),
            write_timeout: Duration::from_secs(30),
            request_timeout: Duration::from_secs(15),
            idle_timeout: Duration::from_secs(30),
            max_body_bytes: 2 * 1024 * 1024,
            max_header_bytes: 32 * 1024,
            max_queued_connections: threads * 8,
        }
    }
}

// ==== SERVER ====

/// Shared state between the acceptor, the workers and the shutdown path.
struct Inner {
    /// Address the listener actually bound, used to wake `accept`.
    addr: SocketAddr,
    /// Set once shutdown has been triggered.
    stop: AtomicBool,
    /// Mirror of `stop` for `wait`, which needs a condvar predicate.
    signalled: Mutex<bool>,
    /// Notified when shutdown is triggered.
    signal_cv: Condvar,
    /// Worker threads that have not yet returned.
    live: Mutex<usize>,
    /// Notified each time a worker returns.
    live_cv: Condvar,
}

/// Trigger shutdown: flip the flag, wake a blocked `accept`, wake `wait`.
///
/// Idempotent — a second call does nothing.
fn trigger(inner: &Inner) {
    if inner.stop.swap(true, Ordering::SeqCst) {
        return;
    }
    // `accept` has no timeout in std, so unblock it with a throwaway connection.
    for addr in wake_addrs(inner.addr) {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            break;
        }
    }
    let mut g = lock(&inner.signalled);
    *g = true;
    inner.signal_cv.notify_all();
}

/// Addresses that will reach our own listener, most likely first.
///
/// A wildcard bind is not connectable as-is, so substitute the loopback of the
/// same family and fall back to the other family for dual-stack sockets.
fn wake_addrs(addr: SocketAddr) -> Vec<SocketAddr> {
    if !addr.ip().is_unspecified() {
        return vec![addr];
    }
    let port = addr.port();
    match addr.ip() {
        IpAddr::V6(_) => vec![
            SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), port),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        ],
        IpAddr::V4(_) => vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)],
    }
}

/// Lock a mutex, recovering from a poisoned lock rather than panicking.
///
/// A panicking worker must not take the whole server down; the state behind
/// these mutexes is a counter and a bool, both meaningful after a panic.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Decrements [`Inner::live`] when a worker thread exits, including on unwind.
struct LiveGuard {
    inner: Arc<Inner>,
}

impl Drop for LiveGuard {
    fn drop(&mut self) {
        let mut live = lock(&self.inner.live);
        *live = live.saturating_sub(1);
        self.inner.live_cv.notify_all();
    }
}

/// A running server. Dropping it triggers shutdown without waiting.
pub struct Server {
    inner: Arc<Inner>,
}

/// Trigger handle for stopping a [`Server`] from another thread.
///
/// Cheap to clone and safe to call from a signal-handling thread.
#[derive(Clone)]
pub struct ShutdownHandle {
    inner: Arc<Inner>,
}

impl ShutdownHandle {
    /// Trigger shutdown. Returns immediately; idempotent.
    pub fn shutdown(&self) {
        trigger(&self.inner);
    }
}

impl Server {
    /// Address the listener bound, with the OS-assigned port resolved.
    pub fn local_addr(&self) -> SocketAddr {
        self.inner.addr
    }

    /// A handle that can trigger shutdown from another thread.
    pub fn handle(&self) -> ShutdownHandle {
        ShutdownHandle {
            inner: Arc::clone(&self.inner),
        }
    }

    /// Block until shutdown is triggered from another thread.
    pub fn wait(&self) {
        let mut g = lock(&self.inner.signalled);
        while !*g {
            g = self
                .inner
                .signal_cv
                .wait(g)
                .unwrap_or_else(|e| e.into_inner());
        }
    }

    /// Stop accepting, let in-flight requests finish, then return.
    ///
    /// Returns once every worker has exited or `grace` has elapsed, whichever
    /// comes first — a worker stuck in a handler is abandoned, not joined.
    /// An idle keep-alive connection delays its worker by at most
    /// [`Config::read_timeout`].
    pub fn shutdown(self, grace: Duration) {
        trigger(&self.inner);
        let deadline = std::time::Instant::now() + grace;
        let mut live = lock(&self.inner.live);
        while *live > 0 {
            let now = std::time::Instant::now();
            if now >= deadline {
                break;
            }
            let (g, timed_out) = self
                .inner
                .live_cv
                .wait_timeout(live, deadline - now)
                .unwrap_or_else(|e| e.into_inner());
            live = g;
            if timed_out.timed_out() {
                break;
            }
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        trigger(&self.inner);
    }
}

/// Bind a listener, preferring a dual-stack `[::]` socket.
///
/// On Linux and macOS an `AF_INET6` wildcard socket accepts IPv4 connections as
/// mapped addresses by default, which is what we want. Setting `IPV6_V6ONLY`
/// explicitly needs libc, so instead we simply fall back to `0.0.0.0` when the
/// IPv6 bind fails (IPv6 disabled in the container).
fn bind(port: u16) -> std::io::Result<TcpListener> {
    match TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)) {
        Ok(l) => Ok(l),
        Err(_) => TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)),
    }
}

/// Start the server and return as soon as the listener is bound.
///
/// Accepting runs on a background thread and each connection is handed to a
/// fixed pool of `cfg.threads` workers; `handler` is called once per request
/// and may be entered concurrently, hence the `Send + Sync` bound. A panic
/// inside `handler` is caught and answered with 500. A panic in the parser is
/// caught around `handle_connection` so it cannot shrink the pool.
///
/// # Errors
/// Returns the underlying `io::Error` when the port cannot be bound.
pub fn serve<F>(cfg: Config, handler: F) -> std::io::Result<Server>
where
    F: Fn(Request) -> Response + Send + Sync + 'static,
{
    let listener = bind(cfg.port)?;
    let addr = listener.local_addr()?;
    let threads = cfg.threads.max(1);

    let inner = Arc::new(Inner {
        addr,
        stop: AtomicBool::new(false),
        signalled: Mutex::new(false),
        signal_cv: Condvar::new(),
        live: Mutex::new(threads),
        live_cv: Condvar::new(),
    });

    let (tx, rx) = mpsc::sync_channel::<TcpStream>(cfg.max_queued_connections.max(1));
    let rx = Arc::new(Mutex::new(rx));
    let handler = Arc::new(handler);

    for _ in 0..threads {
        let rx = Arc::clone(&rx);
        let handler = Arc::clone(&handler);
        let inner = Arc::clone(&inner);
        let cfg = cfg.clone();
        thread::spawn(move || {
            let _guard = LiveGuard {
                inner: Arc::clone(&inner),
            };
            loop {
                // Hold the receiver lock only while dequeuing.
                let job = lock(&rx).recv();
                match job {
                    Ok(stream) => {
                        let _ = catch_unwind(AssertUnwindSafe(|| {
                            handle_connection(&cfg, handler.as_ref(), &inner, stream)
                        }));
                    }
                    Err(_) => break,
                }
            }
        });
    }

    {
        let inner = Arc::clone(&inner);
        thread::spawn(move || {
            for stream in listener.incoming() {
                if inner.stop.load(Ordering::SeqCst) {
                    break;
                }
                match stream {
                    // Shed rather than block: blocking here would stop
                    // draining the listen backlog, so a flood would also
                    // stall clients that the workers could still serve.
                    // Dropping closes the socket immediately and frees the
                    // descriptor, which is the whole point of the bound.
                    Ok(s) => match tx.try_send(s) {
                        Ok(()) => {}
                        Err(mpsc::TrySendError::Full(shed)) => drop(shed),
                        Err(mpsc::TrySendError::Disconnected(_)) => break,
                    },
                    // A per-connection error (RST during handshake, EMFILE)
                    // must not kill the accept loop.
                    Err(_) => continue,
                }
            }
            drop(tx); // releases every worker blocked in `recv`
        });
    }

    Ok(Server { inner })
}

// ==== CONNECTION HANDLING ====

/// A request that could not be parsed, and the status to answer with.
///
/// `status == 0` means "say nothing, just close" — used when the peer hung up
/// or the socket errored, where a response would go nowhere.
struct HttpError {
    status: u16,
    msg: &'static str,
}

impl HttpError {
    fn new(status: u16, msg: &'static str) -> Self {
        HttpError { status, msg }
    }

    /// Drop the connection without writing a response.
    fn close() -> Self {
        HttpError { status: 0, msg: "" }
    }
}

/// A parsed request plus the framing facts the response writer needs.
struct Parsed {
    req: Request,
    /// True for `HTTP/1.1`; false for `HTTP/1.0`.
    http_11: bool,
    /// Whether the client agreed to reuse this connection.
    keep_alive: bool,
}

/// Serve one connection until it closes, errors, or the server shuts down.
fn handle_connection<F>(cfg: &Config, handler: &F, inner: &Inner, stream: TcpStream)
where
    F: Fn(Request) -> Response + Send + Sync,
{
    let _ = stream.set_read_timeout(Some(cfg.read_timeout));
    let _ = stream.set_write_timeout(Some(cfg.write_timeout));
    let _ = stream.set_nodelay(true);

    let peer_ip = stream
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_default();

    let mut writer = match stream.try_clone() {
        Ok(w) => w,
        Err(_) => return,
    };
    let mut reader = BufReader::with_capacity(8 * 1024, stream);

    let mut first = true;
    loop {
        let head_timeout = if first {
            cfg.request_timeout
        } else {
            cfg.idle_timeout
        };
        first = false;
        match read_request(&mut reader, &mut writer, cfg, head_timeout) {
            Ok(None) => break, // clean close between requests
            Ok(Some(parsed)) => {
                #[cfg(test)]
                if parsed.req.path == "/__panic_worker" {
                    panic!("test: connection handler panic");
                }
                let Parsed {
                    mut req,
                    http_11,
                    keep_alive,
                } = parsed;
                req.peer_ip = peer_ip.clone();
                let head_only = req.method == "HEAD";
                let res = match catch_unwind(AssertUnwindSafe(|| handler(req))) {
                    Ok(r) => r,
                    // The panic message already went to stderr via the default
                    // hook; the worker thread survives to serve the next request.
                    Err(_) => Response::text(500, "Internal Server Error"),
                };
                let keep = keep_alive && !inner.stop.load(Ordering::SeqCst);
                if write_response(&mut writer, &res, head_only, keep, http_11).is_err() || !keep {
                    break;
                }
            }
            Err(e) => {
                if e.status != 0 {
                    let res = Response::text(e.status, e.msg);
                    let _ = write_response(&mut writer, &res, false, false, true);
                }
                break;
            }
        }
    }
    let _ = writer.flush();
}

/// Read and parse one request, or `Ok(None)` when the peer closed cleanly.
///
/// `writer` is only used to emit `100 Continue`.
///
/// # Errors
/// [`HttpError`] with the status to report: 400 malformed, 413 body too large,
/// 431 header block too large, 408 over the wall-clock budget, 501 unknown
/// transfer coding, 505 bad version, or 0 to close silently.
fn read_request(
    reader: &mut BufReader<TcpStream>,
    writer: &mut TcpStream,
    cfg: &Config,
    head_timeout: Duration,
) -> Result<Option<Parsed>, HttpError> {
    let mut used = 0usize;
    let mut line = Vec::new();
    let head_deadline = Instant::now() + head_timeout;

    // RFC 7230 §3.5: tolerate stray CRLFs before the request line.
    loop {
        let n = read_line_limited(
            reader,
            &mut line,
            &mut used,
            cfg.max_header_bytes,
            head_deadline,
            cfg.read_timeout,
            false,
        )?;
        if n == 0 {
            return Ok(None);
        }
        if !trim_eol(&line).is_empty() {
            break;
        }
    }

    let request_line = std::str::from_utf8(trim_eol(&line))
        .map_err(|_| HttpError::new(400, "Bad Request"))?
        .to_string();
    let mut parts = request_line.split(' ');
    let (method, target, version) = match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(m), Some(t), Some(v), None) if !m.is_empty() && !t.is_empty() => (m, t, v),
        _ => return Err(HttpError::new(400, "Bad Request")),
    };
    if !method.bytes().all(is_token_byte) {
        return Err(HttpError::new(400, "Bad Request"));
    }
    let http_11 = match version {
        "HTTP/1.1" => true,
        "HTTP/1.0" => false,
        _ => return Err(HttpError::new(505, "HTTP Version Not Supported")),
    };
    let (raw_path, path, query) = parse_target(target)?;

    let req_deadline = Instant::now() + cfg.request_timeout;

    // Header block.
    let mut fields: Vec<(String, String)> = Vec::new();
    loop {
        let n = read_line_limited(
            reader,
            &mut line,
            &mut used,
            cfg.max_header_bytes,
            req_deadline,
            cfg.read_timeout,
            true,
        )?;
        if n == 0 {
            return Err(HttpError::close()); // truncated header block
        }
        let raw = trim_eol(&line);
        if raw.is_empty() {
            break;
        }
        // Obsolete line folding is rejected rather than unfolded (RFC 7230 §3.2.4).
        if raw[0] == b' ' || raw[0] == b'\t' {
            return Err(HttpError::new(400, "Bad Request"));
        }
        let text = std::str::from_utf8(raw).map_err(|_| HttpError::new(400, "Bad Request"))?;
        let (name, value) = text
            .split_once(':')
            .ok_or_else(|| HttpError::new(400, "Bad Request"))?;
        if name.is_empty() || !name.bytes().all(is_token_byte) {
            return Err(HttpError::new(400, "Bad Request"));
        }
        fields.push((name.to_string(), value.trim().to_string()));
    }
    let headers = Headers(fields);

    let conn = headers.get("connection").unwrap_or("").to_ascii_lowercase();
    let has_token = |t: &str| conn.split(',').any(|x| x.trim() == t);
    let keep_alive = if has_token("close") {
        false
    } else if http_11 {
        true
    } else {
        has_token("keep-alive")
    };

    if headers
        .get("expect")
        .is_some_and(|e| e.eq_ignore_ascii_case("100-continue"))
    {
        let _ = writer.write_all(b"HTTP/1.1 100 Continue\r\n\r\n");
        let _ = writer.flush();
    }

    let body = read_body(reader, &headers, cfg, &mut used, req_deadline)?;

    Ok(Some(Parsed {
        req: Request {
            method: method.to_ascii_uppercase(),
            path,
            raw_path,
            query,
            headers,
            body,
            peer_ip: String::new(),
        },
        http_11,
        keep_alive,
    }))
}

/// Split a request target into (raw path, decoded path, query).
///
/// Accepts origin-form (`/a/b?c`), absolute-form (`http://host/a/b`, sent by
/// proxies) and asterisk-form (`*`, for `OPTIONS`).
///
/// # Errors
/// 400 when the target is not one of those forms, or when the decoded path
/// contains a NUL byte or a `..` segment (path traversal).
fn parse_target(target: &str) -> Result<(String, String, String), HttpError> {
    if target == "*" {
        return Ok(("*".to_string(), "*".to_string(), String::new()));
    }
    // Strip scheme://authority from absolute-form targets.
    let rest = match target.find("://") {
        Some(i) if target[..i].bytes().all(|c| c.is_ascii_alphanumeric()) => {
            let after = &target[i + 3..];
            match after.find('/') {
                Some(j) => &after[j..],
                None => "/",
            }
        }
        _ => target,
    };
    let (raw_path, query) = match rest.split_once('?') {
        Some((p, q)) => (p, q),
        None => (rest, ""),
    };
    if !raw_path.starts_with('/') {
        return Err(HttpError::new(400, "Bad Request"));
    }
    let path = percent_decode(raw_path, false);
    if path.contains('\0') || path.split('/').any(|seg| seg == "..") {
        return Err(HttpError::new(400, "Bad Request"));
    }
    Ok((raw_path.to_string(), path, query.to_string()))
}

/// Read the request body per RFC 7230 §3.3.3.
///
/// # Errors
/// 400 when `Content-Length` and `Transfer-Encoding` are both present, when
/// `Content-Length` repeats with differing values, or when it is unparseable;
/// 501 for a transfer coding other than `chunked`; 413 when the body exceeds
/// [`Config::max_body_bytes`].
fn read_body(
    reader: &mut BufReader<TcpStream>,
    headers: &Headers,
    cfg: &Config,
    used: &mut usize,
    deadline: Instant,
) -> Result<Vec<u8>, HttpError> {
    let te = headers.get("transfer-encoding");
    let lens = headers.get_all("content-length");

    if te.is_some() && !lens.is_empty() {
        // Request smuggling vector: reject instead of guessing.
        return Err(HttpError::new(400, "Bad Request"));
    }

    if let Some(te) = te {
        if !te.trim().eq_ignore_ascii_case("chunked") {
            return Err(HttpError::new(501, "Not Implemented"));
        }
        return read_chunked(reader, cfg, used, deadline);
    }

    if lens.is_empty() {
        return Ok(Vec::new());
    }
    if lens.iter().any(|v| *v != lens[0]) {
        return Err(HttpError::new(400, "Bad Request"));
    }
    let len: usize = lens[0]
        .trim()
        .parse()
        .map_err(|_| HttpError::new(400, "Bad Request"))?;
    if len > cfg.max_body_bytes {
        return Err(HttpError::new(413, "Payload Too Large"));
    }
    let mut body = vec![0u8; len];
    read_exact_timed(reader, &mut body, deadline, cfg.read_timeout)?;
    Ok(body)
}

/// Longest accepted chunk-size line, including any chunk extension.
const MAX_CHUNK_LINE: usize = 1024;

/// Decode a `Transfer-Encoding: chunked` body, discarding trailers.
fn read_chunked(
    reader: &mut BufReader<TcpStream>,
    cfg: &Config,
    used: &mut usize,
    deadline: Instant,
) -> Result<Vec<u8>, HttpError> {
    let mut out: Vec<u8> = Vec::new();
    let mut line = Vec::new();
    loop {
        let mut line_used = 0usize;
        let n = read_line_limited(
            reader,
            &mut line,
            &mut line_used,
            MAX_CHUNK_LINE,
            deadline,
            cfg.read_timeout,
            true,
        )?;
        if n == 0 {
            return Err(HttpError::close());
        }
        let head = trim_eol(&line);
        // chunk-size [ ";" chunk-ext ]
        let size_text = match head.iter().position(|&c| c == b';') {
            Some(i) => &head[..i],
            None => head,
        };
        let size_text =
            std::str::from_utf8(size_text).map_err(|_| HttpError::new(400, "Bad Request"))?;
        let size = usize::from_str_radix(size_text.trim(), 16)
            .map_err(|_| HttpError::new(400, "Bad Request"))?;
        if size == 0 {
            // Trailer section: read until the terminating empty line.
            loop {
                let n = read_line_limited(
                    reader,
                    &mut line,
                    used,
                    cfg.max_header_bytes,
                    deadline,
                    cfg.read_timeout,
                    true,
                )?;
                if n == 0 {
                    return Err(HttpError::close());
                }
                if trim_eol(&line).is_empty() {
                    return Ok(out);
                }
            }
        }
        // `size` is attacker-controlled and unbounded; the release profile has
        // overflow-checks off, so a wrapping `out.len() + size` would slip past
        // this gate and then panic on the slice index below.
        if size > cfg.max_body_bytes {
            return Err(HttpError::new(413, "Payload Too Large"));
        }
        let start = out.len();
        let end = start
            .checked_add(size)
            .ok_or_else(|| HttpError::new(413, "Payload Too Large"))?;
        if end > cfg.max_body_bytes {
            return Err(HttpError::new(413, "Payload Too Large"));
        }
        out.resize(end, 0);
        read_exact_timed(reader, &mut out[start..], deadline, cfg.read_timeout)?;
        // Trailing CRLF after the chunk data.
        let mut crlf = [0u8; 2];
        read_exact_timed(reader, &mut crlf, deadline, cfg.read_timeout)?;
        if &crlf != b"\r\n" {
            return Err(HttpError::new(400, "Bad Request"));
        }
    }
}

/// 408 once the request has started; silent close while still idle.
fn timed_out(started: bool) -> HttpError {
    if started {
        HttpError::new(408, "Request Timeout")
    } else {
        HttpError::close()
    }
}

/// Cap the next socket read to the remaining wall-clock budget.
fn arm_read_timeout(
    reader: &mut BufReader<TcpStream>,
    deadline: Instant,
    cap: Duration,
    started: bool,
) -> Result<(), HttpError> {
    let left = deadline.saturating_duration_since(Instant::now());
    if left.is_zero() {
        return Err(timed_out(started));
    }
    let _ = reader.get_mut().set_read_timeout(Some(left.min(cap)));
    Ok(())
}

fn read_exact_timed(
    reader: &mut BufReader<TcpStream>,
    buf: &mut [u8],
    deadline: Instant,
    cap: Duration,
) -> Result<(), HttpError> {
    arm_read_timeout(reader, deadline, cap, true)?;
    match reader.read_exact(buf) {
        Ok(()) => Ok(()),
        Err(ref e) if e.kind() == ErrorKind::TimedOut || e.kind() == ErrorKind::WouldBlock => {
            Err(timed_out(true))
        }
        Err(_) => Err(HttpError::close()),
    }
}

/// Read one `\n`-terminated line into `buf`, counting bytes against `max`.
///
/// Returns the line length including its terminator, or `0` at a clean EOF.
///
/// # Errors
/// 431 when `max` would be exceeded; 408 when the wall-clock budget is spent
/// after the request has started; status 0 on idle timeout, socket error, or a
/// truncated final line.
fn read_line_limited(
    r: &mut BufReader<TcpStream>,
    buf: &mut Vec<u8>,
    used: &mut usize,
    max: usize,
    deadline: Instant,
    cap: Duration,
    started: bool,
) -> Result<usize, HttpError> {
    buf.clear();
    loop {
        arm_read_timeout(r, deadline, cap, started)?;
        let chunk = match r.fill_buf() {
            Ok(c) => c,
            Err(ref e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(ref e) if e.kind() == ErrorKind::TimedOut || e.kind() == ErrorKind::WouldBlock => {
                return Err(timed_out(started));
            }
            Err(_) => return Err(HttpError::close()),
        };
        if chunk.is_empty() {
            if buf.is_empty() {
                return Ok(0);
            }
            return Err(HttpError::close());
        }
        let (take, done) = match chunk.iter().position(|&b| b == b'\n') {
            Some(i) => (i + 1, true),
            None => (chunk.len(), false),
        };
        if *used + buf.len() + take > max {
            return Err(HttpError::new(431, "Request Header Fields Too Large"));
        }
        buf.extend_from_slice(&chunk[..take]);
        r.consume(take);
        if done {
            break;
        }
    }
    *used += buf.len();
    Ok(buf.len())
}

/// Strip a trailing `\r\n` or `\n`.
fn trim_eol(line: &[u8]) -> &[u8] {
    let mut end = line.len();
    if end > 0 && line[end - 1] == b'\n' {
        end -= 1;
    }
    if end > 0 && line[end - 1] == b'\r' {
        end -= 1;
    }
    &line[..end]
}

/// True for a byte allowed in an RFC 7230 `token` (method and header names).
fn is_token_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric()
        || matches!(
            c,
            b'!' | b'#'
                | b'$'
                | b'%'
                | b'&'
                | b'\''
                | b'*'
                | b'+'
                | b'-'
                | b'.'
                | b'^'
                | b'_'
                | b'`'
                | b'|'
                | b'~'
        )
}

/// Header fields the server owns; handler copies are discarded.
const RESERVED_HEADERS: [&str; 4] = ["content-length", "connection", "transfer-encoding", "date"];

/// Write a complete response.
///
/// `Date` and `Connection` are always sent. `Content-Length` is sent for every
/// status that may carry a body — including `HEAD`, where the length is
/// computed as if the method were `GET` but no body follows (RFC 7231 §4.3.2).
/// 1xx/204/304 carry neither body nor `Content-Length` (RFC 7230 §3.3.2).
fn write_response(
    w: &mut TcpStream,
    res: &Response,
    head_only: bool,
    keep_alive: bool,
    http_11: bool,
) -> std::io::Result<()> {
    let bodyless = matches!(res.status, 100..=199 | 204 | 304);
    let mut out: Vec<u8> = Vec::with_capacity(res.body.len() + 256);

    let version = if http_11 { "HTTP/1.1" } else { "HTTP/1.0" };
    out.extend_from_slice(
        format!(
            "{} {} {}\r\n",
            version,
            res.status,
            reason_phrase(res.status)
        )
        .as_bytes(),
    );
    out.extend_from_slice(format!("Date: {}\r\n", http_date(SystemTime::now())).as_bytes());
    out.extend_from_slice(if keep_alive {
        b"Connection: keep-alive\r\n".as_slice()
    } else {
        b"Connection: close\r\n".as_slice()
    });
    if !bodyless {
        out.extend_from_slice(format!("Content-Length: {}\r\n", res.body.len()).as_bytes());
    }
    for (k, v) in &res.headers {
        if RESERVED_HEADERS.iter().any(|r| k.eq_ignore_ascii_case(r)) {
            continue;
        }
        // A newline in a header value would let a handler inject a response.
        if k.contains(['\r', '\n']) || v.contains(['\r', '\n']) {
            continue;
        }
        out.extend_from_slice(format!("{k}: {v}\r\n").as_bytes());
    }
    out.extend_from_slice(b"\r\n");
    if !bodyless && !head_only {
        out.extend_from_slice(&res.body);
    }
    w.write_all(&out)?;
    w.flush()
}

/// Reason phrase for a status code; `"Unknown"` for codes we never emit.
fn reason_phrase(status: u16) -> &'static str {
    match status {
        100 => "Continue",
        101 => "Switching Protocols",
        200 => "OK",
        201 => "Created",
        202 => "Accepted",
        204 => "No Content",
        206 => "Partial Content",
        301 => "Moved Permanently",
        302 => "Found",
        303 => "See Other",
        304 => "Not Modified",
        307 => "Temporary Redirect",
        308 => "Permanent Redirect",
        400 => "Bad Request",
        401 => "Unauthorized",
        402 => "Payment Required",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        406 => "Not Acceptable",
        408 => "Request Timeout",
        409 => "Conflict",
        410 => "Gone",
        411 => "Length Required",
        413 => "Payload Too Large",
        414 => "URI Too Long",
        415 => "Unsupported Media Type",
        422 => "Unprocessable Entity",
        423 => "Locked",
        428 => "Precondition Required",
        429 => "Too Many Requests",
        431 => "Request Header Fields Too Large",
        500 => "Internal Server Error",
        501 => "Not Implemented",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        505 => "HTTP Version Not Supported",
        _ => "Unknown",
    }
}

// ==== DATE ====

/// Day-of-week names indexed from Sunday.
const DAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/// Month names indexed from January.
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// Format `t` as an RFC 7231 IMF-fixdate, e.g. `Sun, 06 Nov 1994 08:49:37 GMT`.
///
/// The epoch→civil conversion is done by hand (no crate, no libc). Times before
/// the Unix epoch clamp to the epoch, which only a badly-set clock produces.
pub fn http_date(t: SystemTime) -> String {
    let secs = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let (y, m, d) = civil_from_days(days);
    let dow = DAYS[((days + 4).rem_euclid(7)) as usize];
    format!(
        "{}, {:02} {} {} {:02}:{:02}:{:02} GMT",
        dow,
        d,
        MONTHS[(m - 1) as usize],
        y,
        h,
        mi,
        s
    )
}

/// Convert days since 1970-01-01 to a proleptic Gregorian (year, month, day).
///
/// Howard Hinnant's `civil_from_days`: shift the epoch to 0000-03-01 so leap
/// days land at the end of the era, then unwind 400-year eras.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097); // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11], March-based
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ==== STATIC FILES ====

/// Serve `url_path` from `root`, refusing anything that escapes `root`.
///
/// The path is percent-decoded, resolved against `root`, then canonicalized and
/// re-checked against the canonical `root`, so neither `..` segments nor a
/// symlink pointing outside can escape. Returns `None` when the file is absent,
/// is not a regular file, or is unreadable — the caller decides whether that is
/// a 404 or an SPA fallback.
pub fn serve_file(root: &Path, url_path: &str) -> Option<Response> {
    let root = root.canonicalize().ok()?;
    let decoded = percent_decode(url_path, false);
    if decoded.contains('\0') {
        return None;
    }
    let rel = decoded.trim_start_matches('/');
    let rel_path = Path::new(rel);
    // Reject traversal before touching the filesystem; canonicalize re-checks.
    if rel_path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return None;
    }
    let candidate = root.join(rel_path).canonicalize().ok()?;
    if !candidate.starts_with(&root) {
        return None;
    }
    if !candidate.metadata().ok()?.is_file() {
        return None;
    }
    let body = std::fs::read(&candidate).ok()?;
    let ct = content_type(&candidate);
    Some(Response::bytes(200, ct, body))
}

/// Content type inferred from a file extension.
///
/// Falls back to `application/octet-stream`, which browsers download rather
/// than render — the safe default for an unknown extension.
pub fn content_type(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=UTF-8",
        "js" | "mjs" => "text/javascript; charset=UTF-8",
        "css" => "text/css; charset=UTF-8",
        "json" | "map" => "application/json",
        "webmanifest" => "application/manifest+json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "txt" => "text/plain; charset=UTF-8",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::BufReader as StdBufReader;

    fn test_cfg() -> Config {
        Config {
            port: 0,
            threads: 4,
            read_timeout: Duration::from_secs(5),
            write_timeout: Duration::from_secs(5),
            request_timeout: Duration::from_secs(5),
            idle_timeout: Duration::from_secs(5),
            max_body_bytes: 1024,
            max_header_bytes: 2048,
            max_queued_connections: 32,
        }
    }

    /// Boot a server on an OS-assigned port with a test handler.
    fn boot<F>(handler: F) -> Server
    where
        F: Fn(Request) -> Response + Send + Sync + 'static,
    {
        serve(test_cfg(), handler).expect("bind")
    }

    /// Connect to a running test server.
    fn connect(s: &Server) -> TcpStream {
        let addr = s.local_addr();
        let target = wake_addrs(addr)
            .into_iter()
            .find(|a| TcpStream::connect_timeout(a, Duration::from_millis(500)).is_ok())
            .unwrap_or(addr);
        let c = TcpStream::connect_timeout(&target, Duration::from_secs(2)).expect("connect");
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c
    }

    /// Read one response: (status line + headers, body).
    fn read_one(r: &mut StdBufReader<TcpStream>) -> Option<(String, Vec<u8>)> {
        let mut head = String::new();
        loop {
            let mut line = String::new();
            let n = r.read_line(&mut line).ok()?;
            if n == 0 {
                return if head.is_empty() { None } else { Some((head, Vec::new())) };
            }
            if line == "\r\n" {
                break;
            }
            head.push_str(&line);
        }
        let len = head
            .lines()
            .find(|l| l.to_ascii_lowercase().starts_with("content-length:"))
            .and_then(|l| l.split_once(':'))
            .and_then(|(_, v)| v.trim().parse::<usize>().ok())
            .unwrap_or(0);
        let mut body = vec![0u8; len];
        if len > 0 {
            r.read_exact(&mut body).ok()?;
        }
        Some((head, body))
    }

    /// Send one raw request and read one response.
    fn round_trip(s: &Server, raw: &[u8]) -> (String, Vec<u8>) {
        let mut c = connect(s);
        c.write_all(raw).unwrap();
        c.flush().unwrap();
        let mut r = StdBufReader::new(c);
        read_one(&mut r).expect("response")
    }

    fn ok_handler(req: Request) -> Response {
        Response::text(200, &format!("{} {}", req.method, req.path))
    }

    #[test]
    fn get_returns_status_body_and_length() {
        let s = boot(ok_handler);
        let (head, body) = round_trip(&s, b"GET /hello HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 200 OK\r\n"), "{head}");
        assert_eq!(body, b"GET /hello");
        assert!(head.to_ascii_lowercase().contains("content-length: 10\r\n"));
        assert!(head.contains("Date: "));
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn keep_alive_serves_two_requests_on_one_connection() {
        let s = boot(ok_handler);
        let c = connect(&s);
        let mut w = c.try_clone().unwrap();
        let mut r = StdBufReader::new(c);

        w.write_all(b"GET /one HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let (h1, b1) = read_one(&mut r).unwrap();
        assert!(h1.contains("Connection: keep-alive"), "{h1}");
        assert_eq!(b1, b"GET /one");

        w.write_all(b"GET /two HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let (_, b2) = read_one(&mut r).unwrap();
        assert_eq!(b2, b"GET /two");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn connection_close_ends_the_connection() {
        let s = boot(ok_handler);
        let c = connect(&s);
        let mut w = c.try_clone().unwrap();
        let mut r = StdBufReader::new(c);
        w.write_all(b"GET /x HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
            .unwrap();
        let (head, _) = read_one(&mut r).unwrap();
        assert!(head.contains("Connection: close"), "{head}");
        // Server closed: the next read hits EOF rather than another response.
        let mut rest = Vec::new();
        r.read_to_end(&mut rest).unwrap();
        assert!(rest.is_empty());
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn http_10_defaults_to_close() {
        let s = boot(ok_handler);
        let (head, _) = round_trip(&s, b"GET /x HTTP/1.0\r\n\r\n");
        assert!(head.starts_with("HTTP/1.0 200 OK"), "{head}");
        assert!(head.contains("Connection: close"), "{head}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn chunked_body_is_decoded() {
        let s = boot(|req| Response::text(200, &String::from_utf8_lossy(&req.body)));
        let raw = b"POST /p HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n\
                    5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n";
        let (head, body) = round_trip(&s, raw);
        assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
        assert_eq!(body, b"hello world");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn content_length_and_transfer_encoding_together_is_400() {
        let s = boot(ok_handler);
        let raw =
            b"POST /p HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n";
        let (head, _) = round_trip(&s, raw);
        assert!(head.starts_with("HTTP/1.1 400 Bad Request"), "{head}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn oversized_body_is_413() {
        let s = boot(ok_handler);
        let raw = b"POST /p HTTP/1.1\r\nHost: x\r\nContent-Length: 99999\r\n\r\n";
        let (head, _) = round_trip(&s, raw);
        assert!(head.starts_with("HTTP/1.1 413 Payload Too Large"), "{head}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn wrapping_chunk_size_is_413_and_all_workers_survive() {
        // `10 + (2^64 - 6)` wraps to 4 with overflow-checks off, which used to
        // slip past the size gate, shrink the buffer, and panic on the slice
        // index — outside catch_unwind, so it unwound the worker itself. Enough
        // of these took every worker down and dropped the listener.
        let s = boot(ok_handler);
        let raw = b"POST /p HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n\
                    a\r\n0123456789\r\nfffffffffffffffa\r\n";
        for _ in 0..8 {
            let (head, _) = round_trip(&s, raw);
            assert!(head.starts_with("HTTP/1.1 413 Payload Too Large"), "{head}");
        }
        // The listener is still accepting and the pool still has workers.
        let (head, body) = round_trip(&s, b"GET /p HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
        assert_eq!(body, b"GET /p");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn chunk_size_over_the_body_cap_is_413() {
        let s = boot(ok_handler);
        let raw = b"POST /p HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n\
                    ffff\r\n";
        let (head, _) = round_trip(&s, raw);
        assert!(head.starts_with("HTTP/1.1 413 Payload Too Large"), "{head}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn oversized_header_block_is_431() {
        let s = boot(ok_handler);
        let big = "x".repeat(4096);
        let raw = format!("GET / HTTP/1.1\r\nHost: x\r\nX-Big: {big}\r\n\r\n");
        let (head, _) = round_trip(&s, raw.as_bytes());
        assert!(
            head.starts_with("HTTP/1.1 431 Request Header Fields Too Large"),
            "{head}"
        );
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn malformed_request_line_is_400() {
        let s = boot(ok_handler);
        let (head, _) = round_trip(&s, b"NONSENSE\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 400 Bad Request"), "{head}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn unknown_version_is_505() {
        let s = boot(ok_handler);
        let (head, _) = round_trip(&s, b"GET / HTTP/2.0\r\n\r\n");
        assert!(
            head.starts_with("HTTP/1.1 505 HTTP Version Not Supported"),
            "{head}"
        );
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn parser_panic_does_not_kill_the_pool() {
        let mut cfg = test_cfg();
        cfg.threads = 1;
        let s = serve(cfg, ok_handler).expect("bind");
        for _ in 0..4 {
            let mut c = connect(&s);
            c.write_all(b"GET /__panic_worker HTTP/1.1\r\nHost: x\r\n\r\n")
                .unwrap();
            c.flush().unwrap();
            let mut r = StdBufReader::new(c);
            assert!(read_one(&mut r).is_none());
        }
        let (head, body) = round_trip(&s, b"GET /p HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
        assert_eq!(body, b"GET /p");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn slow_header_dribble_is_408() {
        let mut cfg = test_cfg();
        cfg.threads = 1;
        cfg.request_timeout = Duration::from_millis(150);
        cfg.read_timeout = Duration::from_secs(2);
        let s = serve(cfg, ok_handler).expect("bind");
        let mut c = connect(&s);
        c.write_all(b"GET /p HTTP/1.1\r\nHost: x\r\nX-Slow: ").unwrap();
        c.flush().unwrap();
        thread::sleep(Duration::from_millis(250));
        let _ = c.write_all(b"v\r\n\r\n");
        let mut r = StdBufReader::new(c);
        let (head, _) = read_one(&mut r).expect("408 response");
        assert!(head.starts_with("HTTP/1.1 408 Request Timeout"), "{head}");
        let (head, body) = round_trip(&s, b"GET /p HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
        assert_eq!(body, b"GET /p");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn panicking_handler_returns_500_and_server_survives() {
        let s = boot(|req| {
            if req.path == "/boom" {
                panic!("handler exploded");
            }
            Response::text(200, "fine")
        });
        let c = connect(&s);
        let mut w = c.try_clone().unwrap();
        let mut r = StdBufReader::new(c);

        w.write_all(b"GET /boom HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let (h1, _) = read_one(&mut r).unwrap();
        assert!(h1.starts_with("HTTP/1.1 500 Internal Server Error"), "{h1}");

        w.write_all(b"GET /ok HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let (h2, b2) = read_one(&mut r).unwrap();
        assert!(h2.starts_with("HTTP/1.1 200 OK"), "{h2}");
        assert_eq!(b2, b"fine");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn head_sends_headers_without_a_body() {
        let s = boot(|_| Response::text(200, "0123456789"));
        let c = connect(&s);
        let mut w = c.try_clone().unwrap();
        let mut r = StdBufReader::new(c);
        w.write_all(b"HEAD /x HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
            .unwrap();
        // Read the head only; asserting EOF proves no body followed.
        let mut head = String::new();
        loop {
            let mut line = String::new();
            r.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            head.push_str(&line);
        }
        assert!(head.to_ascii_lowercase().contains("content-length: 10\r\n"));
        let mut rest = Vec::new();
        r.read_to_end(&mut rest).unwrap();
        assert!(rest.is_empty(), "HEAD returned a body: {rest:?}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn bodyless_status_sends_no_content_length() {
        let s = boot(|_| Response::empty(204));
        let (head, body) = round_trip(&s, b"GET /x HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(head.starts_with("HTTP/1.1 204 No Content"), "{head}");
        assert!(!head.to_ascii_lowercase().contains("content-length"));
        assert!(body.is_empty());
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn percent_encoded_path_is_decoded_and_raw_is_preserved() {
        let s = boot(|req| Response::text(200, &format!("{}|{}", req.path, req.raw_path)));
        let (_, body) = round_trip(&s, b"GET /a%20b/c%2Fd HTTP/1.1\r\nHost: x\r\n\r\n");
        assert_eq!(String::from_utf8_lossy(&body), "/a b/c/d|/a%20b/c%2Fd");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn traversal_path_is_rejected() {
        let s = boot(ok_handler);
        let (h1, _) = round_trip(&s, b"GET /../etc/passwd HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(h1.starts_with("HTTP/1.1 400 Bad Request"), "{h1}");
        // Encoded form must be caught after decoding, not before.
        let (h2, _) = round_trip(&s, b"GET /a/%2e%2e/b HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(h2.starts_with("HTTP/1.1 400 Bad Request"), "{h2}");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn query_and_cookie_accessors_decode() {
        let s = boot(|req| {
            let q = req.query_param("name").unwrap_or_default();
            let c = req.cookie("token").unwrap_or_default();
            Response::text(200, &format!("{q}|{c}"))
        });
        let (_, body) = round_trip(
            &s,
            b"GET /x?name=a+b%21&z=1 HTTP/1.1\r\nHost: x\r\nCookie: other=1; token=a%20b\r\n\r\n",
        );
        assert_eq!(String::from_utf8_lossy(&body), "a b!|a b");
        s.shutdown(Duration::from_secs(2));
    }

    #[test]
    fn shutdown_returns_within_grace() {
        let s = boot(ok_handler);
        let h = s.handle();
        thread::spawn(move || h.shutdown());
        s.wait();
        let t0 = std::time::Instant::now();
        s.shutdown(Duration::from_secs(2));
        assert!(t0.elapsed() < Duration::from_secs(3), "shutdown overran grace");
    }

    #[test]
    fn cookie_serializes_like_hono() {
        let c = Cookie {
            name: "token".into(),
            value: "abc123".into(),
            http_only: true,
            secure: true,
            same_site: SameSite::Strict,
            path: "/".into(),
            max_age: Some(2_592_000),
        };
        assert_eq!(
            c.to_header_value(),
            "token=abc123; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict"
        );
    }

    #[test]
    fn cookie_deletion_form() {
        let mut c = Cookie::new("token", "");
        c.max_age = Some(0);
        c.http_only = true;
        c.secure = true;
        c.same_site = SameSite::Strict;
        assert_eq!(
            c.to_header_value(),
            "token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict"
        );
    }

    #[test]
    fn cookie_omits_unset_attributes_and_encodes_value() {
        let c = Cookie::new("a", "x y/z");
        assert_eq!(c.to_header_value(), "a=x%20y%2Fz; Path=/; SameSite=Lax");
    }

    #[test]
    fn response_cookie_appends_set_cookie() {
        let r = Response::text(200, "ok").cookie(&Cookie::new("a", "1"));
        let set: Vec<_> = r
            .headers
            .iter()
            .filter(|(k, _)| k == "Set-Cookie")
            .map(|(_, v)| v.as_str())
            .collect();
        assert_eq!(set, vec!["a=1; Path=/; SameSite=Lax"]);
    }

    #[test]
    fn set_header_replaces_and_header_appends() {
        let r = Response::new(200)
            .header("X-A", "1")
            .header("X-A", "2")
            .set_header("X-A", "3");
        assert_eq!(r.headers, vec![("X-A".to_string(), "3".to_string())]);
    }

    #[test]
    fn headers_lookup_is_case_insensitive() {
        let h = Headers::from_pairs(vec![
            ("Content-Type".into(), "text/plain".into()),
            ("set-cookie".into(), "a=1".into()),
            ("Set-Cookie".into(), "b=2".into()),
        ]);
        assert_eq!(h.get("content-TYPE"), Some("text/plain"));
        assert_eq!(h.get_all("Set-Cookie"), vec!["a=1", "b=2"]);
        assert_eq!(h.iter().count(), 3);
    }

    #[test]
    fn http_date_matches_rfc_7231_example() {
        let t = UNIX_EPOCH + Duration::from_secs(784_111_777);
        assert_eq!(http_date(t), "Sun, 06 Nov 1994 08:49:37 GMT");
        assert_eq!(http_date(UNIX_EPOCH), "Thu, 01 Jan 1970 00:00:00 GMT");
        // Leap day, to exercise the era arithmetic.
        let leap = UNIX_EPOCH + Duration::from_secs(1_709_164_800);
        assert_eq!(http_date(leap), "Thu, 29 Feb 2024 00:00:00 GMT");
    }

    #[test]
    fn percent_decode_handles_malformed_escapes() {
        assert_eq!(percent_decode("a%2Fb", false), "a/b");
        assert_eq!(percent_decode("100%", false), "100%");
        assert_eq!(percent_decode("a%zzb", false), "a%zzb");
        assert_eq!(percent_decode("a+b", true), "a b");
        assert_eq!(percent_decode("a+b", false), "a+b");
    }

    #[test]
    fn serve_file_reads_inside_root_and_refuses_traversal() {
        let root = std::env::temp_dir().join(format!("sb-http-test-{}", std::process::id()));
        let sub = root.join("assets");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("app.js"), b"console.log(1)").unwrap();
        std::fs::write(root.join("secret.txt"), b"nope").unwrap();

        let res = serve_file(&root, "/assets/app.js").expect("served");
        assert_eq!(res.status, 200);
        assert_eq!(res.body, b"console.log(1)");
        assert_eq!(
            res.headers,
            vec![(
                "Content-Type".to_string(),
                "text/javascript; charset=UTF-8".to_string()
            )]
        );

        assert!(serve_file(&sub, "/../secret.txt").is_none());
        assert!(serve_file(&sub, "/%2e%2e/secret.txt").is_none());
        assert!(serve_file(&root, "/missing.js").is_none());
        assert!(serve_file(&root, "/assets").is_none(), "directory served");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn content_type_falls_back_to_octet_stream() {
        assert_eq!(content_type(Path::new("a.woff2")), "font/woff2");
        assert_eq!(content_type(Path::new("a.WEBMANIFEST")), "application/manifest+json");
        assert_eq!(content_type(Path::new("a.bin")), "application/octet-stream");
        assert_eq!(content_type(Path::new("noext")), "application/octet-stream");
    }
}

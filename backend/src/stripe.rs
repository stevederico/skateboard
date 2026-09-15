//! Stripe REST client and webhook signature verification.
//!
//! Zero-crate replacement for the `stripe` npm package. HTTPS is provided by
//! the **system libcurl** through a small FFI shim — no TLS is hand-rolled and
//! certificate verification is always on, with no option to turn it off.
//!
//! Only the six operations the Node backend performs are implemented:
//! webhook verification, customer retrieve, subscription retrieve, price
//! lookup, Checkout session create, and Billing Portal session create.
//!
//! # Secret handling
//! The API key is sent only in the `Authorization: Bearer …` request header.
//! It is never logged, never placed in a URL, and never included in any
//! [`StripeError`] message. [`StripeClient`]'s `Debug` impl is written by hand
//! so the key cannot leak through `{:?}` formatting.

use std::ffi::{c_char, c_int, c_long, c_void, CString};
use std::sync::{Mutex, Once};
#[cfg(test)]
use std::sync::atomic::{AtomicU32, Ordering};
#[cfg(test)]
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::crypto::{ct_eq, hex_encode, hmac_sha256, random_uuid_v4};
use crate::json::{self, Json};

/// Stripe API version pinned by the Node client this port replaces.
///
/// Taken from `stripe@18.5.0`'s generated `apiVersion.js`
/// (`exports.ApiVersion = '2025-08-27.basil'`). Pinning the same string keeps
/// the response shapes identical — in particular the basil-era move of
/// `current_period_end` onto `items.data[0]`, which the caller relies on.
pub const STRIPE_API_VERSION: &str = "2025-08-27.basil";

/// Base URL for every Stripe REST call.
const API_BASE: &str = "https://api.stripe.com";

/// Stripe's default webhook timestamp tolerance, in seconds.
pub const DEFAULT_WEBHOOK_TOLERANCE_SECS: i64 = 300;

/// Total request timeout, matching the Node client's 30s default.
const TIMEOUT_MS: c_long = 30_000;

/// TCP connect timeout — a slice of the total budget so a dead host fails fast.
const CONNECT_TIMEOUT_MS: c_long = 10_000;

/// Retries after the first attempt (5 attempts total).
const MAX_RETRIES: u32 = 4;

/// First backoff delay; doubles per retry (1s, 2s, 4s, 8s).
const BASE_BACKOFF_MS: u64 = 1_000;

/// Upper bound applied to a server-supplied `Retry-After`, so a hostile or
/// mistaken header cannot stall a request handler for minutes.
const MAX_RETRY_AFTER_SECS: u64 = 60;

/// Consecutive whole-operation failures that trip the circuit breaker.
const CIRCUIT_FAILURE_THRESHOLD: u32 = 3;

/// How long the circuit stays open before another attempt is allowed.
const CIRCUIT_COOLDOWN: Duration = Duration::from_secs(30);

// ==== ERRORS ====

/// Why a `Stripe-Signature` header was rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignatureError {
    /// The configured endpoint secret was empty.
    EmptySecret,
    /// The header carried no `v1=` entry (nothing to compare against).
    NoSignatures,
    /// The header carried no `t=` entry.
    MissingTimestamp,
    /// The `t=` entry was not a base-10 integer.
    InvalidTimestamp,
    /// `|now - t|` exceeded the tolerance. Carries the signed age in seconds
    /// (negative when the timestamp is in the future).
    TimestampOutsideTolerance {
        /// `now - t`, in seconds.
        age_secs: i64,
        /// The tolerance that was exceeded.
        tolerance_secs: i64,
    },
    /// Every `v1=` entry failed the constant-time comparison.
    NoMatchingSignature,
}

impl std::fmt::Display for SignatureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SignatureError::EmptySecret => write!(f, "webhook endpoint secret is empty"),
            SignatureError::NoSignatures => {
                write!(f, "no signatures found with expected scheme v1")
            }
            SignatureError::MissingTimestamp => write!(f, "signature header has no timestamp"),
            SignatureError::InvalidTimestamp => write!(f, "signature header timestamp is not a number"),
            SignatureError::TimestampOutsideTolerance { age_secs, tolerance_secs } => write!(
                f,
                "timestamp outside the tolerance zone (age {age_secs}s, tolerance {tolerance_secs}s)"
            ),
            SignatureError::NoMatchingSignature => {
                write!(f, "no signatures found matching the expected signature for payload")
            }
        }
    }
}

impl std::error::Error for SignatureError {}

/// Anything that can go wrong talking to Stripe.
///
/// No variant ever carries the API key: transport messages come from
/// `curl_easy_strerror` plus our own text, and the key travels in a header
/// that is never echoed back into an error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StripeError {
    /// libcurl could not complete the request (DNS, TLS, timeout, reset).
    Transport(String),
    /// Stripe answered with a non-2xx status.
    Http {
        /// HTTP status code.
        status: u16,
        /// Stripe's machine-readable `error.code`, when present.
        code: Option<String>,
        /// Stripe's `error.message`, or a fallback describing the status.
        message: String,
    },
    /// A webhook signature failed verification.
    Signature(SignatureError),
    /// A response body (or webhook payload) was not valid JSON.
    Parse(String),
    /// The circuit breaker is open after repeated failures; no call was made.
    CircuitOpen,
    /// The Stripe worker did not finish within [`crate::stripe_worker::STRIPE_CALL_TIMEOUT`].
    Timeout,
    /// The bounded Stripe worker queue was full; the call was not started.
    Busy,
}

impl std::fmt::Display for StripeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StripeError::Transport(m) => write!(f, "stripe transport error: {m}"),
            StripeError::Http { status, code, message } => match code {
                Some(c) => write!(f, "stripe HTTP {status} ({c}): {message}"),
                None => write!(f, "stripe HTTP {status}: {message}"),
            },
            StripeError::Signature(e) => write!(f, "stripe signature error: {e}"),
            StripeError::Parse(m) => write!(f, "stripe response parse error: {m}"),
            StripeError::CircuitOpen => {
                write!(f, "stripe circuit breaker open after repeated failures")
            }
            StripeError::Timeout => {
                write!(f, "stripe call timed out waiting for worker")
            }
            StripeError::Busy => write!(f, "stripe worker queue full"),
        }
    }
}

impl std::error::Error for StripeError {}

impl From<SignatureError> for StripeError {
    fn from(e: SignatureError) -> Self {
        StripeError::Signature(e)
    }
}

// ==== FORM ENCODING ====

/// Percent-encode one component per `application/x-www-form-urlencoded`.
///
/// Unreserved characters (`A-Z a-z 0-9 - . _ ~`) pass through; everything else
/// becomes `%XX` with uppercase hex. Space becomes `%20` rather than `+` —
/// Stripe decodes both, and `%20` keeps the same routine usable for URL path
/// and query segments where `+` would be wrong.
pub fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*b as char)
            }
            _ => {
                out.push('%');
                out.push(hex_nibble(b >> 4));
                out.push(hex_nibble(b & 0x0f));
            }
        }
    }
    out
}

/// Uppercase hex digit for a 4-bit value.
fn hex_nibble(v: u8) -> char {
    const DIGITS: &[u8; 16] = b"0123456789ABCDEF";
    DIGITS[v as usize] as char
}

/// Encode Stripe's bracketed form syntax, e.g.
/// `line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[app]=onyx`.
///
/// Both keys and values are percent-encoded by [`percent_encode`], so the
/// brackets a caller writes into a key are escaped as `%5B` / `%5D` — which is
/// exactly what Stripe's own clients send and what its parser expects.
pub fn form_encode(pairs: &[(String, String)]) -> String {
    let mut out = String::new();
    for (k, v) in pairs {
        if !out.is_empty() {
            out.push('&');
        }
        out.push_str(&percent_encode(k));
        out.push('=');
        out.push_str(&percent_encode(v));
    }
    out
}

// ==== WEBHOOK SIGNATURE VERIFICATION ====

/// Parsed `Stripe-Signature` header: the timestamp field and every `v1` entry.
struct SigHeader<'a> {
    timestamp: Option<&'a str>,
    v1: Vec<&'a str>,
}

/// Split a `Stripe-Signature` header into its `t` and `v1` fields.
///
/// Unknown schemes (`v0`, future `v2`) are ignored. Multiple `v1` entries are
/// normal during endpoint-secret rotation and are all retained.
fn parse_sig_header(header: &str) -> SigHeader<'_> {
    let mut out = SigHeader { timestamp: None, v1: Vec::new() };
    for part in header.split(',') {
        let Some((k, v)) = part.split_once('=') else { continue };
        match k.trim() {
            "t" if out.timestamp.is_none() => out.timestamp = Some(v.trim()),
            "v1" => out.v1.push(v.trim()),
            _ => {}
        }
    }
    out
}

/// Compute Stripe's expected `v1` signature: `hex(HMAC_SHA256(secret, "<t>.<payload>"))`.
///
/// The signed payload is assembled from the **raw** request bytes — never from
/// a re-serialized JSON value, whose key order or spacing would differ.
fn expected_signature(secret: &str, timestamp: &str, payload: &[u8]) -> String {
    let mut signed = Vec::with_capacity(timestamp.len() + 1 + payload.len());
    signed.extend_from_slice(timestamp.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(payload);
    hex_encode(&hmac_sha256(secret.as_bytes(), &signed))
}

/// Verify a `Stripe-Signature` header against the raw request body.
///
/// Returns the parsed event on success. The body is parsed **only after** the
/// signature verifies, so malformed-JSON handling can never run on unverified
/// input.
///
/// `tolerance_secs` is the allowed `|now - t|` drift;
/// [`DEFAULT_WEBHOOK_TOLERANCE_SECS`] matches Stripe's own default of 300.
///
/// # Errors
/// [`StripeError::Signature`] for a missing/blank secret, a header with no
/// usable `t` or `v1`, a timestamp outside tolerance (in either direction), or
/// no `v1` entry matching the expected HMAC. [`StripeError::Parse`] when a
/// verified body is not valid JSON.
pub fn construct_event(
    payload: &[u8],
    sig_header: &str,
    secret: &str,
    tolerance_secs: i64,
) -> Result<Json, StripeError> {
    verify_signature(payload, sig_header, secret, tolerance_secs, now_unix())?;
    json::parse(payload).map_err(|e| StripeError::Parse(e.to_string()))
}

/// Signature check with an injectable clock, so tolerance can be tested.
fn verify_signature(
    payload: &[u8],
    sig_header: &str,
    secret: &str,
    tolerance_secs: i64,
    now: i64,
) -> Result<(), SignatureError> {
    if secret.is_empty() {
        return Err(SignatureError::EmptySecret);
    }
    let parsed = parse_sig_header(sig_header);
    if parsed.v1.is_empty() {
        return Err(SignatureError::NoSignatures);
    }
    let ts = parsed.timestamp.ok_or(SignatureError::MissingTimestamp)?;
    if ts.is_empty() {
        return Err(SignatureError::MissingTimestamp);
    }
    let ts_num: i64 = ts.parse().map_err(|_| SignatureError::InvalidTimestamp)?;

    let age = now.saturating_sub(ts_num);
    if age.saturating_abs() > tolerance_secs {
        return Err(SignatureError::TimestampOutsideTolerance {
            age_secs: age,
            tolerance_secs,
        });
    }

    let expected = expected_signature(secret, ts, payload);
    // Constant-time against every candidate; any match accepts (key rotation
    // means two valid secrets, hence two valid v1 entries, can overlap).
    let mut matched = false;
    for candidate in &parsed.v1 {
        if ct_eq(candidate.as_bytes(), expected.as_bytes()) {
            matched = true;
        }
    }
    if matched {
        Ok(())
    } else {
        Err(SignatureError::NoMatchingSignature)
    }
}

/// Seconds since the Unix epoch; 0 if the system clock predates it.
fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ==== TYPED OPERATIONS ====

/// Arguments for [`StripeClient::create_checkout_session`].
pub struct CheckoutParams<'a> {
    /// Pre-fills Checkout and is the identity the webhook later resolves.
    pub customer_email: &'a str,
    /// Price to subscribe to, from [`StripeClient::price_id_for_lookup_key`].
    pub price_id: &'a str,
    /// Redirect target after a completed payment.
    pub success_url: &'a str,
    /// Redirect target when the customer abandons Checkout.
    pub cancel_url: &'a str,
    /// Stamps `metadata[app]` and `subscription_data[metadata][app]` for
    /// stripe-proxy routing. `None` omits both keys entirely.
    pub app_name: Option<&'a str>,
    /// Reuse a caller-supplied `Idempotency-Key` instead of generating one.
    /// Supply this when the same logical checkout may be retried across
    /// process restarts; otherwise leave `None`.
    pub idempotency_key: Option<&'a str>,
}

/// The fields the backend reads off a created Checkout Session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckoutSession {
    /// Hosted Checkout URL to redirect the browser to.
    pub url: Option<String>,
    /// Session id (`cs_…`).
    pub id: String,
    /// Customer id Stripe created or matched, when present.
    pub customer: Option<String>,
}

/// The fields the backend reads off a created Billing Portal Session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortalSession {
    /// Hosted portal URL to redirect the browser to.
    pub url: Option<String>,
    /// Session id (`bps_…`).
    pub id: String,
}

/// In-memory Stripe stand-in used by route tests. Never compiled into release.
#[cfg(test)]
#[derive(Default)]
pub struct StripeMock {
    /// `cus_…` → email.
    pub customers: std::collections::HashMap<String, String>,
    /// `sub_…` → raw subscription JSON object body.
    pub subscriptions: std::collections::HashMap<String, String>,
    /// Price lookup_key → `price_…` id.
    pub prices: std::collections::HashMap<String, String>,
    /// Fixed Checkout Session response.
    pub checkout: Option<CheckoutSession>,
    /// Fixed Billing Portal Session response.
    pub portal: Option<PortalSession>,
    /// Artificial delay applied before every mocked response (worker / pool tests).
    pub delay_ms: u64,
    /// How many mock HTTP operations ran.
    pub call_count: Arc<AtomicU32>,
}

#[cfg(test)]
impl StripeMock {
    fn handle_get(&self, url: &str) -> Result<Json, StripeError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        if self.delay_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(self.delay_ms));
        }
        if let Some(rest) = url.strip_prefix(&format!("{API_BASE}/v1/customers/")) {
            let id = rest.split('?').next().unwrap_or(rest);
            let id = percent_decode_basic(id);
            return match self.customers.get(&id) {
                Some(email) => Ok(json::obj([("id", json::s(id)), ("email", json::s(email.clone()))])),
                None => Err(StripeError::Http {
                    status: 404,
                    code: Some("resource_missing".into()),
                    message: format!("No such customer: '{id}'"),
                }),
            };
        }
        if let Some(rest) = url.strip_prefix(&format!("{API_BASE}/v1/subscriptions/")) {
            let id = rest.split('?').next().unwrap_or(rest);
            let id = percent_decode_basic(id);
            return match self.subscriptions.get(&id) {
                Some(body) => json::parse(body.as_bytes()).map_err(|e| StripeError::Parse(e.to_string())),
                None => Err(StripeError::Http {
                    status: 404,
                    code: Some("resource_missing".into()),
                    message: format!("No such subscription: '{id}'"),
                }),
            };
        }
        if url.starts_with(&format!("{API_BASE}/v1/prices?")) {
            // lookup_keys[0]=KEY — form-encoded brackets become %5B0%5D
            let key = url
                .split("lookup_keys%5B0%5D=")
                .nth(1)
                .or_else(|| url.split("lookup_keys[0]=").nth(1))
                .map(|s| s.split('&').next().unwrap_or(s))
                .map(percent_decode_basic)
                .unwrap_or_default();
            return match self.prices.get(&key) {
                Some(price_id) => Ok(json::obj([(
                    "data",
                    Json::Arr(vec![json::obj([("id", json::s(price_id.clone()))])]),
                )])),
                None => Ok(json::obj([("data", Json::Arr(vec![]))])),
            };
        }
        Err(StripeError::Transport(format!("unmocked GET {url}")))
    }

    fn handle_post(&self, url: &str, _form: &str) -> Result<Json, StripeError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        if self.delay_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(self.delay_ms));
        }
        if url == format!("{API_BASE}/v1/checkout/sessions") {
            let Some(session) = &self.checkout else {
                return Err(StripeError::Transport("unmocked checkout session".into()));
            };
            return Ok(json::obj([
                ("id", json::s(session.id.clone())),
                (
                    "url",
                    session
                        .url
                        .as_ref()
                        .map(|u| json::s(u.clone()))
                        .unwrap_or(Json::Null),
                ),
                (
                    "customer",
                    session
                        .customer
                        .as_ref()
                        .map(|c| json::s(c.clone()))
                        .unwrap_or(Json::Null),
                ),
            ]));
        }
        if url == format!("{API_BASE}/v1/billing_portal/sessions") {
            let Some(session) = &self.portal else {
                return Err(StripeError::Transport("unmocked portal session".into()));
            };
            return Ok(json::obj([
                ("id", json::s(session.id.clone())),
                (
                    "url",
                    session
                        .url
                        .as_ref()
                        .map(|u| json::s(u.clone()))
                        .unwrap_or(Json::Null),
                ),
            ]));
        }
        Err(StripeError::Transport(format!("unmocked POST {url}")))
    }
}

/// Decode the small set of percent-escapes used in Stripe path/query tests.
#[cfg(test)]
fn percent_decode_basic(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h = |c: u8| -> Option<u8> {
                match c {
                    b'0'..=b'9' => Some(c - b'0'),
                    b'a'..=b'f' => Some(c - b'a' + 10),
                    b'A'..=b'F' => Some(c - b'A' + 10),
                    _ => None,
                }
            };
            if let (Some(hi), Some(lo)) = (h(bytes[i + 1]), h(bytes[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Build a valid `Stripe-Signature` header for `payload` (route / integration tests).
///
/// Uses the real HMAC scheme so [`construct_event`] accepts the request.
pub fn sign_webhook_header(secret: &str, payload: &[u8], timestamp: i64) -> String {
    format!(
        "t={timestamp},v1={}",
        expected_signature(secret, &timestamp.to_string(), payload)
    )
}

/// Authenticated Stripe REST client.
///
/// Holds the secret key. `Debug` is implemented by hand to print
/// `StripeClient { .. }`, so the key cannot escape through logging.
pub struct StripeClient {
    secret_key: String,
    /// Test-only stand-in for libcurl. Production builds omit this field.
    #[cfg(test)]
    mock: Option<std::sync::Arc<std::sync::Mutex<StripeMock>>>,
}

impl std::fmt::Debug for StripeClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Deliberately opaque: never render the secret key.
        f.write_str("StripeClient { .. }")
    }
}

impl StripeClient {
    /// Build a client from a secret key (`sk_…` or a restricted `rk_…`).
    pub fn new(secret_key: String) -> Self {
        StripeClient {
            secret_key,
            #[cfg(test)]
            mock: None,
        }
    }

    /// Build a client that never touches the network (unit / route tests only).
    #[cfg(test)]
    pub fn with_mock(mock: StripeMock) -> Self {
        StripeClient {
            secret_key: "sk_test_mock".into(),
            mock: Some(Arc::new(Mutex::new(mock))),
        }
    }

    /// Fetch a customer and return its lowercase email.
    ///
    /// `Ok(None)` when the customer has no email — mirroring the Node
    /// `resolveCustomerEmail`, which treats that as a soft miss rather than an
    /// error.
    ///
    /// # Errors
    /// Any [`StripeError`] from the underlying `GET /v1/customers/{id}`.
    pub fn customer_email(&self, customer_id: &str) -> Result<Option<String>, StripeError> {
        let url = format!("{API_BASE}/v1/customers/{}", percent_encode(customer_id));
        let body = self.get(&url)?;
        Ok(body.get_str("email").map(str::to_lowercase))
    }

    /// Fetch a subscription.
    ///
    /// Returned as raw [`Json`] because the caller reads several fields off it
    /// (`status`, `current_period_end`, `items.data[0].current_period_end`)
    /// and must apply the same pre-basil/basil fallback as the Node backend.
    ///
    /// # Errors
    /// Any [`StripeError`] from `GET /v1/subscriptions/{id}`.
    pub fn retrieve_subscription(&self, sub_id: &str) -> Result<Json, StripeError> {
        let url = format!("{API_BASE}/v1/subscriptions/{}", percent_encode(sub_id));
        self.get(&url)
    }

    /// Resolve a price lookup key to a price id.
    ///
    /// `Ok(None)` when no price matches, which the caller turns into a 400.
    /// `expand[0]=data.product` matches the Node call exactly; the expansion is
    /// unused here but kept so the request (and Stripe's response caching and
    /// rate accounting) is identical.
    ///
    /// # Errors
    /// Any [`StripeError`] from `GET /v1/prices`.
    pub fn price_id_for_lookup_key(&self, lookup_key: &str) -> Result<Option<String>, StripeError> {
        let query = form_encode(&[
            ("lookup_keys[0]".to_string(), lookup_key.to_string()),
            ("expand[0]".to_string(), "data.product".to_string()),
        ]);
        let url = format!("{API_BASE}/v1/prices?{query}");
        let body = self.get(&url)?;
        Ok(body
            .get("data")
            .and_then(Json::as_arr)
            .and_then(<[Json]>::first)
            .and_then(|p| p.get_str("id"))
            .map(str::to_string))
    }

    /// Create a subscription-mode Checkout Session.
    ///
    /// # Errors
    /// Any [`StripeError`] from `POST /v1/checkout/sessions`, or
    /// [`StripeError::Parse`] if the response omits `id`.
    pub fn create_checkout_session(
        &self,
        p: CheckoutParams<'_>,
    ) -> Result<CheckoutSession, StripeError> {
        // NOTE: `payment_method_types` is deliberately NOT sent. Commit
        // "Remove payment_method_types so Checkout uses Dashboard dynamic
        // methods" dropped it; sending it again would pin the method list and
        // silently disable Dashboard-configured payment methods.
        let mut pairs = vec![
            ("customer_email".to_string(), p.customer_email.to_string()),
            ("mode".to_string(), "subscription".to_string()),
            ("line_items[0][price]".to_string(), p.price_id.to_string()),
            ("line_items[0][quantity]".to_string(), "1".to_string()),
            ("billing_address_collection".to_string(), "auto".to_string()),
            ("success_url".to_string(), p.success_url.to_string()),
            ("cancel_url".to_string(), p.cancel_url.to_string()),
        ];
        if let Some(app) = p.app_name {
            pairs.push(("metadata[app]".to_string(), app.to_string()));
        }
        pairs.push((
            "subscription_data[metadata][email]".to_string(),
            p.customer_email.to_string(),
        ));
        if let Some(app) = p.app_name {
            pairs.push((
                "subscription_data[metadata][app]".to_string(),
                app.to_string(),
            ));
        }

        let body = self.post(
            &format!("{API_BASE}/v1/checkout/sessions"),
            &form_encode(&pairs),
            p.idempotency_key,
        )?;
        Ok(CheckoutSession {
            url: body.get_str("url").map(str::to_string),
            id: body
                .get_str("id")
                .ok_or_else(|| StripeError::Parse("checkout session has no id".into()))?
                .to_string(),
            customer: body.get_str("customer").map(str::to_string),
        })
    }

    /// Create a Billing Portal Session for an existing customer.
    ///
    /// # Errors
    /// Any [`StripeError`] from `POST /v1/billing_portal/sessions`, or
    /// [`StripeError::Parse`] if the response omits `id`.
    pub fn create_portal_session(
        &self,
        customer: &str,
        return_url: &str,
    ) -> Result<PortalSession, StripeError> {
        let form = form_encode(&[
            ("customer".to_string(), customer.to_string()),
            ("return_url".to_string(), return_url.to_string()),
        ]);
        let body = self.post(&format!("{API_BASE}/v1/billing_portal/sessions"), &form, None)?;
        Ok(PortalSession {
            url: body.get_str("url").map(str::to_string),
            id: body
                .get_str("id")
                .ok_or_else(|| StripeError::Parse("portal session has no id".into()))?
                .to_string(),
        })
    }

    /// Issue an authenticated GET and decode the JSON body.
    fn get(&self, url: &str) -> Result<Json, StripeError> {
        #[cfg(test)]
        if let Some(mock) = &self.mock {
            let guard = mock
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            return guard.handle_get(url);
        }
        let auth = self.auth_header();
        let headers: Vec<(&str, &str)> = vec![
            ("Authorization", auth.as_str()),
            ("Stripe-Version", STRIPE_API_VERSION),
            ("Accept", "application/json"),
        ];
        let res = send_with_retry(Method::Get, url, &headers, None)?;
        decode(res)
    }

    /// Issue an authenticated form POST and decode the JSON body.
    ///
    /// POSTs always carry an `Idempotency-Key` so the retry loop cannot create
    /// a duplicate session. The key is generated once per logical operation and
    /// reused across every attempt.
    fn post(
        &self,
        url: &str,
        form: &str,
        idempotency_key: Option<&str>,
    ) -> Result<Json, StripeError> {
        #[cfg(test)]
        if let Some(mock) = &self.mock {
            let guard = mock
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            return guard.handle_post(url, form);
        }
        let auth = self.auth_header();
        let key = match idempotency_key {
            Some(k) => k.to_string(),
            None => random_uuid_v4().map_err(|e| StripeError::Transport(e.to_string()))?,
        };
        let headers: Vec<(&str, &str)> = vec![
            ("Authorization", auth.as_str()),
            ("Stripe-Version", STRIPE_API_VERSION),
            ("Accept", "application/json"),
            ("Content-Type", "application/x-www-form-urlencoded"),
            ("Idempotency-Key", key.as_str()),
        ];
        let res = send_with_retry(Method::Post, url, &headers, Some(form.as_bytes()))?;
        decode(res)
    }

    /// Build the bearer header. The returned string holds the secret — it is
    /// passed straight to libcurl and never logged.
    fn auth_header(&self) -> String {
        format!("Bearer {}", self.secret_key)
    }
}

/// Turn a completed HTTP response into JSON, mapping Stripe's error envelope.
fn decode(res: HttpResponse) -> Result<Json, StripeError> {
    if (200..300).contains(&res.status) {
        return json::parse(&res.body).map_err(|e| StripeError::Parse(e.to_string()));
    }
    Err(http_error(&res))
}

/// Map a `{"error":{"type","code","message"}}` body onto [`StripeError::Http`].
fn http_error(res: &HttpResponse) -> StripeError {
    let parsed = json::parse(&res.body).ok();
    let err = parsed.as_ref().and_then(|j| j.get("error"));
    let code = err
        .and_then(|e| e.get_str("code"))
        .or_else(|| err.and_then(|e| e.get_str("type")))
        .map(str::to_string);
    let message = err
        .and_then(|e| e.get_str("message"))
        .map(str::to_string)
        .unwrap_or_else(|| format!("request failed with status {}", res.status));
    StripeError::Http { status: res.status, code, message }
}

// ==== RETRY, BACKOFF, CIRCUIT BREAKER ====

/// Circuit-breaker state shared by every Stripe call in the process.
struct CircuitState {
    consecutive_failures: u32,
    open_until: Option<Instant>,
}

impl CircuitState {
    /// True when calls should fail fast without touching the network.
    fn is_open(&self, now: Instant) -> bool {
        matches!(self.open_until, Some(until) if now < until)
    }

    /// Record a completed operation: a reached API resets the breaker.
    fn record_success(&mut self) {
        self.consecutive_failures = 0;
        self.open_until = None;
    }

    /// Record a whole-operation failure (transport, or exhausted retries).
    /// A non-retryable 4xx is *not* a failure — Stripe answered.
    fn record_failure(&mut self, now: Instant) {
        self.consecutive_failures = self.consecutive_failures.saturating_add(1);
        if self.consecutive_failures >= CIRCUIT_FAILURE_THRESHOLD {
            self.open_until = Some(now + CIRCUIT_COOLDOWN);
        }
    }
}

static CIRCUIT: Mutex<CircuitState> =
    Mutex::new(CircuitState { consecutive_failures: 0, open_until: None });

/// Lock the breaker, recovering from poisoning (state is advisory, not data).
fn circuit() -> std::sync::MutexGuard<'static, CircuitState> {
    CIRCUIT.lock().unwrap_or_else(|e| e.into_inner())
}

/// True for statuses worth retrying: rate limits and server-side faults.
fn is_retryable_status(status: u16) -> bool {
    status == 429 || (500..600).contains(&status)
}

/// Read a `Retry-After` header in seconds form, clamped to a sane ceiling.
///
/// Stripe sends the seconds form; the HTTP-date form is not parsed and simply
/// falls back to exponential backoff.
fn retry_after_ms(headers: &[(String, String)]) -> Option<u64> {
    let v = header_value(headers, "retry-after")?;
    let secs: u64 = v.trim().parse().ok()?;
    Some(secs.min(MAX_RETRY_AFTER_SECS) * 1_000)
}

/// Case-insensitive header lookup.
fn header_value<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

/// Emit Stripe's rate-limit headers when it sends them, so an approaching
/// quota is visible before requests start failing.
fn log_rate_limit(headers: &[(String, String)]) {
    for name in ["stripe-ratelimit-remaining", "x-ratelimit-remaining", "ratelimit-remaining"] {
        if let Some(v) = header_value(headers, name) {
            eprintln!("{{\"level\":\"warn\",\"msg\":\"stripe rate limit\",\"{name}\":\"{v}\"}}");
        }
    }
}

/// Perform a request with exponential backoff, `Retry-After` support, and a
/// process-wide circuit breaker.
///
/// Retries transport errors, 429, and 5xx up to [`MAX_RETRIES`] times with
/// 1s/2s/4s/8s delays. POST callers must supply an `Idempotency-Key` header so
/// a retried create cannot duplicate.
fn send_with_retry(
    method: Method,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&[u8]>,
) -> Result<HttpResponse, StripeError> {
    if circuit().is_open(Instant::now()) {
        return Err(StripeError::CircuitOpen);
    }

    let mut last: Option<StripeError> = None;
    for attempt in 0..=MAX_RETRIES {
        match request(method, url, headers, body) {
            Ok(res) => {
                log_rate_limit(&res.headers);
                if !is_retryable_status(res.status) {
                    circuit().record_success();
                    return Ok(res);
                }
                let wait = retry_after_ms(&res.headers)
                    .unwrap_or_else(|| BASE_BACKOFF_MS << attempt);
                last = Some(http_error(&res));
                if attempt == MAX_RETRIES {
                    break;
                }
                std::thread::sleep(Duration::from_millis(wait));
            }
            Err(e) => {
                last = Some(e);
                if attempt == MAX_RETRIES {
                    break;
                }
                std::thread::sleep(Duration::from_millis(BASE_BACKOFF_MS << attempt));
            }
        }
    }

    circuit().record_failure(Instant::now());
    Err(last.unwrap_or_else(|| StripeError::Transport("request failed".into())))
}

// ==== HTTP OVER SYSTEM libcurl ====

/// HTTP verbs this client needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Method {
    Get,
    Post,
}

/// A completed HTTP response.
struct HttpResponse {
    /// HTTP status code.
    status: u16,
    /// Raw response body.
    body: Vec<u8>,
    /// Response headers as received, name and value trimmed.
    headers: Vec<(String, String)>,
}

/// Opaque libcurl easy handle.
#[repr(C)]
struct CURL {
    _private: [u8; 0],
}

/// Opaque libcurl string list (used for request headers).
#[repr(C)]
struct CurlSlist {
    _private: [u8; 0],
}

/// libcurl write/header callback shape.
type CurlCb = extern "C" fn(*mut c_char, usize, usize, *mut c_void) -> usize;

const CURL_GLOBAL_DEFAULT: c_long = 3;
const CURLE_OK: c_int = 0;

const CURLOPT_WRITEDATA: c_int = 10_001;
const CURLOPT_URL: c_int = 10_002;
const CURLOPT_POSTFIELDS: c_int = 10_015;
const CURLOPT_USERAGENT: c_int = 10_018;
const CURLOPT_HTTPHEADER: c_int = 10_023;
const CURLOPT_HEADERDATA: c_int = 10_029;
const CURLOPT_WRITEFUNCTION: c_int = 20_011;
const CURLOPT_HEADERFUNCTION: c_int = 20_079;
const CURLOPT_POST: c_int = 47;
const CURLOPT_POSTFIELDSIZE: c_int = 60;
const CURLOPT_FOLLOWLOCATION: c_int = 52;
const CURLOPT_SSL_VERIFYPEER: c_int = 64;
const CURLOPT_SSL_VERIFYHOST: c_int = 81;
const CURLOPT_NOSIGNAL: c_int = 99;
const CURLOPT_TIMEOUT_MS: c_int = 155;
const CURLOPT_CONNECTTIMEOUT_MS: c_int = 156;

/// `CURLINFO_RESPONSE_CODE` = `CURLINFO_LONG (0x200000) + 2`.
const CURLINFO_RESPONSE_CODE: c_int = 2_097_154;

#[link(name = "curl")]
extern "C" {
    fn curl_global_init(flags: c_long) -> c_int;
    fn curl_easy_init() -> *mut CURL;
    fn curl_easy_perform(handle: *mut CURL) -> c_int;
    fn curl_easy_cleanup(handle: *mut CURL);
    fn curl_easy_strerror(code: c_int) -> *const c_char;
    fn curl_slist_append(list: *mut CurlSlist, string: *const c_char) -> *mut CurlSlist;
    fn curl_slist_free_all(list: *mut CurlSlist);

    // Both of these are variadic in C and must be declared variadic here.
    // Substituting a non-variadic signature per argument class does not work:
    // the Apple arm64 ABI passes every variadic argument on the stack, so a
    // non-variadic call leaves the value in a register and the callee reads an
    // uninitialized stack slot. The option number is a fixed parameter, so it
    // still arrives and `setopt` still reports CURLE_OK — the value is simply
    // lost. Callers must therefore pass each argument at its documented width
    // (`c_long` for long options, a pointer for the rest), because C varargs
    // apply no conversion beyond the default promotions.
    fn curl_easy_setopt(handle: *mut CURL, option: c_int, ...) -> c_int;
    fn curl_easy_getinfo(handle: *mut CURL, info: c_int, ...) -> c_int;
}

/// `curl_global_init` must run exactly once before any easy handle is created.
static CURL_INIT: Once = Once::new();

/// Run libcurl's one-time global initialization.
fn global_init() {
    CURL_INIT.call_once(|| {
        // SAFETY: called exactly once, before any curl_easy_init, per libcurl's
        // documented contract; CURL_GLOBAL_DEFAULT is a valid flag value.
        unsafe {
            curl_global_init(CURL_GLOBAL_DEFAULT);
        }
    });
}

/// libcurl write callback: append the chunk to the `Vec<u8>` behind `userdata`.
///
/// Must not unwind across the FFI boundary, so the body runs inside
/// `catch_unwind`; a panic is reported as a short write, which makes libcurl
/// abort the transfer with `CURLE_WRITE_ERROR` instead of aborting the process.
extern "C" fn write_cb(ptr: *mut c_char, size: usize, nmemb: usize, userdata: *mut c_void) -> usize {
    let len = size.saturating_mul(nmemb);
    if ptr.is_null() || userdata.is_null() {
        return 0;
    }
    let result = std::panic::catch_unwind(|| {
        // SAFETY: libcurl guarantees `ptr` points to `len` readable bytes for
        // the duration of the call, and `userdata` is the `&mut Vec<u8>` this
        // transfer passed to CURLOPT_WRITEDATA, which outlives curl_easy_perform.
        unsafe {
            let sink = &mut *(userdata as *mut Vec<u8>);
            sink.extend_from_slice(std::slice::from_raw_parts(ptr as *const u8, len));
        }
        len
    });
    result.unwrap_or(0)
}

/// libcurl header callback: collect `Name: value` lines (status line skipped).
///
/// Panic-safe for the same reason as [`write_cb`].
extern "C" fn header_cb(
    ptr: *mut c_char,
    size: usize,
    nmemb: usize,
    userdata: *mut c_void,
) -> usize {
    let len = size.saturating_mul(nmemb);
    if ptr.is_null() || userdata.is_null() {
        return 0;
    }
    let result = std::panic::catch_unwind(|| {
        // SAFETY: same contract as write_cb — `ptr`/`len` describe a valid
        // read-only buffer owned by libcurl, and `userdata` is the
        // `&mut Vec<(String, String)>` handed to CURLOPT_HEADERDATA.
        let line = unsafe { std::slice::from_raw_parts(ptr as *const u8, len) };
        if let Ok(text) = std::str::from_utf8(line) {
            if let Some((k, v)) = text.split_once(':') {
                // SAFETY: see above — `userdata` is the header sink for this transfer.
                let sink = unsafe { &mut *(userdata as *mut Vec<(String, String)>) };
                sink.push((k.trim().to_string(), v.trim().to_string()));
            }
        }
        len
    });
    result.unwrap_or(0)
}

/// Owns a libcurl easy handle and frees it on drop, including on early return.
struct EasyHandle(*mut CURL);

impl Drop for EasyHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: `self.0` came from curl_easy_init, is non-null, and is
            // cleaned up exactly once because EasyHandle is neither Copy nor Clone.
            unsafe { curl_easy_cleanup(self.0) };
        }
    }
}

/// Owns a libcurl header list and frees it on drop.
struct HeaderList(*mut CurlSlist);

impl Drop for HeaderList {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: `self.0` is the head returned by curl_slist_append and is
            // freed exactly once; libcurl tolerates a NULL list, which we skip anyway.
            unsafe { curl_slist_free_all(self.0) };
        }
    }
}

/// Translate a libcurl result code into a transport error message.
///
/// Uses `curl_easy_strerror`, whose strings are static and never contain
/// request headers — so the API key cannot leak through this path.
fn curl_message(code: c_int) -> String {
    // SAFETY: curl_easy_strerror returns a pointer to a static NUL-terminated
    // string for any code, valid for the program's lifetime; we only read it.
    let text = unsafe {
        let p = curl_easy_strerror(code);
        if p.is_null() {
            None
        } else {
            std::ffi::CStr::from_ptr(p).to_str().ok().map(str::to_string)
        }
    };
    text.unwrap_or_else(|| format!("curl error {code}"))
}

/// Perform one HTTP request through the system libcurl.
///
/// Certificate verification is forced on (`SSL_VERIFYPEER=1`,
/// `SSL_VERIFYHOST=2`) and there is deliberately no parameter to relax it.
/// Redirects are not followed, so a redirect cannot replay the `Authorization`
/// header to another host.
fn request(
    method: Method,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&[u8]>,
) -> Result<HttpResponse, StripeError> {
    global_init();

    let c_url = CString::new(url).map_err(|_| StripeError::Transport("url has a NUL byte".into()))?;
    let user_agent = CString::new(format!(
        "skateboard-backend-rs/{} (libcurl)",
        env!("CARGO_PKG_VERSION")
    ))
    .map_err(|_| StripeError::Transport("bad user agent".into()))?;

    // SAFETY: curl_easy_init takes no arguments and returns either a fresh
    // handle or NULL; the handle is immediately wrapped so Drop frees it.
    let handle = EasyHandle(unsafe { curl_easy_init() });
    if handle.0.is_null() {
        return Err(StripeError::Transport("curl_easy_init failed".into()));
    }

    let mut list = HeaderList(std::ptr::null_mut());
    for (name, value) in headers {
        let line = CString::new(format!("{name}: {value}"))
            .map_err(|_| StripeError::Transport("header has a NUL byte".into()))?;
        // SAFETY: `list.0` is NULL on the first call (documented as "start a new
        // list") or a list head from a previous append; `line` is a valid
        // NUL-terminated string that libcurl copies before returning.
        let next = unsafe { curl_slist_append(list.0, line.as_ptr()) };
        if next.is_null() {
            return Err(StripeError::Transport("curl_slist_append failed".into()));
        }
        list.0 = next;
    }

    let mut sink: Vec<u8> = Vec::new();
    let mut head_sink: Vec<(String, String)> = Vec::new();

    // SAFETY: every call below targets a live handle from curl_easy_init with an
    // option constant matched to its documented argument class, passed at the
    // width libcurl's `va_arg` reads (`c_long` for long options, a pointer
    // otherwise). All pointer arguments — `c_url`, `user_agent`, `list`, `sink`,
    // `head_sink`, and `body` — are owned by this stack frame and outlive
    // curl_easy_perform.
    let setup = unsafe {
        let h = handle.0;
        let mut rc = curl_easy_setopt(h, CURLOPT_URL, c_url.as_ptr().cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_USERAGENT, user_agent.as_ptr().cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_WRITEFUNCTION, write_cb as CurlCb);
        rc |= curl_easy_setopt(h, CURLOPT_WRITEDATA, (&mut sink as *mut Vec<u8>).cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_HEADERFUNCTION, header_cb as CurlCb);
        rc |= curl_easy_setopt(
            h,
            CURLOPT_HEADERDATA,
            (&mut head_sink as *mut Vec<(String, String)>).cast::<c_void>(),
        );
        rc |= curl_easy_setopt(h, CURLOPT_TIMEOUT_MS, TIMEOUT_MS);
        rc |= curl_easy_setopt(h, CURLOPT_CONNECTTIMEOUT_MS, CONNECT_TIMEOUT_MS);
        rc |= curl_easy_setopt(h, CURLOPT_FOLLOWLOCATION, 0 as c_long);
        // NOSIGNAL is required for thread safety: without it libcurl uses
        // SIGALRM/alarm() for DNS timeouts, which is process-global.
        rc |= curl_easy_setopt(h, CURLOPT_NOSIGNAL, 1 as c_long);
        // Certificate verification: never relaxed, no knob to relax it.
        rc |= curl_easy_setopt(h, CURLOPT_SSL_VERIFYPEER, 1 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_SSL_VERIFYHOST, 2 as c_long);
        if !list.0.is_null() {
            rc |= curl_easy_setopt(h, CURLOPT_HTTPHEADER, list.0);
        }
        if method == Method::Post {
            let payload = body.unwrap_or(&[]);
            rc |= curl_easy_setopt(h, CURLOPT_POST, 1 as c_long);
            // Size first, then the buffer: libcurl then never scans for a NUL.
            rc |= curl_easy_setopt(h, CURLOPT_POSTFIELDSIZE, payload.len() as c_long);
            rc |= curl_easy_setopt(h, CURLOPT_POSTFIELDS, payload.as_ptr().cast::<c_void>());
        }
        rc
    };
    if setup != CURLE_OK {
        return Err(StripeError::Transport("failed to configure curl handle".into()));
    }

    // SAFETY: the handle is fully configured and still alive; perform blocks
    // until the transfer finishes, during which every buffer above stays valid.
    let rc = unsafe { curl_easy_perform(handle.0) };
    if rc != CURLE_OK {
        return Err(StripeError::Transport(curl_message(rc)));
    }

    let mut status: c_long = 0;
    // SAFETY: CURLINFO_RESPONSE_CODE is a CURLINFO_LONG info, so the out
    // parameter must be a `*mut long` — which is exactly what is passed.
    let rc = unsafe { curl_easy_getinfo(handle.0, CURLINFO_RESPONSE_CODE, &mut status as *mut c_long) };
    if rc != CURLE_OK {
        return Err(StripeError::Transport("could not read response status".into()));
    }

    Ok(HttpResponse {
        status: status.clamp(0, u16::MAX as c_long) as u16,
        body: sink,
        headers: head_sink,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "whsec_test_secret";
    const PAYLOAD: &[u8] = br#"{"id":"evt_1","object":"event","type":"checkout.session.completed"}"#;

    fn signed_header(secret: &str, t: i64, payload: &[u8]) -> String {
        format!("t={t},v1={}", expected_signature(secret, &t.to_string(), payload))
    }

    // ---- form encoding ----

    #[test]
    fn percent_encodes_space_as_pct20() {
        assert_eq!(percent_encode("a b"), "a%20b");
    }

    #[test]
    fn percent_encodes_unreserved_unchanged() {
        assert_eq!(percent_encode("aZ0-._~"), "aZ0-._~");
    }

    #[test]
    fn percent_encodes_brackets_and_at() {
        assert_eq!(percent_encode("metadata[app]"), "metadata%5Bapp%5D");
        assert_eq!(percent_encode("a@b.com"), "a%40b.com");
    }

    #[test]
    fn percent_encodes_multibyte_utf8() {
        assert_eq!(percent_encode("é"), "%C3%A9");
    }

    #[test]
    fn form_encodes_checkout_line_items() {
        let pairs = vec![
            ("line_items[0][price]".to_string(), "price_1".to_string()),
            ("line_items[0][quantity]".to_string(), "1".to_string()),
            ("metadata[app]".to_string(), "onyx".to_string()),
        ];
        assert_eq!(
            form_encode(&pairs),
            "line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bapp%5D=onyx"
        );
    }

    #[test]
    fn form_encodes_urls_with_query_strings() {
        let pairs = vec![(
            "success_url".to_string(),
            "https://x.dev/app/payment?success=true".to_string(),
        )];
        assert_eq!(
            form_encode(&pairs),
            "success_url=https%3A%2F%2Fx.dev%2Fapp%2Fpayment%3Fsuccess%3Dtrue"
        );
    }

    #[test]
    fn form_encodes_empty_pairs_to_empty_string() {
        assert_eq!(form_encode(&[]), "");
    }

    #[test]
    fn price_lookup_query_matches_node_call() {
        let query = form_encode(&[
            ("lookup_keys[0]".to_string(), "pro monthly".to_string()),
            ("expand[0]".to_string(), "data.product".to_string()),
        ]);
        assert_eq!(
            query,
            "lookup_keys%5B0%5D=pro%20monthly&expand%5B0%5D=data.product"
        );
    }

    // ---- signature scheme ----

    #[test]
    fn expected_signature_matches_known_vector() {
        // Cross-checked against Node:
        // crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
        assert_eq!(
            expected_signature(SECRET, "1700000000", PAYLOAD),
            "d1e4aa90551919f198c22ba0a9691b35338d4b631d54ce1f1465e93b1d41c430"
        );
    }

    #[test]
    fn accepts_a_valid_signature() {
        let now = 1_800_000_000;
        let header = signed_header(SECRET, now, PAYLOAD);
        assert_eq!(verify_signature(PAYLOAD, &header, SECRET, 300, now), Ok(()));
    }

    #[test]
    fn rejects_a_tampered_payload() {
        let now = 1_800_000_000;
        let header = signed_header(SECRET, now, PAYLOAD);
        let tampered = br#"{"id":"evt_2","object":"event","type":"checkout.session.completed"}"#;
        assert_eq!(
            verify_signature(tampered, &header, SECRET, 300, now),
            Err(SignatureError::NoMatchingSignature)
        );
    }

    #[test]
    fn rejects_the_wrong_secret() {
        let now = 1_800_000_000;
        let header = signed_header(SECRET, now, PAYLOAD);
        assert_eq!(
            verify_signature(PAYLOAD, &header, "whsec_other", 300, now),
            Err(SignatureError::NoMatchingSignature)
        );
    }

    #[test]
    fn rejects_an_expired_timestamp() {
        let signed_at = 1_800_000_000;
        let header = signed_header(SECRET, signed_at, PAYLOAD);
        let now = signed_at + 301;
        assert_eq!(
            verify_signature(PAYLOAD, &header, SECRET, 300, now),
            Err(SignatureError::TimestampOutsideTolerance { age_secs: 301, tolerance_secs: 300 })
        );
    }

    #[test]
    fn rejects_a_future_timestamp_beyond_tolerance() {
        let signed_at = 1_800_000_000;
        let header = signed_header(SECRET, signed_at, PAYLOAD);
        let now = signed_at - 301;
        assert_eq!(
            verify_signature(PAYLOAD, &header, SECRET, 300, now),
            Err(SignatureError::TimestampOutsideTolerance { age_secs: -301, tolerance_secs: 300 })
        );
    }

    #[test]
    fn accepts_at_the_tolerance_boundary() {
        let signed_at = 1_800_000_000;
        let header = signed_header(SECRET, signed_at, PAYLOAD);
        assert_eq!(
            verify_signature(PAYLOAD, &header, SECRET, 300, signed_at + 300),
            Ok(())
        );
    }

    #[test]
    fn rejects_a_missing_timestamp() {
        let sig = expected_signature(SECRET, "1800000000", PAYLOAD);
        let header = format!("v1={sig}");
        assert_eq!(
            verify_signature(PAYLOAD, &header, SECRET, 300, 1_800_000_000),
            Err(SignatureError::MissingTimestamp)
        );
    }

    #[test]
    fn rejects_a_non_numeric_timestamp() {
        let sig = expected_signature(SECRET, "abc", PAYLOAD);
        let header = format!("t=abc,v1={sig}");
        assert_eq!(
            verify_signature(PAYLOAD, &header, SECRET, 300, 1_800_000_000),
            Err(SignatureError::InvalidTimestamp)
        );
    }

    #[test]
    fn rejects_a_header_with_no_v1_entry() {
        let header = "t=1800000000,v0=deadbeef";
        assert_eq!(
            verify_signature(PAYLOAD, header, SECRET, 300, 1_800_000_000),
            Err(SignatureError::NoSignatures)
        );
    }

    #[test]
    fn rejects_an_empty_secret() {
        let header = signed_header(SECRET, 1_800_000_000, PAYLOAD);
        assert_eq!(
            verify_signature(PAYLOAD, &header, "", 300, 1_800_000_000),
            Err(SignatureError::EmptySecret)
        );
    }

    #[test]
    fn accepts_when_only_the_second_v1_matches() {
        let now = 1_800_000_000;
        let good = expected_signature(SECRET, &now.to_string(), PAYLOAD);
        let header = format!("t={now},v1=00000000,v1={good}");
        assert_eq!(verify_signature(PAYLOAD, &header, SECRET, 300, now), Ok(()));
    }

    #[test]
    fn ignores_whitespace_and_unknown_schemes() {
        let now = 1_800_000_000;
        let good = expected_signature(SECRET, &now.to_string(), PAYLOAD);
        let header = format!("t= {now} , v0=zz , v1= {good} ");
        assert_eq!(verify_signature(PAYLOAD, &header, SECRET, 300, now), Ok(()));
    }

    #[test]
    fn parses_multiple_v1_entries() {
        let parsed = parse_sig_header("t=1,v1=aa,v1=bb,v0=cc");
        assert_eq!(parsed.v1, vec!["aa", "bb"]);
    }

    #[test]
    fn construct_event_parses_a_verified_body() {
        let now = now_unix();
        let header = signed_header(SECRET, now, PAYLOAD);
        let event = construct_event(PAYLOAD, &header, SECRET, 300).unwrap();
        assert_eq!(event.get_str("id"), Some("evt_1"));
    }

    #[test]
    fn construct_event_rejects_before_parsing() {
        let now = now_unix();
        let header = signed_header(SECRET, now, b"not json");
        let err = construct_event(b"not json", &header, SECRET, 300).unwrap_err();
        // Verification passes, so the failure must come from the parser.
        assert!(matches!(err, StripeError::Parse(_)));
    }

    #[test]
    fn construct_event_does_not_parse_unverified_bodies() {
        let err = construct_event(b"not json", "t=1,v1=ff", SECRET, 300).unwrap_err();
        assert!(matches!(err, StripeError::Signature(_)));
    }

    // ---- error mapping ----

    #[test]
    fn maps_stripe_error_envelope() {
        let res = HttpResponse {
            status: 400,
            body: br#"{"error":{"type":"invalid_request_error","code":"resource_missing","message":"No such price"}}"#.to_vec(),
            headers: Vec::new(),
        };
        assert_eq!(
            http_error(&res),
            StripeError::Http {
                status: 400,
                code: Some("resource_missing".into()),
                message: "No such price".into(),
            }
        );
    }

    #[test]
    fn falls_back_to_error_type_when_code_is_absent() {
        let res = HttpResponse {
            status: 401,
            body: br#"{"error":{"type":"invalid_request_error","message":"Invalid API Key"}}"#.to_vec(),
            headers: Vec::new(),
        };
        match http_error(&res) {
            StripeError::Http { code, .. } => assert_eq!(code.as_deref(), Some("invalid_request_error")),
            other => panic!("expected Http, got {other:?}"),
        }
    }

    #[test]
    fn maps_a_non_json_error_body() {
        let res = HttpResponse { status: 502, body: b"<html>bad gateway".to_vec(), headers: Vec::new() };
        assert_eq!(
            http_error(&res),
            StripeError::Http {
                status: 502,
                code: None,
                message: "request failed with status 502".into(),
            }
        );
    }

    #[test]
    fn decode_returns_json_for_2xx() {
        let res = HttpResponse { status: 200, body: br#"{"id":"cus_1"}"#.to_vec(), headers: Vec::new() };
        assert_eq!(decode(res).unwrap().get_str("id"), Some("cus_1"));
    }

    // ---- retry policy ----

    #[test]
    fn retries_rate_limits_and_server_errors_only() {
        assert!(is_retryable_status(429));
        assert!(is_retryable_status(500));
        assert!(is_retryable_status(503));
        assert!(!is_retryable_status(200));
        assert!(!is_retryable_status(400));
        assert!(!is_retryable_status(402));
    }

    #[test]
    fn reads_retry_after_seconds() {
        let headers = vec![("Retry-After".to_string(), "2".to_string())];
        assert_eq!(retry_after_ms(&headers), Some(2_000));
    }

    #[test]
    fn clamps_an_absurd_retry_after() {
        let headers = vec![("retry-after".to_string(), "99999".to_string())];
        assert_eq!(retry_after_ms(&headers), Some(MAX_RETRY_AFTER_SECS * 1_000));
    }

    #[test]
    fn ignores_an_http_date_retry_after() {
        let headers = vec![("Retry-After".to_string(), "Wed, 21 Oct 2026 07:28:00 GMT".to_string())];
        assert_eq!(retry_after_ms(&headers), None);
    }

    #[test]
    fn backoff_doubles_per_attempt() {
        let delays: Vec<u64> = (0..MAX_RETRIES).map(|a| BASE_BACKOFF_MS << a).collect();
        assert_eq!(delays, vec![1_000, 2_000, 4_000, 8_000]);
    }

    #[test]
    fn finds_headers_case_insensitively() {
        let headers = vec![("Stripe-RateLimit-Remaining".to_string(), "7".to_string())];
        assert_eq!(header_value(&headers, "stripe-ratelimit-remaining"), Some("7"));
    }

    // ---- circuit breaker ----

    #[test]
    fn circuit_opens_after_three_consecutive_failures() {
        let now = Instant::now();
        let mut c = CircuitState { consecutive_failures: 0, open_until: None };
        c.record_failure(now);
        c.record_failure(now);
        assert!(!c.is_open(now));
        c.record_failure(now);
        assert!(c.is_open(now));
    }

    #[test]
    fn circuit_closes_after_the_cooldown() {
        let now = Instant::now();
        let mut c = CircuitState { consecutive_failures: 2, open_until: None };
        c.record_failure(now);
        assert!(c.is_open(now));
        assert!(!c.is_open(now + CIRCUIT_COOLDOWN + Duration::from_secs(1)));
    }

    #[test]
    fn success_resets_the_failure_count() {
        let now = Instant::now();
        let mut c = CircuitState { consecutive_failures: 0, open_until: None };
        c.record_failure(now);
        c.record_failure(now);
        c.record_success();
        c.record_failure(now);
        assert!(!c.is_open(now));
    }

    // ---- secret hygiene ----

    #[test]
    fn debug_never_prints_the_secret_key() {
        let client = StripeClient::new("sk_live_SUPERSECRET".to_string());
        let rendered = format!("{client:?}");
        assert_eq!(rendered, "StripeClient { .. }");
        assert!(!rendered.contains("SUPERSECRET"));
    }

    #[test]
    fn error_display_never_prints_a_secret() {
        let e = StripeError::Http {
            status: 401,
            code: Some("api_key_expired".into()),
            message: "Expired API Key provided".into(),
        };
        assert_eq!(
            e.to_string(),
            "stripe HTTP 401 (api_key_expired): Expired API Key provided"
        );
    }

    // ---- libcurl argument passing ----

    /// `curl_easy_setopt` is variadic, so a wrong declaration silently drops
    /// every value while still returning `CURLE_OK` — which would leave
    /// certificate verification and the timeouts unset. Connecting to a closed
    /// local port separates the two outcomes without a network or a key: if the
    /// URL arrived, libcurl fails to connect; if it was dropped, libcurl reports
    /// a malformed URL instead.
    #[test]
    fn setopt_values_reach_libcurl() {
        // Port 1 is privileged and never listening, so this cannot hang.
        let result = request(Method::Get, "http://127.0.0.1:1/", &[], None);
        let Err(StripeError::Transport(message)) = result else {
            panic!("expected a transport error connecting to a closed port");
        };
        let lowered = message.to_lowercase();
        assert!(
            !lowered.contains("url"),
            "libcurl never received the URL, so setopt arguments are being dropped: {message}"
        );
        assert!(
            lowered.contains("connect"),
            "expected a connection failure, got: {message}"
        );
    }

    // ---- live network (opt-in only) ----

    /// Requires `STRIPE_TEST_KEY` and real network access; never run in CI.
    #[test]
    #[ignore = "makes a live Stripe API call"]
    fn live_customer_lookup() {
        let key = std::env::var("STRIPE_TEST_KEY").expect("STRIPE_TEST_KEY");
        let id = std::env::var("STRIPE_TEST_CUSTOMER").expect("STRIPE_TEST_CUSTOMER");
        let client = StripeClient::new(key);
        assert!(client.customer_email(&id).is_ok());
    }
}

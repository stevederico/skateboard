//! JWT signing/verification and session token helpers.
//!
//! Zero-crate port of the JWT half of `backend/lib/auth.ts`. Tokens are
//! byte-compatible with the Node backend (HS256 over
//! `base64url(header).base64url(payload)`), so a cookie issued by either
//! server verifies against the other.

use crate::crypto::{base64url_decode, base64url_encode, ct_eq, hmac_sha256};
use crate::json::{self, Json};

/// Default JWT lifetime in days.
pub const TOKEN_EXPIRATION_DAYS: i64 = 30;

/// Largest `exp` accepted, as seconds. Beyond 2^53 a JSON number cannot even
/// represent whole seconds exactly, so such a claim is treated as malformed.
const MAX_SAFE_EXP: f64 = 9_007_199_254_740_992.0;

/// Decoded JWT body.
#[derive(Debug, Clone, PartialEq)]
pub struct JwtPayload {
    /// Authenticated user id.
    pub user_id: String,
    /// Expiry as Unix seconds, when present.
    pub exp: Option<i64>,
}

/// Why a token failed verification.
///
/// `Expired` is kept distinct because the Node server returns a different
/// error body (`"Token expired"` vs `"Invalid token"`) for it.
#[derive(Debug, Clone, PartialEq)]
pub enum JwtError {
    /// Wrong segment count, bad base64, or a payload missing `userID`.
    Malformed,
    /// Signature did not match the secret.
    BadSignature,
    /// `exp` is in the past.
    Expired,
}

/// Unix-seconds timestamp `expiration_days` in the future.
///
/// Matches `tokenExpireTimestamp()`.
pub fn token_expire_timestamp(expiration_days: i64) -> i64 {
    crate::config::now_secs() + expiration_days * 24 * 60 * 60
}

/// Sign an HS256 JWT.
///
/// Produces the same bytes as the Node implementation: a fixed
/// `{"alg":"HS256","typ":"JWT"}` header, then the payload, joined with `.` and
/// signed over the first two segments.
pub fn jwt_sign(payload: &JwtPayload, secret: &str) -> String {
    // Written literally rather than via the JSON serializer: the key order of
    // both the header and the payload is part of the token bytes, and the
    // serializer sorts keys.
    let head = base64url_encode(br#"{"alg":"HS256","typ":"JWT"}"#);
    let body_json = match payload.exp {
        Some(exp) => format!(
            r#"{{"userID":{},"exp":{}}}"#,
            json::stringify(&Json::Str(payload.user_id.clone())),
            exp
        ),
        None => format!(r#"{{"userID":{}}}"#, json::stringify(&Json::Str(payload.user_id.clone()))),
    };
    let body = base64url_encode(body_json.as_bytes());
    let signing_input = format!("{head}.{body}");
    let sig = base64url_encode(&hmac_sha256(secret.as_bytes(), signing_input.as_bytes()));
    format!("{signing_input}.{sig}")
}

/// Verify an HS256 JWT and return its payload.
///
/// Checks the signature in constant time before parsing the body, then
/// enforces `exp`. A payload without a string `userID` is rejected, matching
/// the `isJwtPayload` guard in the Node backend.
///
/// # Errors
/// [`JwtError::Malformed`], [`JwtError::BadSignature`], or [`JwtError::Expired`].
pub fn jwt_verify(token: &str, secret: &str) -> Result<JwtPayload, JwtError> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(JwtError::Malformed);
    }
    let (head, body, sig) = (parts[0], parts[1], parts[2]);
    if head.is_empty() || body.is_empty() || sig.is_empty() {
        return Err(JwtError::Malformed);
    }

    let signing_input = format!("{head}.{body}");
    let expected = base64url_encode(&hmac_sha256(secret.as_bytes(), signing_input.as_bytes()));
    // Node compares the base64url *text*, and bails on a length mismatch
    // before calling timingSafeEqual. Replicated exactly.
    if sig.len() != expected.len() || !ct_eq(sig.as_bytes(), expected.as_bytes()) {
        return Err(JwtError::BadSignature);
    }

    let raw = base64url_decode(body).ok_or(JwtError::Malformed)?;
    let decoded = json::parse(&raw).map_err(|_| JwtError::Malformed)?;
    let user_id = decoded.get_str("userID").ok_or(JwtError::Malformed)?.to_string();
    let exp = match decoded.get("exp") {
        None | Some(Json::Null) => None,
        // A fractional or out-of-range `exp` is rejected rather than cast: `as i64`
        // saturates, so a claim like `1e30` would otherwise become i64::MAX and never expire.
        Some(Json::Num(v)) if v.abs() < MAX_SAFE_EXP && v.fract() == 0.0 => Some(*v as i64),
        // A non-numeric `exp` fails the Node guard outright.
        Some(_) => return Err(JwtError::Malformed),
    };

    // Node tests `if (payload.exp && ...)`, so an `exp` of 0 is falsy and
    // skips the expiry check entirely. Replicated.
    if let Some(exp) = exp {
        if exp != 0 && crate::config::now_secs() > exp {
            return Err(JwtError::Expired);
        }
    }

    Ok(JwtPayload { user_id, exp })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test-secret-value";

    #[test]
    fn signs_and_verifies_round_trip() {
        let p = JwtPayload { user_id: "abc-123".into(), exp: Some(token_expire_timestamp(30)) };
        let token = jwt_sign(&p, SECRET);
        assert_eq!(jwt_verify(&token, SECRET).unwrap(), p);
    }

    #[test]
    fn rejects_wrong_secret() {
        let token = jwt_sign(&JwtPayload { user_id: "u".into(), exp: Some(token_expire_timestamp(1)) }, SECRET);
        assert_eq!(jwt_verify(&token, "other"), Err(JwtError::BadSignature));
    }

    #[test]
    fn rejects_tampered_payload() {
        let token = jwt_sign(&JwtPayload { user_id: "u".into(), exp: Some(token_expire_timestamp(1)) }, SECRET);
        let mut parts: Vec<&str> = token.split('.').collect();
        let forged = base64url_encode(br#"{"userID":"attacker","exp":9999999999}"#);
        parts[1] = &forged;
        assert_eq!(jwt_verify(&parts.join("."), SECRET), Err(JwtError::BadSignature));
    }

    #[test]
    fn reports_expiry_distinctly() {
        let token = jwt_sign(&JwtPayload { user_id: "u".into(), exp: Some(crate::config::now_secs() - 10) }, SECRET);
        assert_eq!(jwt_verify(&token, SECRET), Err(JwtError::Expired));
    }

    #[test]
    fn rejects_malformed_shapes() {
        assert_eq!(jwt_verify("a.b", SECRET), Err(JwtError::Malformed));
        assert_eq!(jwt_verify("a..c", SECRET), Err(JwtError::Malformed));
        assert_eq!(jwt_verify("", SECRET), Err(JwtError::Malformed));
    }

    #[test]
    fn rejects_payload_without_user_id() {
        let head = base64url_encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let body = base64url_encode(br#"{"sub":"x"}"#);
        let input = format!("{head}.{body}");
        let sig = base64url_encode(&hmac_sha256(SECRET.as_bytes(), input.as_bytes()));
        assert_eq!(jwt_verify(&format!("{input}.{sig}"), SECRET), Err(JwtError::Malformed));
    }

    /// Build a signed token around an arbitrary payload JSON body.
    fn signed_with_body(body_json: &str) -> String {
        let head = base64url_encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let body = base64url_encode(body_json.as_bytes());
        let input = format!("{head}.{body}");
        let sig = base64url_encode(&hmac_sha256(SECRET.as_bytes(), input.as_bytes()));
        format!("{input}.{sig}")
    }

    #[test]
    fn rejects_exp_beyond_the_safe_integer_range() {
        let token = signed_with_body(r#"{"userID":"u","exp":1e30}"#);
        assert_eq!(jwt_verify(&token, SECRET), Err(JwtError::Malformed));
    }

    #[test]
    fn rejects_fractional_exp() {
        let token = signed_with_body(r#"{"userID":"u","exp":1.5}"#);
        assert_eq!(jwt_verify(&token, SECRET), Err(JwtError::Malformed));
    }

    #[test]
    fn header_segment_is_the_node_literal() {
        let token = jwt_sign(&JwtPayload { user_id: "u".into(), exp: None }, SECRET);
        let head = token.split('.').next().unwrap();
        assert_eq!(head, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    }
}

//! HTTP route handlers — zero-crate port of `backend/server.ts`.
//!
//! One function per route. Status codes, JSON error bodies, and cookie
//! attributes match the Node server so a parity harness can byte-diff them.

use std::collections::BTreeMap;

use crate::auth::{self, JwtError, JwtPayload, TOKEN_EXPIRATION_DAYS};
use crate::config;
use crate::crypto::{self, ct_eq};
use crate::db::{self, AuthRecord, Subscription, Usage, User, UserQuery};
use crate::http::{Cookie, Request, Response, SameSite};
use crate::json::{self, Json};
use crate::kdf;
use crate::middleware;
use crate::state::AppState;
use crate::stores::CSRF_TOKEN_EXPIRY_MS;
use crate::stripe::{self, CheckoutParams};
use crate::validation;

/// Dispatch one request: CORS, security headers, routes, access log.
pub fn handle(state: &AppState, req: Request) -> Response {
    let start = config::now_ms();
    middleware::dev_request_log(&state.log, &req, state.prod);
    let res = if req.method.eq_ignore_ascii_case("OPTIONS") {
        middleware::preflight(&req, &state.cors_origins)
    } else {
        let inner = dispatch(state, &req);
        let inner = middleware::apply_secure_headers(inner, state.prod);
        middleware::apply_cors(inner, &req, &state.cors_origins)
    };
    middleware::access_log(&req.method, &req.path, res.status, config::now_ms() - start);
    res
}

fn dispatch(state: &AppState, req: &Request) -> Response {
    match (req.method.as_str(), req.path.as_str()) {
        ("POST", "/api/payment") => payment(state, req),
        ("GET", "/api/health") => health(),
        ("GET", "/api/__integration_error_test__") if config::env("NODE_ENV").as_deref() == Some("test") => {
            unhandled(state, req, "Intentional integration test error")
        }
        ("POST", "/api/signup") => signup(state, req),
        ("POST", "/api/signin") => signin(state, req),
        ("POST", "/api/signout") => signout(state, req),
        ("GET", "/api/me") => me_get(state, req),
        ("PUT", "/api/me") => me_put(state, req),
        ("POST", "/api/usage") => usage(state, req),
        ("POST", "/api/checkout") => checkout(state, req),
        ("POST", "/api/portal") => portal(state, req),
        (m, p) if p.starts_with("/api/") => {
            if m == "GET" || m == "HEAD" {
                not_found()
            } else {
                not_found()
            }
        }
        ("GET" | "HEAD", _) => static_or_spa(state, req),
        _ => not_found(),
    }
}

fn health() -> Response {
    json_res(
        200,
        &json::obj([
            ("status", json::s("ok")),
            ("timestamp", json::i(config::now_ms())),
        ]),
    )
}

fn not_found() -> Response {
    Response::text(404, "404 Not Found")
}

fn json_res(status: u16, v: &Json) -> Response {
    Response::json(status, &json::stringify(v))
}

fn err_json(status: u16, msg: &str) -> Response {
    json_res(status, &json::obj([("error", json::s(msg))]))
}

fn unhandled(state: &AppState, req: &Request, message: &str) -> Response {
    let request_id = middleware::request_id();
    let mut meta: Vec<(&str, Json)> = vec![
        ("message", json::s(message)),
        ("path", json::s(req.path.clone())),
        ("method", json::s(req.method.clone())),
        ("requestId", json::s(request_id)),
    ];
    if !state.prod {
        meta.push(("stack", Json::Null));
    }
    state.log.error("Unhandled error occurred", &meta);
    if state.prod {
        err_json(500, "Internal server error")
    } else {
        json_res(500, &json::obj([("error", json::s(message))]))
    }
}

fn parse_json_body(req: &Request) -> Result<Json, Response> {
    json::parse(&req.body).map_err(|_| err_json(400, "Invalid request body"))
}

fn generate_csrf_token() -> Result<String, Response> {
    crypto::random_bytes(32)
        .map(|b| crypto::hex_encode(&b))
        .map_err(|_| err_json(500, "Server error"))
}

fn generate_uuid() -> Result<String, Response> {
    crypto::random_uuid_v4().map_err(|_| err_json(500, "Server error"))
}

fn generate_token(state: &AppState, user_id: &str) -> Result<String, Response> {
    let Some(secret) = state.jwt_secret.as_deref() else {
        state.log.error(
            "Token generation error",
            &[("error", json::s("JWT_SECRET not configured - authentication disabled"))],
        );
        return Err(err_json(500, "Server error"));
    };
    Ok(auth::jwt_sign(
        &JwtPayload {
            user_id: user_id.to_string(),
            exp: Some(auth::token_expire_timestamp(TOKEN_EXPIRATION_DAYS)),
        },
        secret,
    ))
}

fn require_auth(state: &AppState, req: &Request) -> Result<String, Response> {
    let Some(secret) = state.jwt_secret.as_deref() else {
        return Err(err_json(503, "Authentication service unavailable"));
    };
    let Some(token) = req.cookie("token") else {
        return Err(err_json(401, "Unauthorized"));
    };
    match auth::jwt_verify(&token, secret) {
        Ok(p) => Ok(p.user_id),
        Err(JwtError::Expired) => {
            state.log.debug("Token expired", &[]);
            Err(err_json(401, "Token expired"))
        }
        Err(e) => {
            state.log.error(
                "Token verification error",
                &[("error", json::s(format!("{e:?}")))],
            );
            Err(err_json(401, "Invalid token"))
        }
    }
}

/// CSRF check. `Ok(Some(cookie))` when a store miss auto-regenerated a token.
fn require_csrf(
    state: &AppState,
    req: &Request,
    user_id: &str,
) -> Result<Option<Cookie>, Response> {
    if req.method == "GET" || req.path == "/api/signup" || req.path == "/api/signin" {
        return Ok(None);
    }
    let csrf_header = req.header("x-csrf-token");
    if csrf_header.is_none() || user_id.is_empty() {
        state.log.info(
            "CSRF validation failed - missing token or userID",
            &[
                ("hasToken", Json::Bool(csrf_header.is_some())),
                ("hasUserID", Json::Bool(!user_id.is_empty())),
                ("path", json::s(req.path.clone())),
            ],
        );
        return Err(err_json(403, "Invalid CSRF token"));
    }
    let csrf_header = csrf_header.unwrap_or("");
    match state.csrf.get(user_id) {
        None => {
            let new_token = generate_csrf_token()?;
            state.csrf.set(user_id, new_token.clone(), config::now_ms());
            state
                .log
                .info("CSRF token auto-regenerated after store miss", &[("userID", json::s(user_id))]);
            Ok(Some(csrf_cookie(state, &new_token)))
        }
        Some(stored) => {
            if csrf_header.len() != stored.token.len()
                || !ct_eq(csrf_header.as_bytes(), stored.token.as_bytes())
            {
                state.log.info(
                    "CSRF validation failed - token mismatch",
                    &[
                        ("userID", json::s(user_id)),
                        ("path", json::s(req.path.clone())),
                    ],
                );
                return Err(err_json(403, "Invalid CSRF token"));
            }
            if config::now_ms() - stored.timestamp > CSRF_TOKEN_EXPIRY_MS {
                state.csrf.remove(user_id);
                state.log.info(
                    "CSRF validation failed - token expired",
                    &[
                        ("userID", json::s(user_id)),
                        (
                            "age",
                            json::s(format!(
                                "{}s",
                                (config::now_ms() - stored.timestamp) / 1000
                            )),
                        ),
                    ],
                );
                return Err(err_json(403, "CSRF token expired"));
            }
            state.log.debug("CSRF validation passed", &[("userID", json::s(user_id))]);
            Ok(None)
        }
    }
}

fn with_cookie(res: Response, extra: Option<Cookie>) -> Response {
    match extra {
        Some(c) => res.cookie(&c),
        None => res,
    }
}

fn token_cookie(state: &AppState, jwt: &str) -> Cookie {
    Cookie {
        name: "token".into(),
        value: jwt.to_string(),
        http_only: true,
        secure: state.prod,
        same_site: SameSite::Strict,
        path: "/".into(),
        max_age: Some(TOKEN_EXPIRATION_DAYS * 24 * 60 * 60),
    }
}

fn csrf_cookie(state: &AppState, token: &str) -> Cookie {
    Cookie {
        name: "csrf_token".into(),
        value: token.to_string(),
        http_only: false,
        secure: state.prod,
        same_site: SameSite::Lax,
        path: "/".into(),
        max_age: Some(CSRF_TOKEN_EXPIRY_MS / 1000),
    }
}

fn delete_token_cookie(state: &AppState) -> Cookie {
    let mut c = token_cookie(state, "");
    c.max_age = Some(0);
    c
}

fn delete_csrf_cookie(state: &AppState) -> Cookie {
    let mut c = csrf_cookie(state, "");
    c.max_age = Some(0);
    c
}

fn set_auth_cookies(state: &AppState, res: Response, user_id: &str, jwt: &str) -> Result<Response, Response> {
    let csrf = generate_csrf_token()?;
    state.csrf.set(user_id, csrf.clone(), config::now_ms());
    Ok(res.cookie(&token_cookie(state, jwt)).cookie(&csrf_cookie(state, &csrf)))
}

fn user_json(u: &User) -> Json {
    let mut m = BTreeMap::new();
    m.insert("_id".into(), Json::Str(u.id.clone()));
    m.insert("email".into(), Json::Str(u.email.clone()));
    m.insert("name".into(), Json::Str(u.name.clone()));
    m.insert("created_at".into(), json::i(u.created_at));
    if let Some(sub) = &u.subscription {
        let mut sm = BTreeMap::new();
        sm.insert("stripeID".into(), Json::Str(sub.stripe_id.clone()));
        sm.insert(
            "expires".into(),
            sub.expires.map(json::i).unwrap_or(Json::Null),
        );
        sm.insert("status".into(), Json::Str(sub.status.clone()));
        m.insert("subscription".into(), Json::Obj(sm));
    }
    if let Some(usage) = &u.usage {
        let mut um = BTreeMap::new();
        um.insert("count".into(), json::i(usage.count));
        um.insert(
            "reset_at".into(),
            usage.reset_at.map(json::i).unwrap_or(Json::Null),
        );
        m.insert("usage".into(), Json::Obj(um));
    }
    Json::Obj(m)
}

fn db_err(state: &AppState, context: &str, e: &db::DbError) -> Response {
    state
        .log
        .error(context, &[("error", json::s(e.to_string()))]);
    err_json(500, "Server error")
}

fn is_duplicate(e: &db::DbError) -> bool {
    e.message.contains("UNIQUE constraint failed") || e.message.contains("duplicate key")
}

fn signup(state: &AppState, req: &Request) -> Response {
    let body = match parse_json_body(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let Some(mut email) = body.get_str("email").map(str::to_string) else {
        return err_json(400, "Invalid email format or length");
    };
    let Some(password) = body.get_str("password") else {
        return err_json(400, "Password must be 6-72 characters");
    };
    let Some(name) = body.get_str("name") else {
        return err_json(400, "Name required (max 100 characters)");
    };
    if !validation::validate_email(&email) {
        return err_json(400, "Invalid email format or length");
    }
    if !validation::validate_password(password) {
        return err_json(400, "Password must be 6-72 characters");
    }
    if !validation::validate_name(name) {
        return err_json(400, "Name required (max 100 characters)");
    }
    email = email.to_lowercase().trim().to_string();
    let name = validation::escape_html(name.trim());

    let hash = match kdf::hash_password(password) {
        Ok(h) => h,
        Err(e) => {
            state.log.error("Signup error", &[("error", json::s(e.to_string()))]);
            return err_json(500, "Server error");
        }
    };
    let insert_id = match generate_uuid() {
        Ok(id) => id,
        Err(r) => return r,
    };
    let user = User {
        id: insert_id.clone(),
        email: email.clone(),
        name: name.clone(),
        created_at: config::now_ms(),
        subscription: None,
        usage: None,
    };
    if let Err(e) = state.pool.insert_user(&user) {
        if is_duplicate(&e) {
            state.log.warn("Signup failed - duplicate account", &[]);
            return err_json(400, "Unable to create account with provided credentials");
        }
        return db_err(state, "Signup error", &e);
    }
    let auth_rec = AuthRecord {
        email: email.clone(),
        password: hash,
        user_id: insert_id.clone(),
    };
    if let Err(auth_err) = state.pool.insert_auth(&auth_rec) {
        state.log.error(
            "Auth insert failed, rolling back user creation",
            &[("error", json::s(auth_err.to_string()))],
        );
        match state.pool.delete_user(&UserQuery::Id(insert_id.clone())) {
            Ok(1) => {}
            Ok(_) => state.log.error(
                "Rollback failed - orphaned user record",
                &[("userID", json::s(insert_id.clone()))],
            ),
            Err(rollback_err) => state.log.error(
                "Rollback failed - orphaned user record",
                &[
                    ("userID", json::s(insert_id.clone())),
                    ("error", json::s(rollback_err.to_string())),
                ],
            ),
        }
        if is_duplicate(&auth_err) {
            state.log.warn("Signup failed - duplicate account", &[]);
            return err_json(400, "Unable to create account with provided credentials");
        }
        return db_err(state, "Signup error", &auth_err);
    }
    let token = match generate_token(state, &insert_id) {
        Ok(t) => t,
        Err(r) => return r,
    };
    let body = json::obj([
        ("id", json::s(insert_id.clone())),
        ("email", json::s(email)),
        ("name", json::s(name.trim())),
        ("tokenExpires", json::i(auth::token_expire_timestamp(TOKEN_EXPIRATION_DAYS))),
    ]);
    match set_auth_cookies(state, json_res(201, &body), &insert_id, &token) {
        Ok(res) => {
            state.log.info("Signup success", &[]);
            res
        }
        Err(r) => r,
    }
}

fn signin(state: &AppState, req: &Request) -> Response {
    let body = match parse_json_body(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let Some(mut email) = body.get_str("email").map(str::to_string) else {
        return err_json(400, "Invalid credentials");
    };
    let Some(password) = body.get_str("password") else {
        return err_json(400, "Invalid credentials");
    };
    if !validation::validate_email(&email) {
        return err_json(400, "Invalid credentials");
    }
    email = email.to_lowercase().trim().to_string();
    state.log.debug("Attempting signin", &[]);

    let lock = state.lockout.is_locked(&email, config::now_ms());
    if lock.locked {
        let body = json::obj([
            ("error", json::s("Account temporarily locked. Try again later.")),
            ("retryAfter", json::i(lock.remaining_time)),
        ]);
        return json_res(429, &body).header("Retry-After", &lock.remaining_time.to_string());
    }

    let auth = match state.pool.find_auth(&email) {
        Ok(v) => v,
        Err(e) => return db_err(state, "Signin error", &e),
    };
    let Some(auth) = auth else {
        state.log.debug("Auth record not found", &[]);
        state.lockout.record_failure(&email, config::now_ms());
        return err_json(401, "Invalid credentials");
    };
    if !kdf::verify_password(password, &auth.password) {
        state.log.debug("Password verification failed", &[]);
        state.lockout.record_failure(&email, config::now_ms());
        return err_json(401, "Invalid credentials");
    }
    if kdf::needs_rehash(&auth.password) {
        match kdf::hash_password(password) {
            Ok(new_hash) => {
                if let Err(e) = state.pool.update_auth_password(&email, &new_hash) {
                    state
                        .log
                        .warn("Password rehash failed", &[("error", json::s(e.to_string()))]);
                } else {
                    state.log.debug("Password hash migrated to scrypt", &[]);
                }
            }
            Err(e) => state
                .log
                .warn("Password rehash failed", &[("error", json::s(e.to_string()))]),
        }
    }
    let user = match state.pool.find_user(&UserQuery::Email(email.clone())) {
        Ok(v) => v,
        Err(e) => return db_err(state, "Signin error", &e),
    };
    let Some(user) = user else {
        state.log.error("User not found for auth record", &[]);
        return err_json(401, "Invalid credentials");
    };
    state.lockout.clear(&email);
    let token = match generate_token(state, &user.id) {
        Ok(t) => t,
        Err(r) => return r,
    };
    let mut m = BTreeMap::new();
    m.insert("id".into(), Json::Str(user.id.clone()));
    m.insert("email".into(), Json::Str(user.email.clone()));
    m.insert("name".into(), Json::Str(user.name.clone()));
    if let Some(sub) = &user.subscription {
        let mut sm = BTreeMap::new();
        sm.insert("stripeID".into(), Json::Str(sub.stripe_id.clone()));
        sm.insert(
            "expires".into(),
            sub.expires.map(json::i).unwrap_or(Json::Null),
        );
        sm.insert("status".into(), Json::Str(sub.status.clone()));
        m.insert("subscription".into(), Json::Obj(sm));
    }
    m.insert(
        "tokenExpires".into(),
        json::i(auth::token_expire_timestamp(TOKEN_EXPIRATION_DAYS)),
    );
    match set_auth_cookies(state, json_res(200, &Json::Obj(m)), &user.id, &token) {
        Ok(res) => {
            state.log.info("Signin success", &[]);
            res
        }
        Err(r) => r,
    }
}

fn signout(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    state.csrf.remove(&user_id);
    state.log.info("Signout success", &[]);
    json_res(200, &json::obj([("message", json::s("Signed out successfully"))]))
        .cookie(&delete_token_cookie(state))
        .cookie(&delete_csrf_cookie(state))
}

fn me_get(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    state.log.debug("/me checking for user", &[]);
    match state.pool.find_user(&UserQuery::Id(user_id)) {
        Ok(Some(u)) => json_res(200, &user_json(&u)),
        Ok(None) => err_json(404, "User not found"),
        Err(e) => db_err(state, "Unhandled error occurred", &e),
    }
}

fn me_put(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    let extra = match require_csrf(state, req, &user_id) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let body = match json::parse(&req.body) {
        Ok(v) => v,
        Err(e) => {
            state
                .log
                .error("Update user error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Failed to update user"), extra);
        }
    };
    if let Some(name) = body.get("name") {
        let Some(name) = name.as_str() else {
            return with_cookie(err_json(400, "Name must be 1-100 characters"), extra);
        };
        if !validation::validate_name(name) {
            return with_cookie(err_json(400, "Name must be 1-100 characters"), extra);
        }
    }
    match state.pool.find_user(&UserQuery::Id(user_id.clone())) {
        Ok(Some(_)) => {}
        Ok(None) => return with_cookie(err_json(404, "User not found"), extra),
        Err(e) => {
            state
                .log
                .error("Update user error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Failed to update user"), extra);
        }
    }
    let Some(name) = body.get_str("name") else {
        return with_cookie(err_json(400, "No valid fields to update"), extra);
    };
    let sanitized = validation::escape_html(name.trim());
    match state.pool.update_user_set_name(&user_id, &sanitized) {
        Ok(0) => with_cookie(err_json(400, "No changes made"), extra),
        Ok(_) => match state.pool.find_user(&UserQuery::Id(user_id)) {
            Ok(Some(u)) => with_cookie(json_res(200, &user_json(&u)), extra),
            Ok(None) => with_cookie(err_json(404, "User not found"), extra),
            Err(e) => {
                state
                    .log
                    .error("Update user error", &[("error", json::s(e.to_string()))]);
                with_cookie(err_json(500, "Failed to update user"), extra)
            }
        },
        Err(e) => {
            state
                .log
                .error("Update user error", &[("error", json::s(e.to_string()))]);
            with_cookie(err_json(500, "Failed to update user"), extra)
        }
    }
}

fn resolve_usage(user: &User) -> Usage {
    user.usage.clone().unwrap_or(Usage {
        count: 0,
        reset_at: None,
    })
}

fn is_subscriber(sub: &Subscription) -> bool {
    sub.status == "active" && sub.expires.map(|e| e > config::now_secs()).unwrap_or(true)
}

fn sub_expires_iso(sub: &Subscription) -> Json {
    match sub.expires {
        Some(secs) => Json::Str(config::iso_from_secs(secs)),
        None => Json::Null,
    }
}

fn usage(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    let body = match json::parse(&req.body) {
        Ok(v) => v,
        Err(e) => {
            state
                .log
                .error("Usage tracking error", &[("error", json::s(e.to_string()))]);
            return err_json(500, "Server error");
        }
    };
    let operation = body.get_str("operation").unwrap_or("");
    if operation != "check" && operation != "track" {
        return err_json(400, "Invalid operation. Must be 'check' or 'track'");
    }
    let user = match state.pool.find_user(&UserQuery::Id(user_id.clone())) {
        Ok(Some(u)) => u,
        Ok(None) => return err_json(404, "User not found"),
        Err(e) => return db_err(state, "Usage tracking error", &e),
    };
    if let Some(sub) = &user.subscription {
        if is_subscriber(sub) {
            let mut sm = BTreeMap::new();
            sm.insert("status".into(), Json::Str(sub.status.clone()));
            sm.insert("expiresAt".into(), sub_expires_iso(sub));
            return json_res(
                200,
                &Json::Obj(BTreeMap::from([
                    ("remaining".into(), json::i(-1)),
                    ("total".into(), json::i(-1)),
                    ("isSubscriber".into(), Json::Bool(true)),
                    ("subscription".into(), Json::Obj(sm)),
                ])),
            );
        }
    }
    let limit = state.free_usage_limit;
    let now = config::now_secs();
    let mut usage = resolve_usage(&user);
    if usage.reset_at.map(|r| now > r).unwrap_or(true) {
        let new_reset = now + 30 * 24 * 60 * 60;
        if let Err(e) = state.pool.update_user_usage(
            &user_id,
            &Usage {
                count: 0,
                reset_at: Some(new_reset),
            },
        ) {
            return db_err(state, "Usage tracking error", &e);
        }
        usage = Usage {
            count: 0,
            reset_at: Some(new_reset),
        };
    }
    if operation == "track" {
        if let Err(e) = state.pool.increment_usage_count(&user_id, 1) {
            return db_err(state, "Usage tracking error", &e);
        }
        let actual = match state.pool.find_user(&UserQuery::Id(user_id.clone())) {
            Ok(u) => u.and_then(|u| u.usage).map(|u| u.count).unwrap_or(1),
            Err(e) => return db_err(state, "Usage tracking error", &e),
        };
        if actual > limit {
            let _ = state.pool.increment_usage_count(&user_id, -1);
            return json_res(
                429,
                &json::obj([
                    ("error", json::s("Usage limit reached")),
                    ("remaining", json::i(0)),
                    ("total", json::i(limit)),
                    ("isSubscriber", Json::Bool(false)),
                ]),
            );
        }
        usage.count = actual;
    }
    let remaining = (limit - usage.count).max(0);
    let mut m = BTreeMap::new();
    m.insert("remaining".into(), json::i(remaining));
    m.insert("total".into(), json::i(limit));
    m.insert("isSubscriber".into(), Json::Bool(false));
    m.insert("used".into(), json::i(usage.count));
    m.insert(
        "subscription".into(),
        match &user.subscription {
            Some(sub) => {
                let mut sm = BTreeMap::new();
                sm.insert("status".into(), Json::Str(sub.status.clone()));
                sm.insert("expiresAt".into(), sub_expires_iso(sub));
                Json::Obj(sm)
            }
            None => Json::Null,
        },
    );
    json_res(200, &Json::Obj(m))
}

fn checkout(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    let extra = match require_csrf(state, req, &user_id) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let Some(stripe) = state.stripe.as_ref() else {
        return with_cookie(err_json(503, "Stripe is not configured"), extra);
    };
    let body = match json::parse(&req.body) {
        Ok(v) => v,
        Err(e) => {
            state
                .log
                .error("Checkout session error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Stripe session failed"), extra);
        }
    };
    let (Some(email), Some(lookup_key)) = (body.get_str("email"), body.get_str("lookup_key")) else {
        return with_cookie(err_json(400, "Missing email or lookup_key"), extra);
    };
    let user = match state.pool.find_user(&UserQuery::Id(user_id)) {
        Ok(u) => u,
        Err(e) => {
            state
                .log
                .error("Checkout session error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Stripe session failed"), extra);
        }
    };
    if user.as_ref().map(|u| u.email.as_str()) != Some(email) {
        return with_cookie(err_json(403, "Email mismatch"), extra);
    }
    let price_id = match stripe.price_id_for_lookup_key(lookup_key) {
        Ok(Some(id)) => id,
        Ok(None) => {
            return with_cookie(
                err_json(400, &format!("No price found for lookup_key: {lookup_key}")),
                extra,
            )
        }
        Err(e) => {
            state
                .log
                .error("Checkout session error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Stripe session failed"), extra);
        }
    };
    let origin = state.redirect_origin(req.header("origin"));
    let app_name = AppState::app_name();
    let success = format!("{origin}/app/payment?success=true");
    let cancel = format!("{origin}/app/payment?canceled=true");
    match stripe.create_checkout_session(CheckoutParams {
        customer_email: email,
        price_id: &price_id,
        success_url: &success,
        cancel_url: &cancel,
        app_name: app_name.as_deref(),
        idempotency_key: None,
    }) {
        Ok(session) => with_cookie(
            json_res(
                200,
                &json::obj([
                    ("url", session.url.map(json::s).unwrap_or(Json::Null)),
                    ("id", json::s(session.id)),
                    (
                        "customerID",
                        session.customer.map(json::s).unwrap_or(Json::Null),
                    ),
                ]),
            ),
            extra,
        ),
        Err(e) => {
            state
                .log
                .error("Checkout session error", &[("error", json::s(e.to_string()))]);
            with_cookie(err_json(500, "Stripe session failed"), extra)
        }
    }
}

fn portal(state: &AppState, req: &Request) -> Response {
    let user_id = match require_auth(state, req) {
        Ok(id) => id,
        Err(r) => return r,
    };
    let extra = match require_csrf(state, req, &user_id) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let Some(stripe) = state.stripe.as_ref() else {
        return with_cookie(err_json(503, "Stripe is not configured"), extra);
    };
    let body = match json::parse(&req.body) {
        Ok(v) => v,
        Err(e) => {
            state
                .log
                .error("Portal session error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Stripe portal failed"), extra);
        }
    };
    let Some(customer_id) = body.get_str("customerID") else {
        return with_cookie(err_json(400, "Missing customerID"), extra);
    };
    let user = match state.pool.find_user(&UserQuery::Id(user_id)) {
        Ok(u) => u,
        Err(e) => {
            state
                .log
                .error("Portal session error", &[("error", json::s(e.to_string()))]);
            return with_cookie(err_json(500, "Stripe portal failed"), extra);
        }
    };
    let unauthorized = match &user {
        None => true,
        Some(u) => u
            .subscription
            .as_ref()
            .map(|s| !s.stripe_id.is_empty() && s.stripe_id != customer_id)
            .unwrap_or(false),
    };
    if unauthorized {
        return with_cookie(err_json(403, "Unauthorized customerID"), extra);
    }
    let origin = state.redirect_origin(req.header("origin"));
    let return_url = format!("{origin}/app/payment?portal=return");
    match stripe.create_portal_session(customer_id, &return_url) {
        Ok(session) => with_cookie(
            json_res(
                200,
                &json::obj([
                    ("url", session.url.map(json::s).unwrap_or(Json::Null)),
                    ("id", json::s(session.id)),
                ]),
            ),
            extra,
        ),
        Err(e) => {
            state
                .log
                .error("Portal session error", &[("error", json::s(e.to_string()))]);
            with_cookie(err_json(500, "Stripe portal failed"), extra)
        }
    }
}

fn period_end(obj: &Json) -> Option<i64> {
    obj.get_i64("current_period_end").or_else(|| {
        obj.get("items")
            .and_then(Json::as_obj)
            .and_then(|m| m.get("data"))
            .and_then(Json::as_arr)
            .and_then(|d| d.first())
            .and_then(|item| item.get_i64("current_period_end"))
    })
}

fn apply_sub_patch(state: &AppState, email: &str, sub: &Subscription) -> bool {
    match state.pool.find_user(&UserQuery::Email(email.to_string())) {
        Ok(Some(u)) => match state.pool.update_user_subscription(&u.id, sub) {
            Ok(_) => true,
            Err(e) => {
                state
                    .log
                    .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
                false
            }
        },
        Ok(None) => {
            state
                .log
                .warn("Webhook: No user found for email", &[("email", json::s(email))]);
            false
        }
        Err(e) => {
            state
                .log
                .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
            false
        }
    }
}

fn rollback_webhook(state: &AppState, event_id: &str) {
    if let Err(e) = state.pool.delete_webhook_event(event_id) {
        state.log.error(
            "Failed to roll back webhook event record",
            &[
                ("eventId", json::s(event_id)),
                ("error", json::s(e.to_string())),
            ],
        );
    }
}

fn build_sub_patch(stripe_id: &str, stripe_sub: &Json) -> Subscription {
    Subscription {
        stripe_id: stripe_id.to_string(),
        expires: period_end(stripe_sub),
        status: stripe_sub.get_str("status").unwrap_or("").to_string(),
    }
}

fn payment(state: &AppState, req: &Request) -> Response {
    state.log.info("Payment webhook received", &[]);
    if state.stripe.is_none() {
        return err_json(503, "Stripe is not configured");
    }
    let Some(signature) = req.header("stripe-signature") else {
        return err_json(400, "Missing signature");
    };
    let Some(secret) = state.stripe_endpoint_secret.as_deref() else {
        return err_json(503, "Stripe is not configured");
    };
    let event = match stripe::construct_event(
        &req.body,
        signature,
        secret,
        stripe::DEFAULT_WEBHOOK_TOLERANCE_SECS,
    ) {
        Ok(v) => v,
        Err(e) => {
            state.log.error(
                "Webhook signature verification failed",
                &[("error", json::s(e.to_string()))],
            );
            return Response::empty(400);
        }
    };
    state.log.debug(
        "Webhook event received",
        &[("type", json::s(event.get_str("type").unwrap_or("").to_string()))],
    );
    let Some(event_id) = event.get_str("id").map(str::to_string) else {
        return Response::empty(400);
    };
    let event_type = event.get_str("type").unwrap_or("").to_string();
    match state.pool.find_webhook_event(&event_id) {
        Ok(Some(_)) => {
            state.log.info(
                "Webhook event already processed, skipping",
                &[("eventId", json::s(event_id))],
            );
            return Response::empty(200);
        }
        Ok(None) => {}
        Err(e) => {
            state
                .log
                .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
            return Response::empty(500);
        }
    }
    if let Err(e) = state
        .pool
        .insert_webhook_event(&event_id, &event_type, config::now_ms())
    {
        state
            .log
            .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
        return Response::empty(500);
    }
    let obj = event
        .get("data")
        .and_then(|d| d.get("object"))
        .cloned()
        .unwrap_or(json::obj([]));
    if let Err(e) = process_webhook(state, &event_id, &event_type, &obj) {
        rollback_webhook(state, &event_id);
        return e;
    }
    Response::empty(200)
}

fn process_webhook(
    state: &AppState,
    event_id: &str,
    event_type: &str,
    obj: &Json,
) -> Result<(), Response> {
    let stripe = state.stripe.as_ref();
    if matches!(
        event_type,
        "customer.subscription.deleted"
            | "customer.subscription.updated"
            | "customer.subscription.created"
    ) {
        let Some(stripe_id) = obj.get_str("customer") else {
            state
                .log
                .error("Webhook missing customer ID", &[("type", json::s(event_type))]);
            return Err(Response::empty(400));
        };
        let email = match resolve_customer_email(state, stripe_id) {
            Ok(Some(e)) => e,
            Ok(None) => return Err(Response::empty(400)),
            Err(_) => return Err(Response::empty(400)),
        };
        if period_end(obj).is_none() {
            state.log.error(
                "Webhook: subscription event has no current_period_end",
                &[
                    ("type", json::s(event_type)),
                    ("eventId", json::s(event_id)),
                ],
            );
        }
        let sub = Subscription {
            stripe_id: stripe_id.to_string(),
            expires: period_end(obj),
            status: obj.get_str("status").unwrap_or("").to_string(),
        };
        if apply_sub_patch(state, &email, &sub) {
            state.log.info(
                "Subscription updated",
                &[
                    ("type", json::s(event_type)),
                    ("email", json::s(email)),
                    ("status", json::s(sub.status)),
                ],
            );
        }
    }
    if event_type == "checkout.session.completed" {
        let stripe_id = obj.get_str("customer");
        let subscription_id = obj.get_str("subscription");
        if let (Some(stripe), Some(stripe_id), Some(subscription_id)) =
            (stripe, stripe_id, subscription_id)
        {
            let sub_json = match stripe.retrieve_subscription(subscription_id) {
                Ok(v) => v,
                Err(e) => {
                    state
                        .log
                        .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
                    return Err(Response::empty(500));
                }
            };
            let email = if let Some(e) = obj.get_str("customer_email") {
                e.to_lowercase()
            } else {
                match resolve_customer_email(state, stripe_id) {
                    Ok(Some(e)) => e,
                    Ok(None) => return Ok(()),
                    Err(_) => return Err(Response::empty(500)),
                }
            };
            let patch = build_sub_patch(stripe_id, &sub_json);
            if apply_sub_patch(state, &email, &patch) {
                state.log.info(
                    "Checkout completed",
                    &[
                        ("email", json::s(email)),
                        ("status", json::s(patch.status)),
                    ],
                );
            }
        }
    }
    if event_type == "invoice.paid" {
        let stripe_id = obj.get_str("customer");
        let subscription_id = obj.get_str("subscription").or_else(|| {
            obj.get("parent")
                .and_then(|p| p.get("subscription_details"))
                .and_then(|d| d.get_str("subscription"))
        });
        if let (Some(stripe), Some(stripe_id), Some(subscription_id)) =
            (stripe, stripe_id, subscription_id)
        {
            let sub_json = match stripe.retrieve_subscription(subscription_id) {
                Ok(v) => v,
                Err(e) => {
                    state
                        .log
                        .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
                    return Err(Response::empty(500));
                }
            };
            let email = match resolve_customer_email(state, stripe_id) {
                Ok(Some(e)) => e,
                Ok(None) => return Ok(()),
                Err(_) => return Err(Response::empty(500)),
            };
            let patch = build_sub_patch(stripe_id, &sub_json);
            if apply_sub_patch(state, &email, &patch) {
                state.log.info("Invoice paid", &[("email", json::s(email))]);
            }
        }
    }
    if event_type == "invoice.payment_failed" {
        if let Some(stripe_id) = obj.get_str("customer") {
            if let Ok(Some(email)) = resolve_customer_email(state, stripe_id) {
                // yagni: SQLite has no paymentFailed columns; Node's dotted $set
                // is a no-op on this adapter. Log the same as Node when a user
                // exists. Add columns if billing UX needs the flag.
                match state.pool.find_user(&UserQuery::Email(email.clone())) {
                    Ok(Some(_)) => {
                        state
                            .log
                            .warn("Invoice payment failed", &[("email", json::s(email))]);
                    }
                    Ok(None) => {
                        state.log.warn(
                            "Webhook: No user found for email",
                            &[("email", json::s(email))],
                        );
                    }
                    Err(e) => {
                        state.log.error(
                            "Webhook processing error",
                            &[("error", json::s(e.to_string()))],
                        );
                        return Err(Response::empty(500));
                    }
                }
            }
        }
    }
    Ok(())
}

fn resolve_customer_email(state: &AppState, stripe_id: &str) -> Result<Option<String>, ()> {
    let Some(stripe) = state.stripe.as_ref() else {
        state
            .log
            .warn("Webhook: Stripe not configured", &[("stripeID", json::s(stripe_id))]);
        return Ok(None);
    };
    match stripe.customer_email(stripe_id) {
        Ok(Some(e)) => Ok(Some(e)),
        Ok(None) => {
            state
                .log
                .warn("Webhook: Customer has no email", &[("stripeID", json::s(stripe_id))]);
            Ok(None)
        }
        Err(e) => {
            state
                .log
                .error("Webhook processing error", &[("error", json::s(e.to_string()))]);
            Err(())
        }
    }
}

fn has_extension(path: &str) -> bool {
    path.rsplit('/')
        .next()
        .and_then(|s| s.rsplit_once('.'))
        .map(|(_, ext)| !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .unwrap_or(false)
}

fn static_or_spa(state: &AppState, req: &Request) -> Response {
    if let Some(res) = crate::http::serve_file(&state.static_dir, &req.path) {
        return res;
    }
    if req.path.starts_with("/api/") || has_extension(&req.path) {
        return not_found();
    }
    spa_fallback(state)
}

fn spa_fallback(state: &AppState) -> Response {
    let index = state.static_dir.join("index.html");
    match std::fs::read(&index) {
        Ok(bytes) => Response::html(200, &String::from_utf8_lossy(&bytes)),
        Err(_) => Response::text(200, "Welcome to Skateboard API"),
    }
}

/// Drop expired CSRF tokens. Called from the hourly cleanup thread.
pub fn run_csrf_cleanup(state: &AppState) {
    let cleaned = state.csrf.cleanup(config::now_ms());
    if cleaned > 0 {
        state.log.debug(
            "CSRF cleanup completed",
            &[("removedTokens", json::i(cleaned as i64))],
        );
    }
}

/// Drop expired lockout entries. Called from the 15-minute cleanup thread.
pub fn run_lockout_cleanup(state: &AppState) {
    let cleaned = state.lockout.cleanup(config::now_ms());
    if cleaned > 0 {
        state.log.debug(
            "Lockout cleanup completed",
            &[("removedEntries", json::i(cleaned as i64))],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Logger;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;

    static TEST_DIR_SEQ: AtomicU64 = AtomicU64::new(0);

    /// Tests mutate process env; serialize them so they cannot clobber each other.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn test_state() -> (AppState, std::path::PathBuf) {
        let _g = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let n = TEST_DIR_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("sk-rs-{}-{n}", std::process::id()));
        std::fs::create_dir_all(dir.join("databases")).unwrap();
        std::fs::write(
            dir.join("config.json"),
            r#"{"staticDir":"dist","database":{"db":"T","dbType":"sqlite","connectionString":"./databases/T.db"}}"#,
        )
        .unwrap();
        // SAFETY: serialized by ENV_LOCK; tests run with a dedicated dir.
        unsafe {
            std::env::set_var("JWT_SECRET", "test-secret-value-at-least-32-chars!!");
            std::env::remove_var("STRIPE_KEY");
            std::env::remove_var("STRIPE_ENDPOINT_SECRET");
            std::env::remove_var("PORT");
            std::env::remove_var("NODE_ENV");
        }
        let state = AppState::open_in(&dir, 2, Logger::new(true)).expect("open");
        (state, dir)
    }

    fn json_body(res: &Response) -> Json {
        json::parse(&res.body).expect("json")
    }

    fn cookie_header(req: &mut Request, res: &Response) {
        let cookies: Vec<String> = res
            .headers
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case("Set-Cookie"))
            .map(|(_, v)| v.split(';').next().unwrap_or(v).to_string())
            .collect();
        if !cookies.is_empty() {
            req.set_test_header("cookie", &cookies.join("; "));
        }
        if let Some((_, csrf)) = res.headers.iter().find(|(k, v)| {
            k.eq_ignore_ascii_case("Set-Cookie") && v.starts_with("csrf_token=")
        }) {
            let token = csrf.split('=').nth(1).unwrap_or("").split(';').next().unwrap_or("");
            req.set_test_header("x-csrf-token", token);
        }
    }

    #[test]
    fn health_ok() {
        let (state, dir) = test_state();
        let res = handle(&state, Request::for_test("GET", "/api/health"));
        assert_eq!(res.status, 200);
        let body = json_body(&res);
        assert_eq!(body.get_str("status"), Some("ok"));
        assert!(body.get_i64("timestamp").is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn signup_rejects_bad_email() {
        let (state, dir) = test_state();
        let mut req = Request::for_test("POST", "/api/signup");
        req.set_test_body(br#"{"email":"nope","password":"secret1","name":"Ada"}"#.to_vec());
        let res = handle(&state, req);
        assert_eq!(res.status, 400);
        assert_eq!(json_body(&res).get_str("error"), Some("Invalid email format or length"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn signup_signin_me_round_trip() {
        let (state, dir) = test_state();
        let mut req = Request::for_test("POST", "/api/signup");
        req.set_test_body(br#"{"email":"Ada@Example.COM","password":"secret1","name":"Ada"}"#.to_vec());
        let res = handle(&state, req);
        assert_eq!(res.status, 201, "{}", String::from_utf8_lossy(&res.body));
        let body = json_body(&res);
        assert_eq!(body.get_str("email"), Some("ada@example.com"));
        assert_eq!(body.get_str("name"), Some("Ada"));

        let mut me = Request::for_test("GET", "/api/me");
        cookie_header(&mut me, &res);
        let me_res = handle(&state, me);
        assert_eq!(me_res.status, 200, "{}", String::from_utf8_lossy(&me_res.body));
        assert_eq!(json_body(&me_res).get_str("email"), Some("ada@example.com"));

        let mut signin = Request::for_test("POST", "/api/signin");
        signin.set_test_body(br#"{"email":"ada@example.com","password":"secret1"}"#.to_vec());
        let si = handle(&state, signin);
        assert_eq!(si.status, 200, "{}", String::from_utf8_lossy(&si.body));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unknown_api_is_404_text() {
        let (state, dir) = test_state();
        let res = handle(&state, Request::for_test("GET", "/api/nope"));
        assert_eq!(res.status, 404);
        assert_eq!(res.body, b"404 Not Found");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn spa_fallback_without_dist() {
        let (state, dir) = test_state();
        let res = handle(&state, Request::for_test("GET", "/app"));
        assert_eq!(res.status, 200);
        assert_eq!(res.body, b"Welcome to Skateboard API");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn put_me_requires_csrf() {
        let (state, dir) = test_state();
        let mut req = Request::for_test("POST", "/api/signup");
        req.set_test_body(br#"{"email":"csrf@example.com","password":"secret1","name":"C"}"#.to_vec());
        let signed = handle(&state, req);
        assert_eq!(signed.status, 201);

        let mut put = Request::for_test("PUT", "/api/me");
        cookie_header(&mut put, &signed);
        // cookie_header also copies x-csrf-token from Set-Cookie; strip it to
        // prove a missing header is rejected.
        put.headers = crate::http::Headers::from_pairs(
            put.headers
                .iter()
                .filter(|(k, _)| !k.eq_ignore_ascii_case("x-csrf-token"))
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        );
        put.set_test_body(br#"{"name":"New"}"#.to_vec());
        let res = handle(&state, put);
        assert_eq!(res.status, 403);
        std::fs::remove_dir_all(&dir).ok();
    }
}

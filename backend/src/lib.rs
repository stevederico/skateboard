//! Skateboard application backend — zero-crate Rust port of the Hono/Node server.
//!
//! Empty `[dependencies]`. HTTP, JSON, JWT, scrypt, and bcrypt are written in
//! this crate; SQLite and libcurl are linked as system libraries.

pub mod auth;
pub mod config;
pub mod crypto;
pub mod db;
pub mod http;
pub mod json;
pub mod kdf;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod stores;
pub mod stripe;
pub mod stripe_worker;
pub mod validation;

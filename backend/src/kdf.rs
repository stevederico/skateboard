//! Password hashing — PBKDF2, scrypt, and legacy bcrypt verification.
//!
//! New hashes are always scrypt, in the self-describing format
//! `scrypt$<n>$<r>$<p>$<base64url salt>$<base64url key>`, currently produced
//! with Node's `crypto.scrypt` defaults (N=16384, r=8, p=1, 64-byte key,
//! 16-byte salt).
//!
//! Recording the parameters is what makes the cost adjustable. The older
//! parameterless form `scrypt$<salt>$<key>`, written by the Node backend and by
//! earlier versions of this crate, still verifies — at Node's defaults, which
//! are hard-coded for that form and must not be changed. Raising the cost
//! therefore only affects new writes, and existing users are migrated by
//! [`needs_rehash`] on their next sign-in rather than locked out.
//!
//! Legacy bcrypt hashes (`$2a$` / `$2b$` / `$2y$`) predate the scrypt
//! migration and must still verify or those accounts are locked out. Bcrypt
//! here is **verify-only**; it is a port of the vendored `bcryptjs` at
//! `backend/vendor/legacy-bcrypt.js`, so it reproduces that implementation's
//! behavior rather than canonical OpenBSD bcrypt where the two differ.

use crate::crypto::{base64url_decode, base64url_encode, ct_eq, hmac_sha256, random_bytes};

/// Length of a scrypt salt in bytes (Node `SCRYPT_SALTLEN`).
pub const SCRYPT_SALT_LEN: usize = 16;

/// Length of a derived scrypt key in bytes (Node `SCRYPT_KEYLEN`).
pub const SCRYPT_KEY_LEN: usize = 64;

/// Cost parameter N used for new hashes — Node's `crypto.scrypt` default.
pub const SCRYPT_N: u32 = 16384;

/// Block size parameter r used for new hashes — Node's `crypto.scrypt` default.
pub const SCRYPT_R: u32 = 8;

/// Parallelization parameter p used for new hashes — Node's `crypto.scrypt` default.
pub const SCRYPT_P: u32 = 1;

/// Largest scrypt working set a *stored* hash may demand, in bytes.
///
/// A parameterized hash tells the verifier how much work to do, so a row that
/// an attacker could write would otherwise let them pick the cost and exhaust
/// memory on every sign-in attempt. scrypt's working set is `128 * N * r`, so
/// this cap bounds it at 256 MiB regardless of what a row claims. The
/// compiled-in defaults need 16 MiB, leaving plenty of headroom to raise cost.
const SCRYPT_MAX_STORED_MEMORY: u64 = 256 * 1024 * 1024;

/// Largest parallelization factor accepted from a stored hash. `p` multiplies
/// CPU time without bound, so it is capped separately from memory.
const SCRYPT_MAX_STORED_P: u32 = 16;

/// The `N`, `r`, `p` triple a stored hash was produced with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScryptParams {
    n: u32,
    r: u32,
    p: u32,
}

/// The parameters new hashes are written with.
const CURRENT_PARAMS: ScryptParams = ScryptParams {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
};

impl ScryptParams {
    /// Reject a triple whose cost is outside what this build is willing to
    /// spend, so a hostile or corrupt row cannot dictate the work factor.
    fn within_limits(&self) -> bool {
        if self.p == 0 || self.p > SCRYPT_MAX_STORED_P {
            return false;
        }
        if self.r == 0 || self.n < 2 || !self.n.is_power_of_two() {
            return false;
        }
        let working_set = 128u64
            .checked_mul(u64::from(self.n))
            .and_then(|v| v.checked_mul(u64::from(self.r)));
        working_set.is_some_and(|bytes| bytes <= SCRYPT_MAX_STORED_MEMORY)
    }
}

/// A parsed scrypt hash: its parameters, salt, and expected key.
struct ParsedHash {
    params: ScryptParams,
    salt: Vec<u8>,
    key: Vec<u8>,
}

/// Parse a stored scrypt hash in either supported encoding.
///
/// Two layouts exist, told apart by field count so they cannot be confused:
/// - `scrypt$<salt>$<key>` — written by the Node backend and by this crate
///   before parameters were recorded. Its parameters are implicitly Node's
///   defaults, which is why [`CURRENT_PARAMS`] must never be read as the
///   meaning of this form; the constant is hard-coded here instead.
/// - `scrypt$<n>$<r>$<p>$<salt>$<key>` — self-describing, written today.
///
/// Returns `None` for anything malformed or outside the cost limits, which
/// callers treat as a failed verification.
fn parse_scrypt_hash(stored: &str) -> Option<ParsedHash> {
    let rest = stored.strip_prefix("scrypt$")?;
    let fields: Vec<&str> = rest.split('$').collect();
    let (params, salt_b64, key_b64) = match fields.as_slice() {
        // The legacy form's parameters are fixed for all time: they are what
        // Node used, not whatever this build currently prefers.
        [salt, key] => (
            ScryptParams {
                n: 16384,
                r: 8,
                p: 1,
            },
            *salt,
            *key,
        ),
        [n, r, p, salt, key] => (
            ScryptParams {
                n: n.parse().ok()?,
                r: r.parse().ok()?,
                p: p.parse().ok()?,
            },
            *salt,
            *key,
        ),
        _ => return None,
    };
    if !params.within_limits() {
        return None;
    }
    Some(ParsedHash {
        params,
        salt: base64url_decode(salt_b64)?,
        key: base64url_decode(key_b64)?,
    })
}

// ---------------------------------------------------------------------------
// PBKDF2
// ---------------------------------------------------------------------------

/// PBKDF2 with HMAC-SHA-256 as the PRF (RFC 2898 §5.2).
///
/// # Arguments
///
/// * `password` - Password bytes, used as the HMAC key.
/// * `salt` - Salt bytes.
/// * `iterations` - Iteration count; `0` is treated as `1`, since RFC 2898
///   requires at least one iteration.
/// * `dk_len` - Desired derived-key length in bytes.
///
/// # Returns
///
/// The derived key, exactly `dk_len` bytes long.
pub fn pbkdf2_hmac_sha256(password: &[u8], salt: &[u8], iterations: u32, dk_len: usize) -> Vec<u8> {
    let iterations = iterations.max(1);
    let mut out = Vec::with_capacity(dk_len);
    let mut block_index: u32 = 1;

    while out.len() < dk_len {
        // U1 = PRF(P, S || INT_BE(i))
        let mut msg = Vec::with_capacity(salt.len() + 4);
        msg.extend_from_slice(salt);
        msg.extend_from_slice(&block_index.to_be_bytes());

        let mut u = hmac_sha256(password, &msg);
        let mut t = u;
        for _ in 1..iterations {
            u = hmac_sha256(password, &u);
            for (acc, byte) in t.iter_mut().zip(u.iter()) {
                *acc ^= *byte;
            }
        }

        let take = (dk_len - out.len()).min(t.len());
        out.extend_from_slice(&t[..take]);
        block_index += 1;
    }
    out
}

// ---------------------------------------------------------------------------
// scrypt
// ---------------------------------------------------------------------------

/// Why a scrypt call could not be performed.
///
/// Returned instead of panicking so a malformed stored hash can never take the
/// process down.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScryptError {
    /// `n` was not a power of two greater than 1.
    InvalidN,
    /// `r` or `p` was zero.
    InvalidBlockOrParallelism,
    /// `dk_len` was zero.
    InvalidKeyLength,
    /// The requested parameters overflow `usize` or exceed addressable memory.
    Overflow,
}

impl std::fmt::Display for ScryptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            ScryptError::InvalidN => "N must be a power of two greater than 1",
            ScryptError::InvalidBlockOrParallelism => "r and p must be non-zero",
            ScryptError::InvalidKeyLength => "derived key length must be non-zero",
            ScryptError::Overflow => "scrypt parameters overflow addressable memory",
        };
        f.write_str(msg)
    }
}

impl std::error::Error for ScryptError {}

/// The Salsa20/8 core (RFC 7914 §3) over 16 little-endian 32-bit words.
///
/// Operates in place: `x` is replaced by `x + doubleround^4(x)` word-wise.
fn salsa20_8(x: &mut [u32; 16]) {
    let input = *x;
    let mut t = input;
    for _ in 0..4 {
        // Column round
        t[4] ^= t[0].wrapping_add(t[12]).rotate_left(7);
        t[8] ^= t[4].wrapping_add(t[0]).rotate_left(9);
        t[12] ^= t[8].wrapping_add(t[4]).rotate_left(13);
        t[0] ^= t[12].wrapping_add(t[8]).rotate_left(18);

        t[9] ^= t[5].wrapping_add(t[1]).rotate_left(7);
        t[13] ^= t[9].wrapping_add(t[5]).rotate_left(9);
        t[1] ^= t[13].wrapping_add(t[9]).rotate_left(13);
        t[5] ^= t[1].wrapping_add(t[13]).rotate_left(18);

        t[14] ^= t[10].wrapping_add(t[6]).rotate_left(7);
        t[2] ^= t[14].wrapping_add(t[10]).rotate_left(9);
        t[6] ^= t[2].wrapping_add(t[14]).rotate_left(13);
        t[10] ^= t[6].wrapping_add(t[2]).rotate_left(18);

        t[3] ^= t[15].wrapping_add(t[11]).rotate_left(7);
        t[7] ^= t[3].wrapping_add(t[15]).rotate_left(9);
        t[11] ^= t[7].wrapping_add(t[3]).rotate_left(13);
        t[15] ^= t[11].wrapping_add(t[7]).rotate_left(18);

        // Row round
        t[1] ^= t[0].wrapping_add(t[3]).rotate_left(7);
        t[2] ^= t[1].wrapping_add(t[0]).rotate_left(9);
        t[3] ^= t[2].wrapping_add(t[1]).rotate_left(13);
        t[0] ^= t[3].wrapping_add(t[2]).rotate_left(18);

        t[6] ^= t[5].wrapping_add(t[4]).rotate_left(7);
        t[7] ^= t[6].wrapping_add(t[5]).rotate_left(9);
        t[4] ^= t[7].wrapping_add(t[6]).rotate_left(13);
        t[5] ^= t[4].wrapping_add(t[7]).rotate_left(18);

        t[11] ^= t[10].wrapping_add(t[9]).rotate_left(7);
        t[8] ^= t[11].wrapping_add(t[10]).rotate_left(9);
        t[9] ^= t[8].wrapping_add(t[11]).rotate_left(13);
        t[10] ^= t[9].wrapping_add(t[8]).rotate_left(18);

        t[12] ^= t[15].wrapping_add(t[14]).rotate_left(7);
        t[13] ^= t[12].wrapping_add(t[15]).rotate_left(9);
        t[14] ^= t[13].wrapping_add(t[12]).rotate_left(13);
        t[15] ^= t[14].wrapping_add(t[13]).rotate_left(18);
    }
    for i in 0..16 {
        x[i] = input[i].wrapping_add(t[i]);
    }
}

/// `scryptBlockMix` (RFC 7914 §4) over `2 * r` 64-byte blocks held as words.
///
/// Reads `input` (length `32 * r` words) and writes the shuffled result to
/// `output`, which must be the same length.
fn block_mix(input: &[u32], output: &mut [u32], r: usize) {
    let two_r = 2 * r;
    let mut x = [0u32; 16];
    x.copy_from_slice(&input[(two_r - 1) * 16..two_r * 16]);

    for i in 0..two_r {
        for j in 0..16 {
            x[j] ^= input[i * 16 + j];
        }
        salsa20_8(&mut x);
        // Even-indexed results go to the first half, odd to the second.
        let dst = if i % 2 == 0 { i / 2 } else { r + i / 2 } * 16;
        output[dst..dst + 16].copy_from_slice(&x);
    }
}

/// `scryptROMix` (RFC 7914 §5) in place over one `128 * r`-byte block.
///
/// `v` and `scratch` are caller-supplied working buffers, reused across the
/// `p` iterations so the 128·r·N allocation happens once.
fn ro_mix(b: &mut [u32], n: u32, r: usize, v: &mut [u32], scratch: &mut [u32]) {
    let block_words = 32 * r;
    let n = n as usize;

    for i in 0..n {
        v[i * block_words..(i + 1) * block_words].copy_from_slice(b);
        block_mix(b, scratch, r);
        b.copy_from_slice(scratch);
    }
    for _ in 0..n {
        // Integerify: first little-endian word of the last 64-byte block.
        let j = (b[block_words - 16] as usize) & (n - 1);
        for k in 0..block_words {
            b[k] ^= v[j * block_words + k];
        }
        block_mix(b, scratch, r);
        b.copy_from_slice(scratch);
    }
}

/// scrypt (RFC 7914 §6).
///
/// # Arguments
///
/// * `password` - Password bytes.
/// * `salt` - Salt bytes.
/// * `n` - CPU/memory cost; must be a power of two greater than 1.
/// * `r` - Block size factor; must be non-zero.
/// * `p` - Parallelization factor; must be non-zero.
/// * `dk_len` - Derived key length in bytes; must be non-zero.
///
/// # Returns
///
/// The derived key, `dk_len` bytes long.
///
/// # Errors
///
/// Returns a [`ScryptError`] for out-of-range parameters or a working-set size
/// that would overflow `usize`. Never panics on bad input.
pub fn scrypt(
    password: &[u8],
    salt: &[u8],
    n: u32,
    r: u32,
    p: u32,
    dk_len: usize,
) -> Result<Vec<u8>, ScryptError> {
    if n < 2 || !n.is_power_of_two() {
        return Err(ScryptError::InvalidN);
    }
    if r == 0 || p == 0 {
        return Err(ScryptError::InvalidBlockOrParallelism);
    }
    if dk_len == 0 {
        return Err(ScryptError::InvalidKeyLength);
    }

    let r_us = r as usize;
    let block_words = 32usize
        .checked_mul(r_us)
        .ok_or(ScryptError::Overflow)?;
    let b_words = block_words
        .checked_mul(p as usize)
        .ok_or(ScryptError::Overflow)?;
    let v_words = block_words
        .checked_mul(n as usize)
        .ok_or(ScryptError::Overflow)?;
    let b_bytes = b_words.checked_mul(4).ok_or(ScryptError::Overflow)?;
    // Guard against an allocation request that cannot succeed anyway.
    v_words.checked_mul(4).ok_or(ScryptError::Overflow)?;

    // B = PBKDF2(P, S, 1, p * 128 * r)
    let b_init = pbkdf2_hmac_sha256(password, salt, 1, b_bytes);
    let mut b: Vec<u32> = b_init
        .chunks_exact(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let mut v = vec![0u32; v_words];
    let mut scratch = vec![0u32; block_words];
    for i in 0..p as usize {
        let slice = &mut b[i * block_words..(i + 1) * block_words];
        ro_mix(slice, n, r_us, &mut v, &mut scratch);
    }

    // DK = PBKDF2(P, B, 1, dkLen)
    let mut b_bytes_out = Vec::with_capacity(b_bytes);
    for word in &b {
        b_bytes_out.extend_from_slice(&word.to_le_bytes());
    }
    Ok(pbkdf2_hmac_sha256(password, &b_bytes_out, 1, dk_len))
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

/// Why a password could not be hashed.
#[derive(Debug)]
pub enum HashError {
    /// The system random source was unavailable — hashing fails closed rather
    /// than salting from a weak source.
    Random(std::io::Error),
    /// The scrypt parameters were rejected. Unreachable with the compiled-in
    /// constants; present so the error path is total.
    Scrypt(ScryptError),
}

impl std::fmt::Display for HashError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HashError::Random(e) => write!(f, "random source unavailable: {e}"),
            HashError::Scrypt(e) => write!(f, "scrypt failed: {e}"),
        }
    }
}

impl std::error::Error for HashError {}

/// Hash a password for storage.
///
/// Produces `scrypt$<n>$<r>$<p>$<base64url(salt)>$<base64url(key)>` with a
/// fresh 16-byte random salt and a 64-byte key, at the parameters in
/// [`CURRENT_PARAMS`] (currently Node's `crypto.scrypt` defaults: N=16384, r=8,
/// p=1).
///
/// The parameters are recorded in the hash so they can be raised later without
/// locking anyone out: hashes written at the old cost keep verifying at their
/// own cost, and [`needs_rehash`] reports them for upgrade on next sign-in.
/// Hashes in the older parameterless form still verify; only new writes use
/// this encoding.
///
/// # Arguments
///
/// * `password` - Plain-text password. Hashed as UTF-8 bytes, matching Node's
///   default string handling.
///
/// # Returns
///
/// The encoded hash string, safe to store verbatim.
///
/// # Errors
///
/// [`HashError::Random`] if `/dev/urandom` is unavailable, or
/// [`HashError::Scrypt`] if key derivation is rejected.
pub fn hash_password(password: &str) -> Result<String, HashError> {
    let salt = random_bytes(SCRYPT_SALT_LEN).map_err(HashError::Random)?;
    let ScryptParams { n, r, p } = CURRENT_PARAMS;
    let key = scrypt(password.as_bytes(), &salt, n, r, p, SCRYPT_KEY_LEN)
        .map_err(HashError::Scrypt)?;
    Ok(format!(
        "scrypt${n}${r}${p}${}${}",
        base64url_encode(&salt),
        base64url_encode(&key)
    ))
}

/// Verify a password against a stored hash.
///
/// Dispatches on the stored prefix, exactly like Node's `verifyPassword`:
/// `scrypt$` re-derives and compares in constant time; `$2` falls through to
/// the legacy bcrypt verifier; anything else is rejected.
///
/// Malformed stored hashes return `false` — this function never panics, so a
/// corrupted database row cannot crash a request.
///
/// # Arguments
///
/// * `password` - Plain-text password supplied by the client.
/// * `stored` - Hash as stored in the database.
///
/// # Returns
///
/// `true` only if the password matches.
pub fn verify_password(password: &str, stored: &str) -> bool {
    if stored.starts_with("scrypt$") {
        let Some(parsed) = parse_scrypt_hash(stored) else {
            return false;
        };
        // Each hash is verified at the parameters it was created with, which is
        // what lets the compiled-in cost change without invalidating old rows.
        let ScryptParams { n, r, p } = parsed.params;
        // Node derives SCRYPT_KEYLEN bytes regardless of the stored length,
        // then requires the lengths to match before comparing.
        let Ok(candidate) = scrypt(password.as_bytes(), &parsed.salt, n, r, p, SCRYPT_KEY_LEN)
        else {
            return false;
        };
        return ct_eq(&parsed.key, &candidate);
    }
    if stored.starts_with("$2") {
        return bcrypt::verify(password, stored);
    }
    false
}

/// Whether a stored hash should be rewritten on the next successful sign-in.
///
/// True for legacy bcrypt (and anything unrecognized), and also for a scrypt
/// hash whose recorded parameters differ from [`CURRENT_PARAMS`] — which is how
/// a cost increase rolls out: each user is migrated the next time they sign in,
/// while their existing hash keeps working until then.
///
/// # Arguments
///
/// * `stored` - Hash as stored in the database.
///
/// # Returns
///
/// `true` if the caller should replace the stored hash with a fresh
/// [`hash_password`] result.
pub fn needs_rehash(stored: &str) -> bool {
    parse_scrypt_hash(stored).is_none_or(|parsed| parsed.params != CURRENT_PARAMS)
}

// ---------------------------------------------------------------------------
// Legacy bcrypt (verify only)
// ---------------------------------------------------------------------------

/// Legacy bcrypt verification, ported from the vendored `bcryptjs`.
///
/// Verify-only by design: new passwords are always scrypt, so there is no
/// hashing entry point here. The port is deliberately faithful to
/// `backend/vendor/legacy-bcrypt.js` rather than to canonical OpenBSD bcrypt —
/// see [`verify`] for where the two differ.
mod bcrypt {
    use crate::crypto::ct_eq;

    /// bcrypt's non-standard base64 alphabet.
    const B64_CODE: &[u8; 64] =
        b"./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    /// Salt length in bytes, fixed by the bcrypt format.
    const BCRYPT_SALT_LEN: usize = 16;

    /// The 192-bit magic value encrypted 64 times: "OrpheanBeholderScryDoubt".
    const C_ORIG: [u32; 6] = [
        0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274,
    ];

    /// Total characters in a bcrypt hash string (`$2b$10$` + 22 + 31).
    const HASH_LEN: usize = 60;

    /// Blowfish P-array initial state — fractional digits of pi.
    const P_ORIG: [u32; 18] = [
        0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0,
        0x082efa98, 0xec4e6c89, 0x452821e6, 0x38d01377, 0xbe5466cf, 0x34e90c6c,
        0xc0ac29b7, 0xc97c50dd, 0x3f84d5b5, 0xb5470917, 0x9216d5d9, 0x8979fb1b,
    ];

    /// Blowfish S-boxes initial state — four 256-entry boxes, laid out flat.
    const S_ORIG: [u32; 1024] = [
        0xd1310ba6, 0x98dfb5ac, 0x2ffd72db, 0xd01adfb7, 0xb8e1afed, 0x6a267e96,
        0xba7c9045, 0xf12c7f99, 0x24a19947, 0xb3916cf7, 0x0801f2e2, 0x858efc16,
        0x636920d8, 0x71574e69, 0xa458fea3, 0xf4933d7e, 0x0d95748f, 0x728eb658,
        0x718bcd58, 0x82154aee, 0x7b54a41d, 0xc25a59b5, 0x9c30d539, 0x2af26013,
        0xc5d1b023, 0x286085f0, 0xca417918, 0xb8db38ef, 0x8e79dcb0, 0x603a180e,
        0x6c9e0e8b, 0xb01e8a3e, 0xd71577c1, 0xbd314b27, 0x78af2fda, 0x55605c60,
        0xe65525f3, 0xaa55ab94, 0x57489862, 0x63e81440, 0x55ca396a, 0x2aab10b6,
        0xb4cc5c34, 0x1141e8ce, 0xa15486af, 0x7c72e993, 0xb3ee1411, 0x636fbc2a,
        0x2ba9c55d, 0x741831f6, 0xce5c3e16, 0x9b87931e, 0xafd6ba33, 0x6c24cf5c,
        0x7a325381, 0x28958677, 0x3b8f4898, 0x6b4bb9af, 0xc4bfe81b, 0x66282193,
        0x61d809cc, 0xfb21a991, 0x487cac60, 0x5dec8032, 0xef845d5d, 0xe98575b1,
        0xdc262302, 0xeb651b88, 0x23893e81, 0xd396acc5, 0x0f6d6ff3, 0x83f44239,
        0x2e0b4482, 0xa4842004, 0x69c8f04a, 0x9e1f9b5e, 0x21c66842, 0xf6e96c9a,
        0x670c9c61, 0xabd388f0, 0x6a51a0d2, 0xd8542f68, 0x960fa728, 0xab5133a3,
        0x6eef0b6c, 0x137a3be4, 0xba3bf050, 0x7efb2a98, 0xa1f1651d, 0x39af0176,
        0x66ca593e, 0x82430e88, 0x8cee8619, 0x456f9fb4, 0x7d84a5c3, 0x3b8b5ebe,
        0xe06f75d8, 0x85c12073, 0x401a449f, 0x56c16aa6, 0x4ed3aa62, 0x363f7706,
        0x1bfedf72, 0x429b023d, 0x37d0d724, 0xd00a1248, 0xdb0fead3, 0x49f1c09b,
        0x075372c9, 0x80991b7b, 0x25d479d8, 0xf6e8def7, 0xe3fe501a, 0xb6794c3b,
        0x976ce0bd, 0x04c006ba, 0xc1a94fb6, 0x409f60c4, 0x5e5c9ec2, 0x196a2463,
        0x68fb6faf, 0x3e6c53b5, 0x1339b2eb, 0x3b52ec6f, 0x6dfc511f, 0x9b30952c,
        0xcc814544, 0xaf5ebd09, 0xbee3d004, 0xde334afd, 0x660f2807, 0x192e4bb3,
        0xc0cba857, 0x45c8740f, 0xd20b5f39, 0xb9d3fbdb, 0x5579c0bd, 0x1a60320a,
        0xd6a100c6, 0x402c7279, 0x679f25fe, 0xfb1fa3cc, 0x8ea5e9f8, 0xdb3222f8,
        0x3c7516df, 0xfd616b15, 0x2f501ec8, 0xad0552ab, 0x323db5fa, 0xfd238760,
        0x53317b48, 0x3e00df82, 0x9e5c57bb, 0xca6f8ca0, 0x1a87562e, 0xdf1769db,
        0xd542a8f6, 0x287effc3, 0xac6732c6, 0x8c4f5573, 0x695b27b0, 0xbbca58c8,
        0xe1ffa35d, 0xb8f011a0, 0x10fa3d98, 0xfd2183b8, 0x4afcb56c, 0x2dd1d35b,
        0x9a53e479, 0xb6f84565, 0xd28e49bc, 0x4bfb9790, 0xe1ddf2da, 0xa4cb7e33,
        0x62fb1341, 0xcee4c6e8, 0xef20cada, 0x36774c01, 0xd07e9efe, 0x2bf11fb4,
        0x95dbda4d, 0xae909198, 0xeaad8e71, 0x6b93d5a0, 0xd08ed1d0, 0xafc725e0,
        0x8e3c5b2f, 0x8e7594b7, 0x8ff6e2fb, 0xf2122b64, 0x8888b812, 0x900df01c,
        0x4fad5ea0, 0x688fc31c, 0xd1cff191, 0xb3a8c1ad, 0x2f2f2218, 0xbe0e1777,
        0xea752dfe, 0x8b021fa1, 0xe5a0cc0f, 0xb56f74e8, 0x18acf3d6, 0xce89e299,
        0xb4a84fe0, 0xfd13e0b7, 0x7cc43b81, 0xd2ada8d9, 0x165fa266, 0x80957705,
        0x93cc7314, 0x211a1477, 0xe6ad2065, 0x77b5fa86, 0xc75442f5, 0xfb9d35cf,
        0xebcdaf0c, 0x7b3e89a0, 0xd6411bd3, 0xae1e7e49, 0x00250e2d, 0x2071b35e,
        0x226800bb, 0x57b8e0af, 0x2464369b, 0xf009b91e, 0x5563911d, 0x59dfa6aa,
        0x78c14389, 0xd95a537f, 0x207d5ba2, 0x02e5b9c5, 0x83260376, 0x6295cfa9,
        0x11c81968, 0x4e734a41, 0xb3472dca, 0x7b14a94a, 0x1b510052, 0x9a532915,
        0xd60f573f, 0xbc9bc6e4, 0x2b60a476, 0x81e67400, 0x08ba6fb5, 0x571be91f,
        0xf296ec6b, 0x2a0dd915, 0xb6636521, 0xe7b9f9b6, 0xff34052e, 0xc5855664,
        0x53b02d5d, 0xa99f8fa1, 0x08ba4799, 0x6e85076a, 0x4b7a70e9, 0xb5b32944,
        0xdb75092e, 0xc4192623, 0xad6ea6b0, 0x49a7df7d, 0x9cee60b8, 0x8fedb266,
        0xecaa8c71, 0x699a17ff, 0x5664526c, 0xc2b19ee1, 0x193602a5, 0x75094c29,
        0xa0591340, 0xe4183a3e, 0x3f54989a, 0x5b429d65, 0x6b8fe4d6, 0x99f73fd6,
        0xa1d29c07, 0xefe830f5, 0x4d2d38e6, 0xf0255dc1, 0x4cdd2086, 0x8470eb26,
        0x6382e9c6, 0x021ecc5e, 0x09686b3f, 0x3ebaefc9, 0x3c971814, 0x6b6a70a1,
        0x687f3584, 0x52a0e286, 0xb79c5305, 0xaa500737, 0x3e07841c, 0x7fdeae5c,
        0x8e7d44ec, 0x5716f2b8, 0xb03ada37, 0xf0500c0d, 0xf01c1f04, 0x0200b3ff,
        0xae0cf51a, 0x3cb574b2, 0x25837a58, 0xdc0921bd, 0xd19113f9, 0x7ca92ff6,
        0x94324773, 0x22f54701, 0x3ae5e581, 0x37c2dadc, 0xc8b57634, 0x9af3dda7,
        0xa9446146, 0x0fd0030e, 0xecc8c73e, 0xa4751e41, 0xe238cd99, 0x3bea0e2f,
        0x3280bba1, 0x183eb331, 0x4e548b38, 0x4f6db908, 0x6f420d03, 0xf60a04bf,
        0x2cb81290, 0x24977c79, 0x5679b072, 0xbcaf89af, 0xde9a771f, 0xd9930810,
        0xb38bae12, 0xdccf3f2e, 0x5512721f, 0x2e6b7124, 0x501adde6, 0x9f84cd87,
        0x7a584718, 0x7408da17, 0xbc9f9abc, 0xe94b7d8c, 0xec7aec3a, 0xdb851dfa,
        0x63094366, 0xc464c3d2, 0xef1c1847, 0x3215d908, 0xdd433b37, 0x24c2ba16,
        0x12a14d43, 0x2a65c451, 0x50940002, 0x133ae4dd, 0x71dff89e, 0x10314e55,
        0x81ac77d6, 0x5f11199b, 0x043556f1, 0xd7a3c76b, 0x3c11183b, 0x5924a509,
        0xf28fe6ed, 0x97f1fbfa, 0x9ebabf2c, 0x1e153c6e, 0x86e34570, 0xeae96fb1,
        0x860e5e0a, 0x5a3e2ab3, 0x771fe71c, 0x4e3d06fa, 0x2965dcb9, 0x99e71d0f,
        0x803e89d6, 0x5266c825, 0x2e4cc978, 0x9c10b36a, 0xc6150eba, 0x94e2ea78,
        0xa5fc3c53, 0x1e0a2df4, 0xf2f74ea7, 0x361d2b3d, 0x1939260f, 0x19c27960,
        0x5223a708, 0xf71312b6, 0xebadfe6e, 0xeac31f66, 0xe3bc4595, 0xa67bc883,
        0xb17f37d1, 0x018cff28, 0xc332ddef, 0xbe6c5aa5, 0x65582185, 0x68ab9802,
        0xeecea50f, 0xdb2f953b, 0x2aef7dad, 0x5b6e2f84, 0x1521b628, 0x29076170,
        0xecdd4775, 0x619f1510, 0x13cca830, 0xeb61bd96, 0x0334fe1e, 0xaa0363cf,
        0xb5735c90, 0x4c70a239, 0xd59e9e0b, 0xcbaade14, 0xeecc86bc, 0x60622ca7,
        0x9cab5cab, 0xb2f3846e, 0x648b1eaf, 0x19bdf0ca, 0xa02369b9, 0x655abb50,
        0x40685a32, 0x3c2ab4b3, 0x319ee9d5, 0xc021b8f7, 0x9b540b19, 0x875fa099,
        0x95f7997e, 0x623d7da8, 0xf837889a, 0x97e32d77, 0x11ed935f, 0x16681281,
        0x0e358829, 0xc7e61fd6, 0x96dedfa1, 0x7858ba99, 0x57f584a5, 0x1b227263,
        0x9b83c3ff, 0x1ac24696, 0xcdb30aeb, 0x532e3054, 0x8fd948e4, 0x6dbc3128,
        0x58ebf2ef, 0x34c6ffea, 0xfe28ed61, 0xee7c3c73, 0x5d4a14d9, 0xe864b7e3,
        0x42105d14, 0x203e13e0, 0x45eee2b6, 0xa3aaabea, 0xdb6c4f15, 0xfacb4fd0,
        0xc742f442, 0xef6abbb5, 0x654f3b1d, 0x41cd2105, 0xd81e799e, 0x86854dc7,
        0xe44b476a, 0x3d816250, 0xcf62a1f2, 0x5b8d2646, 0xfc8883a0, 0xc1c7b6a3,
        0x7f1524c3, 0x69cb7492, 0x47848a0b, 0x5692b285, 0x095bbf00, 0xad19489d,
        0x1462b174, 0x23820e00, 0x58428d2a, 0x0c55f5ea, 0x1dadf43e, 0x233f7061,
        0x3372f092, 0x8d937e41, 0xd65fecf1, 0x6c223bdb, 0x7cde3759, 0xcbee7460,
        0x4085f2a7, 0xce77326e, 0xa6078084, 0x19f8509e, 0xe8efd855, 0x61d99735,
        0xa969a7aa, 0xc50c06c2, 0x5a04abfc, 0x800bcadc, 0x9e447a2e, 0xc3453484,
        0xfdd56705, 0x0e1e9ec9, 0xdb73dbd3, 0x105588cd, 0x675fda79, 0xe3674340,
        0xc5c43465, 0x713e38d8, 0x3d28f89e, 0xf16dff20, 0x153e21e7, 0x8fb03d4a,
        0xe6e39f2b, 0xdb83adf7, 0xe93d5a68, 0x948140f7, 0xf64c261c, 0x94692934,
        0x411520f7, 0x7602d4f7, 0xbcf46b2e, 0xd4a20068, 0xd4082471, 0x3320f46a,
        0x43b7d4b7, 0x500061af, 0x1e39f62e, 0x97244546, 0x14214f74, 0xbf8b8840,
        0x4d95fc1d, 0x96b591af, 0x70f4ddd3, 0x66a02f45, 0xbfbc09ec, 0x03bd9785,
        0x7fac6dd0, 0x31cb8504, 0x96eb27b3, 0x55fd3941, 0xda2547e6, 0xabca0a9a,
        0x28507825, 0x530429f4, 0x0a2c86da, 0xe9b66dfb, 0x68dc1462, 0xd7486900,
        0x680ec0a4, 0x27a18dee, 0x4f3ffea2, 0xe887ad8c, 0xb58ce006, 0x7af4d6b6,
        0xaace1e7c, 0xd3375fec, 0xce78a399, 0x406b2a42, 0x20fe9e35, 0xd9f385b9,
        0xee39d7ab, 0x3b124e8b, 0x1dc9faf7, 0x4b6d1856, 0x26a36631, 0xeae397b2,
        0x3a6efa74, 0xdd5b4332, 0x6841e7f7, 0xca7820fb, 0xfb0af54e, 0xd8feb397,
        0x454056ac, 0xba489527, 0x55533a3a, 0x20838d87, 0xfe6ba9b7, 0xd096954b,
        0x55a867bc, 0xa1159a58, 0xcca92963, 0x99e1db33, 0xa62a4a56, 0x3f3125f9,
        0x5ef47e1c, 0x9029317c, 0xfdf8e802, 0x04272f70, 0x80bb155c, 0x05282ce3,
        0x95c11548, 0xe4c66d22, 0x48c1133f, 0xc70f86dc, 0x07f9c9ee, 0x41041f0f,
        0x404779a4, 0x5d886e17, 0x325f51eb, 0xd59bc0d1, 0xf2bcc18f, 0x41113564,
        0x257b7834, 0x602a9c60, 0xdff8e8a3, 0x1f636c1b, 0x0e12b4c2, 0x02e1329e,
        0xaf664fd1, 0xcad18115, 0x6b2395e0, 0x333e92e1, 0x3b240b62, 0xeebeb922,
        0x85b2a20e, 0xe6ba0d99, 0xde720c8c, 0x2da2f728, 0xd0127845, 0x95b794fd,
        0x647d0862, 0xe7ccf5f0, 0x5449a36f, 0x877d48fa, 0xc39dfd27, 0xf33e8d1e,
        0x0a476341, 0x992eff74, 0x3a6f6eab, 0xf4f8fd37, 0xa812dc60, 0xa1ebddf8,
        0x991be14c, 0xdb6e6b0d, 0xc67b5510, 0x6d672c37, 0x2765d43b, 0xdcd0e804,
        0xf1290dc7, 0xcc00ffa3, 0xb5390f92, 0x690fed0b, 0x667b9ffb, 0xcedb7d9c,
        0xa091cf0b, 0xd9155ea3, 0xbb132f88, 0x515bad24, 0x7b9479bf, 0x763bd6eb,
        0x37392eb3, 0xcc115979, 0x8026e297, 0xf42e312d, 0x6842ada7, 0xc66a2b3b,
        0x12754ccc, 0x782ef11c, 0x6a124237, 0xb79251e7, 0x06a1bbe6, 0x4bfb6350,
        0x1a6b1018, 0x11caedfa, 0x3d25bdd8, 0xe2e1c3c9, 0x44421659, 0x0a121386,
        0xd90cec6e, 0xd5abea2a, 0x64af674e, 0xda86a85f, 0xbebfe988, 0x64e4c3fe,
        0x9dbc8057, 0xf0f7c086, 0x60787bf8, 0x6003604d, 0xd1fd8346, 0xf6381fb0,
        0x7745ae04, 0xd736fccc, 0x83426b33, 0xf01eab71, 0xb0804187, 0x3c005e5f,
        0x77a057be, 0xbde8ae24, 0x55464299, 0xbf582e61, 0x4e58f48f, 0xf2ddfda2,
        0xf474ef38, 0x8789bdc2, 0x5366f9c3, 0xc8b38e74, 0xb475f255, 0x46fcd9b9,
        0x7aeb2661, 0x8b1ddf84, 0x846a0e79, 0x915f95e2, 0x466e598e, 0x20b45770,
        0x8cd55591, 0xc902de4c, 0xb90bace1, 0xbb8205d0, 0x11a86248, 0x7574a99e,
        0xb77f19b6, 0xe0a9dc09, 0x662d09a1, 0xc4324633, 0xe85a1f02, 0x09f0be8c,
        0x4a99a025, 0x1d6efe10, 0x1ab93d1d, 0x0ba5a4df, 0xa186f20f, 0x2868f169,
        0xdcb7da83, 0x573906fe, 0xa1e2ce9b, 0x4fcd7f52, 0x50115e01, 0xa70683fa,
        0xa002b5c4, 0x0de6d027, 0x9af88c27, 0x773f8641, 0xc3604c06, 0x61a806b5,
        0xf0177a28, 0xc0f586e0, 0x006058aa, 0x30dc7d62, 0x11e69ed7, 0x2338ea63,
        0x53c2dd94, 0xc2c21634, 0xbbcbee56, 0x90bcb6de, 0xebfc7da1, 0xce591d76,
        0x6f05e409, 0x4b7c0188, 0x39720a3d, 0x7c927c24, 0x86e3725f, 0x724d9db9,
        0x1ac15bb4, 0xd39eb8fc, 0xed545578, 0x08fca5b5, 0xd83d7cd3, 0x4dad0fc4,
        0x1e50ef5e, 0xb161e6f8, 0xa28514d9, 0x6c51133c, 0x6fd5c7e7, 0x56e14ec4,
        0x362abfce, 0xddc6c837, 0xd79a3234, 0x92638212, 0x670efa8e, 0x406000e0,
        0x3a39ce37, 0xd3faf5cf, 0xabc27737, 0x5ac52d1b, 0x5cb0679e, 0x4fa33742,
        0xd3822740, 0x99bc9bbe, 0xd5118e9d, 0xbf0f7315, 0xd62d1c7e, 0xc700c47b,
        0xb78c1b6b, 0x21a19045, 0xb26eb1be, 0x6a366eb4, 0x5748ab2f, 0xbc946e79,
        0xc6a376d2, 0x6549c2c8, 0x530ff8ee, 0x468dde7d, 0xd5730a1d, 0x4cd04dc6,
        0x2939bbdb, 0xa9ba4650, 0xac9526e8, 0xbe5ee304, 0xa1fad5f0, 0x6a2d519a,
        0x63ef8ce2, 0x9a86ee22, 0xc089c2b8, 0x43242ef6, 0xa51e03aa, 0x9cf2d0a4,
        0x83c061ba, 0x9be96a4d, 0x8fe51550, 0xba645bd6, 0x2826a2f9, 0xa73a3ae1,
        0x4ba99586, 0xef5562e9, 0xc72fefd3, 0xf752f7da, 0x3f046f69, 0x77fa0a59,
        0x80e4a915, 0x87b08601, 0x9b09e6ad, 0x3b3ee593, 0xe990fd5a, 0x9e34d797,
        0x2cf0b7d9, 0x022b8b51, 0x96d5ac3a, 0x017da67d, 0xd1cf3ed6, 0x7c7d2d28,
        0x1f9f25cf, 0xadf2b89b, 0x5ad6b472, 0x5a88f54c, 0xe029ac71, 0xe019a5e6,
        0x47b0acfd, 0xed93fa9b, 0xe8d3c48d, 0x283b57cc, 0xf8d56629, 0x79132e28,
        0x785f0191, 0xed756055, 0xf7960e44, 0xe3d35e8c, 0x15056dd4, 0x88f46dba,
        0x03a16125, 0x0564f0bd, 0xc3eb9e15, 0x3c9057a2, 0x97271aec, 0xa93a072a,
        0x1b3f6d9b, 0x1e6321f5, 0xf59c66fb, 0x26dcf319, 0x7533d928, 0xb155fdf5,
        0x03563482, 0x8aba3cbb, 0x28517711, 0xc20ad9f8, 0xabcc5167, 0xccad925f,
        0x4de81751, 0x3830dc8e, 0x379d5862, 0x9320f991, 0xea7a90c2, 0xfb3e7bce,
        0x5121ce64, 0x774fbe32, 0xa8b6e37e, 0xc3293d46, 0x48de5369, 0x6413e680,
        0xa2ae0810, 0xdd6db224, 0x69852dfd, 0x09072166, 0xb39a460a, 0x6445c0dd,
        0x586cdecf, 0x1c20c8ae, 0x5bbef7dd, 0x1b588d40, 0xccd2017f, 0x6bb4e3bb,
        0xdda26a7e, 0x3a59ff45, 0x3e350a44, 0xbcb4cdd5, 0x72eacea8, 0xfa6484bb,
        0x8d6612ae, 0xbf3c6f47, 0xd29be463, 0x542f5d9e, 0xaec2771b, 0xf64e6370,
        0x740e0d8d, 0xe75b1357, 0xf8721671, 0xaf537d5d, 0x4040cb08, 0x4eb4e2cc,
        0x34d2466a, 0x0115af84, 0xe1b00428, 0x95983a1d, 0x06b89fb4, 0xce6ea048,
        0x6f3f3b82, 0x3520ab82, 0x011a1d4b, 0x277227f8, 0x611560b1, 0xe7933fdc,
        0xbb3a792b, 0x344525bd, 0xa08839e1, 0x51ce794b, 0x2f32c9b7, 0xa01fbac9,
        0xe01cc87e, 0xbcc7d1f6, 0xcf0111c3, 0xa1e8aac7, 0x1a908749, 0xd44fbd9a,
        0xd0dadecb, 0xd50ada38, 0x0339c32a, 0xc6913667, 0x8df9317c, 0xe0b12b4f,
        0xf79e59b7, 0x43f5bb3a, 0xf2d519ff, 0x27d9459c, 0xbf97222c, 0x15e6fc2a,
        0x0f91fc71, 0x9b941525, 0xfae59361, 0xceb69ceb, 0xc2a86459, 0x12baa8d1,
        0xb6c1075e, 0xe3056a0c, 0x10d25065, 0xcb03a442, 0xe0ec6e0e, 0x1698db3b,
        0x4c98a0be, 0x3278e964, 0x9f1f9532, 0xe0d392df, 0xd3a0342b, 0x8971f21e,
        0x1b0a7441, 0x4ba3348c, 0xc5be7120, 0xc37632d8, 0xdf359f8d, 0x9b992f2e,
        0xe60b6f47, 0x0fe3f11d, 0xe54cda54, 0x1edad891, 0xce6279cf, 0xcd3e7e6f,
        0x1618b166, 0xfd2c1d05, 0x848fd2c5, 0xf6fb2299, 0xf523f357, 0xa6327623,
        0x93a83531, 0x56cccd02, 0xacf08162, 0x5a75ebb5, 0x6e163697, 0x88d273cc,
        0xde966292, 0x81b949d0, 0x4c50901b, 0x71c65614, 0xe6c6c7bd, 0x327a140a,
        0x45e1d006, 0xc3f27b9a, 0xc9aa53fd, 0x62a80f00, 0xbb25bfe2, 0x35bdd2f6,
        0x71126905, 0xb2040222, 0xb6cbcf7c, 0xcd769c2b, 0x53113ec0, 0x1640e3d3,
        0x38abbd60, 0x2547adf0, 0xba38209c, 0xf746ce76, 0x77afa1c5, 0x20756060,
        0x85cbfe4e, 0x8ae88dd8, 0x7aaaf9b0, 0x4cf9aa7e, 0x1948c25c, 0x02fb8a8c,
        0x01c36ae4, 0xd6ebe1f9, 0x90d4f869, 0xa65cdea0, 0x3f09252d, 0xc208e69f,
        0xb74e6132, 0xce77e25b, 0x578fdfe3, 0x3ac372e6,
    ];

    /// Map one bcrypt-base64 character to its 6-bit value.
    fn b64_val(c: u8) -> Option<u32> {
        match c {
            b'.' => Some(0),
            b'/' => Some(1),
            b'A'..=b'Z' => Some((c - b'A') as u32 + 2),
            b'a'..=b'z' => Some((c - b'a') as u32 + 28),
            b'0'..=b'9' => Some((c - b'0') as u32 + 54),
            _ => None,
        }
    }

    /// Encode up to `len` bytes with the bcrypt alphabet and no padding.
    ///
    /// Mirrors `base64_encode` in the vendored JS, including its handling of a
    /// trailing partial group.
    fn b64_encode(b: &[u8], len: usize) -> String {
        let mut out = String::with_capacity(len.div_ceil(3) * 4);
        let mut off = 0usize;
        while off < len {
            let mut c1 = b[off] as u32 & 0xff;
            off += 1;
            out.push(B64_CODE[((c1 >> 2) & 0x3f) as usize] as char);
            c1 = (c1 & 0x03) << 4;
            if off >= len {
                out.push(B64_CODE[(c1 & 0x3f) as usize] as char);
                break;
            }
            let mut c2 = b[off] as u32 & 0xff;
            off += 1;
            c1 |= (c2 >> 4) & 0x0f;
            out.push(B64_CODE[(c1 & 0x3f) as usize] as char);
            c1 = (c2 & 0x0f) << 2;
            if off >= len {
                out.push(B64_CODE[(c1 & 0x3f) as usize] as char);
                break;
            }
            c2 = b[off] as u32 & 0xff;
            off += 1;
            c1 |= (c2 >> 6) & 0x03;
            out.push(B64_CODE[(c1 & 0x3f) as usize] as char);
            out.push(B64_CODE[(c2 & 0x3f) as usize] as char);
        }
        out
    }

    /// Decode bcrypt-base64 text to at most `len` bytes.
    ///
    /// Stricter than the vendored JS, which lets an invalid trailing character
    /// produce a garbage byte; here any invalid character yields `None`. Such
    /// input cannot come from a real bcrypt hash.
    fn b64_decode(s: &str, len: usize) -> Option<Vec<u8>> {
        let b = s.as_bytes();
        let slen = b.len();
        let mut out = Vec::with_capacity(len);
        let mut off = 0usize;
        while off + 1 < slen && out.len() < len {
            let c1 = b64_val(b[off])?;
            let c2 = b64_val(b[off + 1])?;
            off += 2;
            out.push((((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff) as u8);
            if out.len() >= len || off >= slen {
                break;
            }
            let c3 = b64_val(b[off])?;
            off += 1;
            out.push(((((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff) as u8);
            if out.len() >= len || off >= slen {
                break;
            }
            let c4 = b64_val(b[off])?;
            off += 1;
            out.push(((((c3 & 0x03) << 6) | c4) & 0xff) as u8);
        }
        Some(out)
    }

    /// One Blowfish encryption of the 64-bit block `(l, r)`.
    ///
    /// Sixteen Feistel rounds with the standard bcrypt F function. All
    /// arithmetic wraps, matching the `Int32Array` math in the vendored JS.
    fn encipher(mut l: u32, mut r: u32, p: &[u32; 18], s: &[u32; 1024]) -> (u32, u32) {
        l ^= p[0];
        let mut i = 0usize;
        while i < 16 {
            let mut n = s[(l >> 24) as usize];
            n = n.wrapping_add(s[0x100 | ((l >> 16) & 0xff) as usize]);
            n ^= s[0x200 | ((l >> 8) & 0xff) as usize];
            n = n.wrapping_add(s[0x300 | (l & 0xff) as usize]);
            r ^= n ^ p[i + 1];

            n = s[(r >> 24) as usize];
            n = n.wrapping_add(s[0x100 | ((r >> 16) & 0xff) as usize]);
            n ^= s[0x200 | ((r >> 8) & 0xff) as usize];
            n = n.wrapping_add(s[0x300 | (r & 0xff) as usize]);
            l ^= n ^ p[i + 2];

            i += 2;
        }
        (r ^ p[17], l)
    }

    /// Read the next big-endian 32-bit word from `data`, wrapping at the end.
    ///
    /// Returns the word and the next offset. The wrap (rather than truncation)
    /// is bcryptjs behavior and is why passwords longer than 72 bytes hash
    /// differently here than under canonical bcrypt.
    fn stream_to_word(data: &[u8], mut offp: usize) -> (u32, usize) {
        let mut word: u32 = 0;
        for _ in 0..4 {
            word = (word << 8) | (data[offp] as u32 & 0xff);
            offp = (offp + 1) % data.len();
        }
        (word, offp)
    }

    /// Standard Blowfish key schedule over `key`.
    fn key_schedule(key: &[u8], p: &mut [u32; 18], s: &mut [u32; 1024]) {
        let mut offset = 0usize;
        for item in p.iter_mut() {
            let (w, next) = stream_to_word(key, offset);
            offset = next;
            *item ^= w;
        }
        let (mut l, mut r) = (0u32, 0u32);
        let mut i = 0usize;
        while i < 18 {
            let (nl, nr) = encipher(l, r, p, s);
            l = nl;
            r = nr;
            p[i] = l;
            p[i + 1] = r;
            i += 2;
        }
        i = 0;
        while i < 1024 {
            let (nl, nr) = encipher(l, r, p, s);
            l = nl;
            r = nr;
            s[i] = l;
            s[i + 1] = r;
            i += 2;
        }
    }

    /// Expensive key schedule (EksBlowfish) mixing both `data` (the salt) and
    /// `key` (the password).
    fn eks_key(data: &[u8], key: &[u8], p: &mut [u32; 18], s: &mut [u32; 1024]) {
        let mut offp = 0usize;
        for item in p.iter_mut() {
            let (w, next) = stream_to_word(key, offp);
            offp = next;
            *item ^= w;
        }
        offp = 0;
        let (mut l, mut r) = (0u32, 0u32);
        let mut i = 0usize;
        while i < 18 {
            let (w1, n1) = stream_to_word(data, offp);
            let (w2, n2) = stream_to_word(data, n1);
            offp = n2;
            l ^= w1;
            r ^= w2;
            let (nl, nr) = encipher(l, r, p, s);
            l = nl;
            r = nr;
            p[i] = l;
            p[i + 1] = r;
            i += 2;
        }
        i = 0;
        while i < 1024 {
            let (w1, n1) = stream_to_word(data, offp);
            let (w2, n2) = stream_to_word(data, n1);
            offp = n2;
            l ^= w1;
            r ^= w2;
            let (nl, nr) = encipher(l, r, p, s);
            l = nl;
            r = nr;
            s[i] = l;
            s[i + 1] = r;
            i += 2;
        }
    }

    /// Run the bcrypt core and return the 24 raw ciphertext bytes.
    ///
    /// `log_rounds` is the cost exponent; the caller has already checked it is
    /// in 4..=31. `salt` must be exactly [`BCRYPT_SALT_LEN`] bytes.
    fn crypt_raw(password: &[u8], salt: &[u8], log_rounds: u32) -> Option<[u8; 24]> {
        if salt.len() != BCRYPT_SALT_LEN || password.is_empty() {
            return None;
        }
        let rounds: u64 = 1u64 << log_rounds;

        let mut p = P_ORIG;
        let mut s = S_ORIG;
        eks_key(salt, password, &mut p, &mut s);
        for _ in 0..rounds {
            key_schedule(password, &mut p, &mut s);
            key_schedule(salt, &mut p, &mut s);
        }

        let mut cdata = C_ORIG;
        for _ in 0..64 {
            let mut j = 0usize;
            while j < cdata.len() {
                let (l, r) = encipher(cdata[j], cdata[j + 1], &p, &s);
                cdata[j] = l;
                cdata[j + 1] = r;
                j += 2;
            }
        }

        let mut out = [0u8; 24];
        for (i, word) in cdata.iter().enumerate() {
            out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        Some(out)
    }

    /// Verify a password against a legacy bcrypt hash.
    ///
    /// Accepts `$2a$`, `$2b$` and `$2y$`. The three are handled identically,
    /// exactly as the vendored `bcryptjs` does: all three append the trailing
    /// NUL byte and share one code path. The documented `$2a$` / `$2b$`
    /// divergence only appears for passwords of 255 bytes or more, and the
    /// backend caps passwords at 72 characters. Bare `$2$` is rejected because
    /// such a hash cannot be 60 characters long.
    ///
    /// # Arguments
    ///
    /// * `password` - Plain-text password; hashed as UTF-8.
    /// * `stored` - Full 60-character bcrypt hash.
    ///
    /// # Returns
    ///
    /// `true` only if the hash recomputes byte-identically. Any malformed
    /// input returns `false` rather than panicking.
    pub fn verify(password: &str, stored: &str) -> bool {
        let b = stored.as_bytes();
        if b.len() != HASH_LEN || !stored.is_ascii() {
            return false;
        }
        if b[0] != b'$' || b[1] != b'2' {
            return false;
        }
        let minor = b[2];
        if !matches!(minor, b'a' | b'b' | b'y') || b[3] != b'$' {
            return false;
        }
        if !b[4].is_ascii_digit() || !b[5].is_ascii_digit() || b[6] != b'$' {
            return false;
        }
        let log_rounds = (b[4] - b'0') as u32 * 10 + (b[5] - b'0') as u32;
        if !(4..=31).contains(&log_rounds) {
            return false;
        }

        let Some(salt) = b64_decode(&stored[7..29], BCRYPT_SALT_LEN) else {
            return false;
        };
        if salt.len() != BCRYPT_SALT_LEN {
            return false;
        }

        // All supported variants append a NUL terminator to the password.
        let mut pw = password.as_bytes().to_vec();
        pw.push(0);

        let Some(raw) = crypt_raw(&pw, &salt, log_rounds) else {
            return false;
        };

        // Only 23 of the 24 ciphertext bytes are encoded — bcrypt drops the last.
        let recomputed = format!(
            "$2{}${:02}${}{}",
            minor as char,
            log_rounds,
            b64_encode(&salt, salt.len()),
            b64_encode(&raw, C_ORIG.len() * 4 - 1)
        );
        ct_eq(recomputed.as_bytes(), b)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::hex_encode;

    // --- PBKDF2-HMAC-SHA-256 (RFC 6070 inputs, SHA-256 outputs) ---

    #[test]
    fn pbkdf2_one_iteration() {
        assert_eq!(
            hex_encode(&pbkdf2_hmac_sha256(b"password", b"salt", 1, 32)),
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
        );
    }

    #[test]
    fn pbkdf2_two_iterations() {
        assert_eq!(
            hex_encode(&pbkdf2_hmac_sha256(b"password", b"salt", 2, 32)),
            "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"
        );
    }

    #[test]
    fn pbkdf2_4096_iterations() {
        assert_eq!(
            hex_encode(&pbkdf2_hmac_sha256(b"password", b"salt", 4096, 32)),
            "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a"
        );
    }

    #[test]
    fn pbkdf2_multi_block_output() {
        assert_eq!(
            hex_encode(&pbkdf2_hmac_sha256(
                b"passwordPASSWORDpassword",
                b"saltSALTsaltSALTsaltSALTsaltSALTsalt",
                4096,
                40
            )),
            "348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9"
        );
    }

    #[test]
    fn pbkdf2_handles_embedded_nul() {
        assert_eq!(
            hex_encode(&pbkdf2_hmac_sha256(b"pass\0word", b"sa\0lt", 4096, 16)),
            "89b69d0516f829893c696226650a8687"
        );
    }

    // --- scrypt (RFC 7914 §12) ---

    #[test]
    fn scrypt_rfc7914_vector_1() {
        let dk = scrypt(b"", b"", 16, 1, 1, 64).unwrap();
        assert_eq!(
            hex_encode(&dk),
            concat!(
                "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442",
                "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906"
            )
        );
    }

    #[test]
    fn scrypt_rfc7914_vector_2() {
        let dk = scrypt(b"password", b"NaCl", 1024, 8, 16, 64).unwrap();
        assert_eq!(
            hex_encode(&dk),
            concat!(
                "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162",
                "2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640"
            )
        );
    }

    #[test]
    fn scrypt_rfc7914_vector_3_node_defaults() {
        // N=16384, r=8, p=1 — exactly the parameters hash_password uses.
        let dk = scrypt(b"pleaseletmein", b"SodiumChloride", 16384, 8, 1, 64).unwrap();
        assert_eq!(
            hex_encode(&dk),
            concat!(
                "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2",
                "d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887"
            )
        );
    }

    #[test]
    fn scrypt_rejects_invalid_parameters() {
        assert_eq!(scrypt(b"p", b"s", 0, 8, 1, 64), Err(ScryptError::InvalidN));
        assert_eq!(scrypt(b"p", b"s", 1, 8, 1, 64), Err(ScryptError::InvalidN));
        assert_eq!(scrypt(b"p", b"s", 3, 8, 1, 64), Err(ScryptError::InvalidN));
        assert_eq!(
            scrypt(b"p", b"s", 16, 0, 1, 64),
            Err(ScryptError::InvalidBlockOrParallelism)
        );
        assert_eq!(
            scrypt(b"p", b"s", 16, 8, 0, 64),
            Err(ScryptError::InvalidBlockOrParallelism)
        );
        assert_eq!(
            scrypt(b"p", b"s", 16, 8, 1, 0),
            Err(ScryptError::InvalidKeyLength)
        );
    }

    #[test]
    fn scrypt_rejects_overflowing_parameters() {
        assert_eq!(
            scrypt(b"p", b"s", 2, u32::MAX, u32::MAX, 64),
            Err(ScryptError::Overflow)
        );
    }

    // --- hash_password / verify_password ---

    /// A real hash for `"hunter2"` in the parameterless form, produced by the
    /// Node backend this crate replaced:
    ///   `node -e 'import("./lib/auth.ts").then(m=>m.hashPassword("hunter2").then(console.log))'`
    ///
    /// Rows like this exist in deployed databases, so it is a compatibility
    /// fixture: it must keep verifying forever.
    const NODE_HASH: &str = "scrypt$XnQgSiWEOZl_T9WK3hisbA$IQQOk7Kk1Q-OxcBjTy9W8b3bffUc7uCq_JzBXMLMocZB8_HDFmmZZucFb1e_g7zAdiWSDsHWL_Q831nuhK_OSw";

    /// Encode a hash at arbitrary parameters, standing in for one written by a
    /// build configured differently from this one.
    fn hash_at(password: &str, params: ScryptParams) -> String {
        let salt = random_bytes(SCRYPT_SALT_LEN).unwrap();
        let key = scrypt(
            password.as_bytes(),
            &salt,
            params.n,
            params.r,
            params.p,
            SCRYPT_KEY_LEN,
        )
        .unwrap();
        format!(
            "scrypt${}${}${}${}${}",
            params.n,
            params.r,
            params.p,
            base64url_encode(&salt),
            base64url_encode(&key)
        )
    }

    #[test]
    fn hash_password_records_its_parameters() {
        let h = hash_password("hunter2").unwrap();
        let parts: Vec<&str> = h.split('$').collect();
        assert_eq!(parts.len(), 6);
        assert_eq!(parts[0], "scrypt");
        assert_eq!(parts[1], SCRYPT_N.to_string());
        assert_eq!(parts[2], SCRYPT_R.to_string());
        assert_eq!(parts[3], SCRYPT_P.to_string());
        assert_eq!(base64url_decode(parts[4]).unwrap().len(), SCRYPT_SALT_LEN);
        assert_eq!(base64url_decode(parts[5]).unwrap().len(), SCRYPT_KEY_LEN);
        assert!(!h.contains('='), "base64url must be unpadded");
    }

    #[test]
    fn verify_password_accepts_a_hash_made_at_other_parameters() {
        // The whole point of recording parameters: a hash from a build with a
        // different cost must still verify, at its own cost.
        let weaker = hash_at("hunter2", ScryptParams { n: 1024, r: 8, p: 1 });
        assert!(verify_password("hunter2", &weaker));
        assert!(!verify_password("wrong", &weaker));
    }

    #[test]
    fn needs_rehash_flags_a_hash_made_at_other_parameters() {
        let weaker = hash_at("hunter2", ScryptParams { n: 1024, r: 8, p: 1 });
        assert!(
            needs_rehash(&weaker),
            "a hash below the current cost must be upgraded on next sign-in"
        );
    }

    #[test]
    fn verify_password_refuses_parameters_beyond_the_cost_limit() {
        // A row demanding a huge working set must be rejected outright rather
        // than served by allocating gigabytes on an unauthenticated attempt.
        let salt = base64url_encode(b"0123456789abcdef");
        let key = base64url_encode(&[0u8; SCRYPT_KEY_LEN]);
        for (n, r, p) in [
            (1 << 30, 8, 1),  // ~1 TiB working set
            (16384, 100_000, 1),
            (16384, 8, SCRYPT_MAX_STORED_P + 1),
            (16383, 8, 1), // not a power of two
            (16384, 0, 1),
            (16384, 8, 0),
        ] {
            let hostile = format!("scrypt${n}${r}${p}${salt}${key}");
            assert!(
                !verify_password("hunter2", &hostile),
                "must refuse N={n} r={r} p={p}"
            );
            assert!(needs_rehash(&hostile), "must flag N={n} r={r} p={p}");
        }
    }

    #[test]
    fn verify_password_rejects_a_malformed_field_count() {
        let salt = base64url_encode(b"0123456789abcdef");
        let key = base64url_encode(&[0u8; SCRYPT_KEY_LEN]);
        for bad in [
            format!("scrypt${salt}"),
            format!("scrypt$8$1${salt}${key}"),
            format!("scrypt$16384$8$1$1${salt}${key}"),
        ] {
            assert!(!verify_password("hunter2", &bad), "should reject {bad:?}");
        }
    }

    #[test]
    fn hash_password_round_trips() {
        let h = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", &h));
        assert!(!verify_password("correct horse battery stapl", &h));
        assert!(!verify_password("", &h));
    }

    #[test]
    fn hash_password_salts_are_unique() {
        assert_ne!(
            hash_password("same").unwrap(),
            hash_password("same").unwrap()
        );
    }

    #[test]
    fn verify_password_matches_a_node_generated_hash() {
        let stored = NODE_HASH;
        assert!(verify_password("hunter2", stored));
        assert!(!verify_password("hunter3", stored));
    }

    #[test]
    fn verify_password_rejects_a_tampered_key() {
        let h = hash_password("hunter2").unwrap();
        let parts: Vec<&str> = h.split('$').collect();
        let key = parts[2];
        // Flip the first key character (not the last: leftover base64 bits
        // at the end can decode to the same 64 bytes).
        let flipped = format!(
            "{}{}",
            if key.as_bytes()[0] == b'A' { 'B' } else { 'A' },
            &key[1..]
        );
        let tampered = format!("scrypt${}${}", parts[1], flipped);
        assert!(!verify_password("hunter2", &tampered));
    }

    #[test]
    fn verify_password_rejects_malformed_without_panicking() {
        for bad in [
            "",
            "scrypt",
            "scrypt$",
            "scrypt$$",
            "scrypt$abc",
            "scrypt$abc$",
            "scrypt$!!!$!!!",
            "scrypt$AAAA$BBBB$CCCC",
            "plaintext",
            "$2",
            "$2b$",
            "$2b$10$tooshort",
            "$2z$10$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu",
            "$2b$03$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu",
            "$2b$xx$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu",
        ] {
            assert!(!verify_password("hunter2", bad), "should reject {bad:?}");
        }
    }

    #[test]
    fn verify_password_with_short_salt_is_still_safe() {
        // A truncated salt still derives a key; it simply will not match.
        let h = hash_password("hunter2").unwrap();
        let parts: Vec<&str> = h.split('$').collect();
        let short = format!(
            "scrypt${}${}${}${}${}",
            parts[1],
            parts[2],
            parts[3],
            &parts[4][..8],
            parts[5]
        );
        assert!(!verify_password("hunter2", &short));
    }

    // --- needs_rehash ---

    #[test]
    fn needs_rehash_is_true_for_legacy_and_unknown() {
        assert!(needs_rehash("$2b$10$GhP5.OsOXjQePASp1sHhGO"));
        assert!(needs_rehash("$2a$10$whatever"));
        assert!(needs_rehash(""));
        assert!(needs_rehash("plaintext"));
    }

    #[test]
    fn needs_rehash_is_false_for_scrypt() {
        assert!(!needs_rehash(&hash_password("hunter2").unwrap()));
    }

    #[test]
    fn needs_rehash_leaves_node_written_hashes_alone() {
        // The parameterless form carries Node's defaults, which are still the
        // current parameters — so upgrading this backend must not force every
        // existing user through a rehash.
        assert!(!needs_rehash(NODE_HASH));
        assert_eq!(
            CURRENT_PARAMS,
            ScryptParams {
                n: 16384,
                r: 8,
                p: 1
            },
            "if the defaults change, Node-written hashes become rehash candidates \
             and this test should assert that instead"
        );
    }

    #[test]
    fn needs_rehash_is_true_for_a_malformed_scrypt_hash() {
        assert!(needs_rehash("scrypt$a$b"));
        assert!(needs_rehash("scrypt$"));
    }

    // --- legacy bcrypt ---
    //
    // Vectors generated from the vendored implementation the Node backend
    // still uses:
    //   cd backend && node -e 'import("./vendor/legacy-bcrypt.js")
    //     .then(async m => console.log(await m.hash("abc", 10)))'

    #[test]
    fn bcrypt_verifies_cost_10_vector() {
        let stored = "$2b$10$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu";
        assert!(verify_password("abc", stored));
        assert!(!verify_password("abd", stored));
        assert!(!verify_password("", stored));
    }

    #[test]
    fn bcrypt_verifies_second_cost_10_vector() {
        let stored = "$2b$10$bp6Vy4vZr0X6VTpi84Q2CO23nUE8jVmMGl.0SCIImBBKBVaMn13Xm";
        assert!(verify_password("password123", stored));
        assert!(!verify_password("password124", stored));
    }

    #[test]
    fn bcrypt_verifies_empty_password_at_cost_4() {
        let stored = "$2b$04$SG3Qzi5phNbAXjCt5T49L.14s3Kepg3sRCEqJpfMQ7cQdXQM5UD9K";
        assert!(verify_password("", stored));
        assert!(!verify_password("x", stored));
    }

    #[test]
    fn bcrypt_verifies_72_byte_password() {
        let stored = "$2b$06$R.nzy/PZr4qy01.m7yoL/.5esIecoKb7LmFakpxqwyaaNt903vTqS";
        assert!(verify_password(&"a".repeat(72), stored));
        assert!(!verify_password(&"a".repeat(71), stored));
    }

    #[test]
    fn bcrypt_verifies_non_ascii_password() {
        let stored = "$2b$08$ntbVo71YgRcfO84YDA7NsedJTRudaLH58JVn2aoYF6DcrGPkwTpXK";
        assert!(verify_password("pässwörd🛹", stored));
        assert!(!verify_password("passwörd🛹", stored));
    }

    #[test]
    fn bcrypt_accepts_2a_and_2y_prefixes() {
        // Same salt and cost, relabeled: bcryptjs treats 2a/2b/2y identically.
        let base = "$2b$10$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu";
        for variant in ['a', 'y'] {
            let relabeled = format!("$2{}{}", variant, &base[3..]);
            assert!(
                verify_password("abc", &relabeled),
                "variant $2{variant}$ should verify"
            );
        }
    }

    #[test]
    fn bcrypt_rejects_wrong_length_hash() {
        let stored = "$2b$10$GhP5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKT";
        assert!(!verify_password("abc", stored));
    }

    #[test]
    fn bcrypt_rejects_invalid_base64_in_salt() {
        let stored = "$2b$10$Gh!5.OsOXjQePASp1sHhGOHzfK/v7ZSUs0edxcGQsk6wzx7TLwKTu";
        assert!(!verify_password("abc", stored));
    }
}

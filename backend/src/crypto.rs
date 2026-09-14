//! Hashes, encodings, and randomness — zero-crate replacement for `node:crypto`.
//!
//! Covers only the surface the backend actually uses: SHA-256 (FIPS 180-4),
//! HMAC-SHA-256 (RFC 2104), hex and base64/base64url codecs that byte-match
//! Node's `Buffer.toString('hex' | 'base64' | 'base64url')`, a constant-time
//! comparison mirroring `crypto.timingSafeEqual`, and `/dev/urandom`-backed
//! randomness for `crypto.randomBytes` / `crypto.randomUUID`.
//!
//! Randomness fails closed: there is no fallback to a clock or PRNG seed, since
//! these bytes back bearer tokens and password salts.

use std::fs::File;
use std::io::Read;

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

/// SHA-256 round constants — first 32 bits of the fractional parts of the cube
/// roots of the first 64 primes (FIPS 180-4 §4.2.2).
const K256: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// SHA-256 initial hash value (FIPS 180-4 §5.3.3).
const H256_INIT: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// SHA-256 block size in bytes. Also the HMAC padding width (RFC 2104).
pub const SHA256_BLOCK_LEN: usize = 64;

/// SHA-256 digest size in bytes.
pub const SHA256_DIGEST_LEN: usize = 32;

/// Streaming SHA-256 hasher.
///
/// Equivalent to `crypto.createHash('sha256')`: feed bytes with [`Sha256::update`]
/// in any chunking, then consume the hasher with [`Sha256::finalize`]. Chunk
/// boundaries never affect the digest.
#[derive(Clone)]
pub struct Sha256 {
    /// Running chaining value (the eight working words).
    state: [u32; 8],
    /// Partial block awaiting a full 64 bytes.
    buf: [u8; SHA256_BLOCK_LEN],
    /// Bytes currently held in `buf`.
    buf_len: usize,
    /// Total message length in bytes, used for the length suffix.
    total_len: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    /// Create a hasher primed with the FIPS 180-4 initial hash value.
    pub fn new() -> Self {
        Sha256 {
            state: H256_INIT,
            buf: [0u8; SHA256_BLOCK_LEN],
            buf_len: 0,
            total_len: 0,
        }
    }

    /// Absorb `data` into the running digest.
    ///
    /// Buffers a partial block internally, so repeated small updates produce
    /// the same digest as one large update.
    ///
    /// # Panics
    ///
    /// Never panics. Messages longer than `u64::MAX / 8` bits are not
    /// representable in the length suffix and would wrap, which no caller in
    /// this backend can reach (inputs are request-sized).
    pub fn update(&mut self, data: &[u8]) {
        self.total_len = self.total_len.wrapping_add(data.len() as u64);
        let mut rest = data;

        // Top up a partial block first.
        if self.buf_len > 0 {
            let take = rest.len().min(SHA256_BLOCK_LEN - self.buf_len);
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&rest[..take]);
            self.buf_len += take;
            rest = &rest[take..];
            if self.buf_len == SHA256_BLOCK_LEN {
                let block = self.buf;
                compress(&mut self.state, &block);
                self.buf_len = 0;
            }
        }

        // Then consume whole blocks straight from the input.
        while rest.len() >= SHA256_BLOCK_LEN {
            let (block, tail) = rest.split_at(SHA256_BLOCK_LEN);
            let mut b = [0u8; SHA256_BLOCK_LEN];
            b.copy_from_slice(block);
            compress(&mut self.state, &b);
            rest = tail;
        }

        // Keep whatever is left as the new partial block.
        if !rest.is_empty() {
            self.buf[..rest.len()].copy_from_slice(rest);
            self.buf_len = rest.len();
        }
    }

    /// Apply the FIPS 180-4 padding and return the 32-byte digest.
    ///
    /// Consumes the hasher: SHA-256 padding is destructive, so a hasher must
    /// not be reused after finalizing.
    pub fn finalize(mut self) -> [u8; SHA256_DIGEST_LEN] {
        let bit_len = self.total_len.wrapping_mul(8);

        // 0x80, then zeros until 56 bytes mod 64, then the 64-bit length.
        let mut pad = [0u8; 2 * SHA256_BLOCK_LEN];
        pad[0] = 0x80;
        let pad_len = if self.buf_len < 56 {
            56 - self.buf_len
        } else {
            120 - self.buf_len
        };
        pad[pad_len..pad_len + 8].copy_from_slice(&bit_len.to_be_bytes());
        let total = pad_len + 8;
        // `update` cannot recurse into padding: it only buffers and compresses.
        let padding: Vec<u8> = pad[..total].to_vec();
        self.total_len = 0; // length is already captured in `bit_len`
        self.update(&padding);

        let mut out = [0u8; SHA256_DIGEST_LEN];
        for (i, word) in self.state.iter().enumerate() {
            out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        out
    }
}

/// Compress one 64-byte block into the chaining value (FIPS 180-4 §6.2.2).
fn compress(state: &mut [u32; 8], block: &[u8; SHA256_BLOCK_LEN]) {
    let mut w = [0u32; 64];
    for i in 0..16 {
        w[i] = u32::from_be_bytes([
            block[i * 4],
            block[i * 4 + 1],
            block[i * 4 + 2],
            block[i * 4 + 3],
        ]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16]
            .wrapping_add(s0)
            .wrapping_add(w[i - 7])
            .wrapping_add(s1);
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let t1 = h
            .wrapping_add(s1)
            .wrapping_add(ch)
            .wrapping_add(K256[i])
            .wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let t2 = s0.wrapping_add(maj);

        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }

    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

/// One-shot SHA-256.
///
/// # Arguments
///
/// * `data` - Message to hash.
///
/// # Returns
///
/// The 32-byte digest. Matches `crypto.createHash('sha256').update(data).digest()`.
pub fn sha256(data: &[u8]) -> [u8; SHA256_DIGEST_LEN] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize()
}

// ---------------------------------------------------------------------------
// HMAC-SHA-256
// ---------------------------------------------------------------------------

/// HMAC-SHA-256 (RFC 2104).
///
/// Keys longer than the 64-byte block are hashed down to 32 bytes first; keys
/// shorter than the block are zero-padded. Matches
/// `crypto.createHmac('sha256', key).update(msg).digest()`.
///
/// # Arguments
///
/// * `key` - Secret key of any length, including empty.
/// * `msg` - Message to authenticate.
///
/// # Returns
///
/// The 32-byte authentication tag.
pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; SHA256_DIGEST_LEN] {
    let mut k = [0u8; SHA256_BLOCK_LEN];
    if key.len() > SHA256_BLOCK_LEN {
        k[..SHA256_DIGEST_LEN].copy_from_slice(&sha256(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; SHA256_BLOCK_LEN];
    let mut opad = [0x5cu8; SHA256_BLOCK_LEN];
    for i in 0..SHA256_BLOCK_LEN {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }

    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(msg);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_digest);
    outer.finalize()
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

/// Lowercase hex table.
const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

/// Encode bytes as lowercase hex.
///
/// Matches Node's `buf.toString('hex')`.
///
/// # Arguments
///
/// * `bytes` - Bytes to encode.
///
/// # Returns
///
/// A string of exactly `2 * bytes.len()` lowercase hex digits.
pub fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX_CHARS[(b >> 4) as usize] as char);
        out.push(HEX_CHARS[(b & 0x0f) as usize] as char);
    }
    out
}

/// Decode a hex string, accepting either case.
///
/// Stricter than Node's `Buffer.from(s, 'hex')`, which silently truncates at
/// the first invalid character — here anything malformed is rejected outright.
///
/// # Arguments
///
/// * `s` - Hex text, which must have even length and only `[0-9a-fA-F]`.
///
/// # Returns
///
/// `Some(bytes)`, or `None` on odd length or a non-hex character.
pub fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    if b.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(b.len() / 2);
    for pair in b.chunks_exact(2) {
        let hi = hex_val(pair[0])?;
        let lo = hex_val(pair[1])?;
        out.push((hi << 4) | lo);
    }
    Some(out)
}

/// Map one ASCII hex digit to its value, or `None` if it is not a hex digit.
fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Base64 / base64url
// ---------------------------------------------------------------------------

/// Standard base64 alphabet (RFC 4648 §4).
const B64_STD: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// URL-safe base64 alphabet (RFC 4648 §5).
const B64_URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Encode bytes using `alphabet`, appending `=` padding only when `pad` is set.
fn b64_encode_with(bytes: &[u8], alphabet: &[u8; 64], pad: bool) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(alphabet[((n >> 18) & 0x3f) as usize] as char);
        out.push(alphabet[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            out.push(alphabet[((n >> 6) & 0x3f) as usize] as char);
        } else if pad {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(alphabet[(n & 0x3f) as usize] as char);
        } else if pad {
            out.push('=');
        }
    }
    out
}

/// Map one base64 character to its 6-bit value, accepting both alphabets.
///
/// `-`/`_` and `+`/`/` are both recognized, matching Node's tolerant decoder.
fn b64_val(c: u8) -> Option<u32> {
    match c {
        b'A'..=b'Z' => Some((c - b'A') as u32),
        b'a'..=b'z' => Some((c - b'a') as u32 + 26),
        b'0'..=b'9' => Some((c - b'0') as u32 + 52),
        b'+' | b'-' => Some(62),
        b'/' | b'_' => Some(63),
        _ => None,
    }
}

/// Decode base64 text in either alphabet, with or without padding.
///
/// Rejects any character outside the two alphabets (padding aside) and any
/// length that cannot be produced by a real encoder (a trailing group of one
/// character).
fn b64_decode_any(s: &str) -> Option<Vec<u8>> {
    let trimmed = s.trim_end_matches('=');
    let b = trimmed.as_bytes();
    if b.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(b.len() * 3 / 4);
    for group in b.chunks(4) {
        let mut n: u32 = 0;
        for (i, &c) in group.iter().enumerate() {
            n |= b64_val(c)? << (18 - 6 * i);
        }
        // A group of k characters carries k-1 bytes.
        for i in 0..group.len() - 1 {
            out.push(((n >> (16 - 8 * i)) & 0xff) as u8);
        }
    }
    Some(out)
}

/// Encode bytes as unpadded URL-safe base64 (RFC 4648 §5).
///
/// Matches Node's `buf.toString('base64url')`, which omits `=` padding.
///
/// # Arguments
///
/// * `bytes` - Bytes to encode.
///
/// # Returns
///
/// URL-safe base64 text with no padding.
pub fn base64url_encode(bytes: &[u8]) -> String {
    b64_encode_with(bytes, B64_URL, false)
}

/// Decode URL-safe base64, tolerating optional `=` padding.
///
/// Matches `Buffer.from(s, 'base64url')` for well-formed input, but rejects
/// invalid characters instead of silently skipping them.
///
/// # Arguments
///
/// * `s` - Base64url text, padded or unpadded.
///
/// # Returns
///
/// `Some(bytes)`, or `None` if `s` contains a character outside the alphabet
/// or has an impossible length.
pub fn base64url_decode(s: &str) -> Option<Vec<u8>> {
    b64_decode_any(s)
}

/// Encode bytes as standard base64 with `=` padding (RFC 4648 §4).
///
/// Matches Node's `buf.toString('base64')`.
///
/// # Arguments
///
/// * `bytes` - Bytes to encode.
///
/// # Returns
///
/// Padded standard base64 text.
pub fn base64_encode(bytes: &[u8]) -> String {
    b64_encode_with(bytes, B64_STD, true)
}

/// Decode standard base64, tolerating missing padding.
///
/// # Arguments
///
/// * `s` - Base64 text.
///
/// # Returns
///
/// `Some(bytes)`, or `None` on an invalid character or impossible length.
pub fn base64_decode(s: &str) -> Option<Vec<u8>> {
    b64_decode_any(s)
}

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------

/// Compare two byte slices without leaking *where* they differ.
///
/// Mirrors the backend's use of `crypto.timingSafeEqual`, which is always
/// guarded by an explicit `.length !==` check: a length mismatch returns
/// `false` immediately (the lengths themselves are not secret), while equal
/// lengths are compared byte-by-byte with no early exit.
///
/// # Arguments
///
/// * `a` - First slice.
/// * `b` - Second slice.
///
/// # Returns
///
/// `true` only if both slices have the same length and the same contents.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/// Read `n` cryptographically secure random bytes from `/dev/urandom`.
///
/// Fails closed: if the device cannot be opened, or the kernel returns fewer
/// bytes than requested, this returns `Err` rather than degrading to a weak
/// source. These bytes back session tokens and password salts, so a silent
/// fallback would be a silent compromise.
///
/// # Arguments
///
/// * `n` - Number of bytes to read. Zero is allowed and yields an empty vector.
///
/// # Returns
///
/// `Ok(bytes)` of exactly length `n`.
///
/// # Errors
///
/// Returns the underlying [`std::io::Error`] if `/dev/urandom` cannot be opened
/// or read, including [`std::io::ErrorKind::UnexpectedEof`] on a short read.
pub fn random_bytes(n: usize) -> std::io::Result<Vec<u8>> {
    let mut buf = vec![0u8; n];
    if n > 0 {
        let mut f = File::open("/dev/urandom")?;
        f.read_exact(&mut buf)?;
    }
    Ok(buf)
}

/// Generate a random RFC 4122 version 4 UUID.
///
/// Matches `crypto.randomUUID()`: 16 random bytes with the version nibble set
/// to `4` and the variant bits set to `10`, rendered lowercase as
/// `8-4-4-4-12`.
///
/// # Returns
///
/// `Ok(uuid)`, a 36-character string.
///
/// # Errors
///
/// Propagates any [`random_bytes`] failure — the UUID is never produced from a
/// weaker source.
pub fn random_uuid_v4() -> std::io::Result<String> {
    let mut b = random_bytes(16)?;
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    let h = hex_encode(&b);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- SHA-256 (FIPS 180-4 / NIST example vectors) ---

    #[test]
    fn sha256_abc() {
        assert_eq!(
            hex_encode(&sha256(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_empty() {
        assert_eq!(
            hex_encode(&sha256(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sha256_448_bit_message() {
        let msg = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
        assert_eq!(
            hex_encode(&sha256(msg)),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn sha256_896_bit_message() {
        let msg = b"abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
        assert_eq!(
            hex_encode(&sha256(msg)),
            "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1"
        );
    }

    #[test]
    fn sha256_million_a() {
        let mut h = Sha256::new();
        for _ in 0..1000 {
            h.update(&[b'a'; 1000]);
        }
        assert_eq!(
            hex_encode(&h.finalize()),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn streaming_matches_one_shot_across_chunk_sizes() {
        let msg: Vec<u8> = (0u16..1000).map(|i| (i % 251) as u8).collect();
        let once = sha256(&msg);
        for chunk in [1usize, 7, 63, 64, 65, 127, 128] {
            let mut h = Sha256::new();
            for part in msg.chunks(chunk) {
                h.update(part);
            }
            assert_eq!(h.finalize(), once, "chunk size {chunk}");
        }
    }

    // --- HMAC-SHA-256 (RFC 4231) ---

    #[test]
    fn hmac_rfc4231_case_1() {
        let key = [0x0bu8; 20];
        let tag = hmac_sha256(&key, b"Hi There");
        assert_eq!(
            hex_encode(&tag),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn hmac_rfc4231_case_2() {
        let tag = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex_encode(&tag),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn hmac_rfc4231_case_3() {
        let key = [0xaau8; 20];
        let data = [0xddu8; 50];
        assert_eq!(
            hex_encode(&hmac_sha256(&key, &data)),
            "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"
        );
    }

    #[test]
    fn hmac_rfc4231_case_6_long_key() {
        // 131-byte key — longer than the 64-byte block, so it is hashed first.
        let key = [0xaau8; 131];
        let data = b"Test Using Larger Than Block-Size Key - Hash Key First";
        assert_eq!(
            hex_encode(&hmac_sha256(&key, data)),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn hmac_rfc4231_case_7_long_key_and_data() {
        let key = [0xaau8; 131];
        let data = b"This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.";
        assert_eq!(
            hex_encode(&hmac_sha256(&key, data)),
            "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2"
        );
    }

    #[test]
    fn hmac_accepts_empty_key_and_message() {
        assert_eq!(
            hex_encode(&hmac_sha256(b"", b"")),
            "b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad"
        );
    }

    // --- Hex ---

    #[test]
    fn hex_round_trip() {
        let bytes = [0x00u8, 0x0f, 0x10, 0xff, 0xa5];
        assert_eq!(hex_encode(&bytes), "000f10ffa5");
        assert_eq!(hex_decode("000f10ffa5").unwrap(), bytes);
    }

    #[test]
    fn hex_decode_accepts_uppercase() {
        assert_eq!(hex_decode("DEADBEEF").unwrap(), vec![0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn hex_decode_rejects_odd_length() {
        assert_eq!(hex_decode("abc"), None);
    }

    #[test]
    fn hex_decode_rejects_non_hex() {
        assert_eq!(hex_decode("zz"), None);
        assert_eq!(hex_decode("ab cd"), None);
    }

    // --- base64 / base64url ---

    #[test]
    fn base64url_is_unpadded() {
        assert_eq!(base64url_encode(b"f"), "Zg");
        assert_eq!(base64url_encode(b"fo"), "Zm8");
        assert_eq!(base64url_encode(b"foo"), "Zm9v");
        assert_eq!(base64url_encode(b"foob"), "Zm9vYg");
        assert_eq!(base64url_encode(b"fooba"), "Zm9vYmE");
        assert_eq!(base64url_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64url_uses_url_safe_alphabet() {
        // 0xfb 0xff encodes to "+/" in the standard alphabet.
        let bytes = [0xfbu8, 0xff, 0xbf];
        assert_eq!(base64url_encode(&bytes), "-_-_");
        assert_eq!(base64_encode(&bytes), "+/+/");
    }

    #[test]
    fn base64url_round_trips_every_length_class() {
        for len in 0..40usize {
            let bytes: Vec<u8> = (0..len).map(|i| (i * 7 + 3) as u8).collect();
            let enc = base64url_encode(&bytes);
            assert!(!enc.contains('='), "len {len} should be unpadded");
            assert_eq!(base64url_decode(&enc).unwrap(), bytes, "len {len}");
        }
    }

    #[test]
    fn base64_is_padded_and_round_trips() {
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_decode("Zg==").unwrap(), b"f");
        assert_eq!(base64_decode("Zm8=").unwrap(), b"fo");
        assert_eq!(base64_decode("Zm9v").unwrap(), b"foo");
    }

    #[test]
    fn base64url_decode_accepts_padding() {
        assert_eq!(base64url_decode("Zm8=").unwrap(), b"fo");
        assert_eq!(base64url_decode("Zm8").unwrap(), b"fo");
    }

    #[test]
    fn base64_decode_rejects_invalid() {
        assert_eq!(base64_decode("Zm9v!"), None);
        assert_eq!(base64_decode("Z"), None); // impossible trailing group
        assert_eq!(base64_decode("Zm9vZ"), None);
    }

    // --- ct_eq ---

    #[test]
    fn ct_eq_rejects_length_mismatch() {
        assert!(!ct_eq(b"abc", b"abcd"));
        assert!(!ct_eq(b"", b"a"));
    }

    #[test]
    fn ct_eq_accepts_equal() {
        assert!(ct_eq(b"", b""));
        assert!(ct_eq(b"correct horse", b"correct horse"));
    }

    #[test]
    fn ct_eq_rejects_unequal_same_length() {
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(&[0u8; 32], &[1u8; 32]));
    }

    // --- randomness ---

    #[test]
    fn random_bytes_returns_requested_length() {
        assert_eq!(random_bytes(0).unwrap().len(), 0);
        assert_eq!(random_bytes(16).unwrap().len(), 16);
        assert_eq!(random_bytes(1024).unwrap().len(), 1024);
    }

    #[test]
    fn random_bytes_differ_between_calls() {
        assert_ne!(random_bytes(32).unwrap(), random_bytes(32).unwrap());
    }

    #[test]
    fn uuid_v4_has_correct_shape_version_and_variant() {
        let u = random_uuid_v4().unwrap();
        assert_eq!(u.len(), 36);
        let parts: Vec<&str> = u.split('-').collect();
        assert_eq!(
            parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
            vec![8, 4, 4, 4, 12]
        );
        assert!(u
            .chars()
            .all(|c| c == '-' || c.is_ascii_digit() || ('a'..='f').contains(&c)));
        assert_eq!(&u[14..15], "4", "version nibble");
        assert!(
            matches!(&u[19..20], "8" | "9" | "a" | "b"),
            "variant bits: {}",
            &u[19..20]
        );
    }

    #[test]
    fn uuid_v4_is_unique_across_calls() {
        assert_ne!(random_uuid_v4().unwrap(), random_uuid_v4().unwrap());
    }
}

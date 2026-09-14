//! Minimal JSON value, parser, and serializer.
//!
//! Zero-crate replacement for `JSON.parse` / `JSON.stringify`. Number
//! formatting deliberately mirrors V8's `Number.prototype.toString` for the
//! integral case (`100.0` serializes as `100`, not `100.0`) so responses
//! byte-match the Node backend.

use std::collections::BTreeMap;
use std::fmt::Write as _;

/// A parsed JSON value.
///
/// Object keys are held in a `BTreeMap`, so serialization is key-sorted rather
/// than insertion-ordered. Response bodies are therefore compared with sorted
/// keys (`jq -S`) in the parity harness.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(BTreeMap<String, Json>),
}

/// Reason a JSON document could not be parsed.
///
/// Callers only distinguish "malformed" from "valid", matching the Node
/// backend's `SyntaxError` handling, so the variant carries just a position.
#[derive(Debug, Clone, PartialEq)]
pub struct ParseError {
    /// Byte offset where parsing stopped.
    pub at: usize,
    /// Human-readable reason.
    pub msg: &'static str,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid JSON at byte {}: {}", self.at, self.msg)
    }
}

impl std::error::Error for ParseError {}

impl Json {
    /// Borrow the value as an object map, or `None` for other variants.
    pub fn as_obj(&self) -> Option<&BTreeMap<String, Json>> {
        match self {
            Json::Obj(m) => Some(m),
            _ => None,
        }
    }

    /// Borrow the value as an array, or `None` for other variants.
    pub fn as_arr(&self) -> Option<&[Json]> {
        match self {
            Json::Arr(v) => Some(v),
            _ => None,
        }
    }

    /// Borrow the value as a string, or `None` for other variants.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }

    /// Read the value as an `f64`, or `None` for non-numbers.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Json::Num(n) => Some(*n),
            _ => None,
        }
    }

    /// Read the value as an `i64` when it is an integral number in range.
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Json::Num(n) if n.fract() == 0.0 && n.is_finite() => Some(*n as i64),
            _ => None,
        }
    }

    /// Read the value as a bool, or `None` for other variants.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Json::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// True for `Json::Null`.
    pub fn is_null(&self) -> bool {
        matches!(self, Json::Null)
    }

    /// Look up an object member by key. `None` when absent or not an object.
    pub fn get(&self, key: &str) -> Option<&Json> {
        self.as_obj().and_then(|m| m.get(key))
    }

    /// Look up a nested member by dotted path, e.g. `"items.data"` is two hops.
    ///
    /// Array indices are not supported — callers index arrays explicitly.
    pub fn path(&self, dotted: &str) -> Option<&Json> {
        let mut cur = self;
        for seg in dotted.split('.') {
            cur = cur.get(seg)?;
        }
        Some(cur)
    }

    /// Convenience: object member as `&str`.
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Json::as_str)
    }

    /// Convenience: object member as `i64`.
    pub fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(Json::as_i64)
    }
}

/// Build a `Json::Obj` from key/value pairs.
///
/// ```ignore
/// obj([("status", Json::Str("ok".into()))])
/// ```
pub fn obj<const N: usize>(pairs: [(&str, Json); N]) -> Json {
    let mut m = BTreeMap::new();
    for (k, v) in pairs {
        m.insert(k.to_string(), v);
    }
    Json::Obj(m)
}

/// Shorthand for a JSON string value.
pub fn s(v: impl Into<String>) -> Json {
    Json::Str(v.into())
}

/// Shorthand for a JSON number from any integer.
pub fn n(v: impl Into<f64>) -> Json {
    Json::Num(v.into())
}

/// Shorthand for a JSON number from an `i64` (which has no `Into<f64>`).
pub fn i(v: i64) -> Json {
    Json::Num(v as f64)
}

// ==== PARSER ====

/// Parse a JSON document.
///
/// Rejects trailing content after the top-level value, matching `JSON.parse`.
///
/// # Errors
/// Returns [`ParseError`] for any malformed input.
pub fn parse(input: &[u8]) -> Result<Json, ParseError> {
    let mut p = Parser { b: input, i: 0 };
    p.ws();
    let v = p.value()?;
    p.ws();
    if p.i != p.b.len() {
        return Err(p.err("trailing content"));
    }
    Ok(v)
}

/// Recursion limit for nested arrays/objects. Guards against stack exhaustion
/// from a hostile deeply-nested body; `JSON.parse` has an equivalent limit.
const MAX_DEPTH: usize = 128;

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn err(&self, msg: &'static str) -> ParseError {
        ParseError { at: self.i, msg }
    }

    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }

    fn ws(&mut self) {
        while let Some(c) = self.peek() {
            if c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' {
                self.i += 1;
            } else {
                break;
            }
        }
    }

    fn lit(&mut self, word: &[u8]) -> Result<(), ParseError> {
        if self.b.len() - self.i >= word.len() && &self.b[self.i..self.i + word.len()] == word {
            self.i += word.len();
            Ok(())
        } else {
            Err(self.err("bad literal"))
        }
    }

    fn value(&mut self) -> Result<Json, ParseError> {
        self.value_at(0)
    }

    fn value_at(&mut self, depth: usize) -> Result<Json, ParseError> {
        if depth > MAX_DEPTH {
            return Err(self.err("too deep"));
        }
        match self.peek().ok_or_else(|| self.err("unexpected end"))? {
            b'n' => {
                self.lit(b"null")?;
                Ok(Json::Null)
            }
            b't' => {
                self.lit(b"true")?;
                Ok(Json::Bool(true))
            }
            b'f' => {
                self.lit(b"false")?;
                Ok(Json::Bool(false))
            }
            b'"' => Ok(Json::Str(self.string()?)),
            b'[' => self.array(depth),
            b'{' => self.object(depth),
            b'-' | b'0'..=b'9' => self.number(),
            _ => Err(self.err("unexpected token")),
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, ParseError> {
        self.i += 1; // '['
        let mut out = Vec::new();
        self.ws();
        if self.peek() == Some(b']') {
            self.i += 1;
            return Ok(Json::Arr(out));
        }
        loop {
            self.ws();
            out.push(self.value_at(depth + 1)?);
            self.ws();
            match self.peek() {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    return Ok(Json::Arr(out));
                }
                _ => return Err(self.err("expected ',' or ']'")),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, ParseError> {
        self.i += 1; // '{'
        let mut out = BTreeMap::new();
        self.ws();
        if self.peek() == Some(b'}') {
            self.i += 1;
            return Ok(Json::Obj(out));
        }
        loop {
            self.ws();
            if self.peek() != Some(b'"') {
                return Err(self.err("expected object key"));
            }
            let k = self.string()?;
            self.ws();
            if self.peek() != Some(b':') {
                return Err(self.err("expected ':'"));
            }
            self.i += 1;
            self.ws();
            let v = self.value_at(depth + 1)?;
            out.insert(k, v);
            self.ws();
            match self.peek() {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Json::Obj(out));
                }
                _ => return Err(self.err("expected ',' or '}'")),
            }
        }
    }

    fn string(&mut self) -> Result<String, ParseError> {
        self.i += 1; // opening quote
        let mut out = String::new();
        loop {
            let c = self.peek().ok_or_else(|| self.err("unterminated string"))?;
            match c {
                b'"' => {
                    self.i += 1;
                    return Ok(out);
                }
                b'\\' => {
                    self.i += 1;
                    let e = self.peek().ok_or_else(|| self.err("unterminated escape"))?;
                    self.i += 1;
                    match e {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => out.push(self.unicode_escape()?),
                        _ => return Err(self.err("bad escape")),
                    }
                }
                0x00..=0x1f => return Err(self.err("raw control char in string")),
                _ => {
                    // Copy one UTF-8 scalar verbatim.
                    let start = self.i;
                    let len = utf8_len(c);
                    if self.i + len > self.b.len() {
                        return Err(self.err("truncated UTF-8"));
                    }
                    let chunk = &self.b[start..start + len];
                    match std::str::from_utf8(chunk) {
                        Ok(st) => out.push_str(st),
                        Err(_) => return Err(self.err("invalid UTF-8")),
                    }
                    self.i += len;
                }
            }
        }
    }

    /// Decode a `\uXXXX` escape, joining a surrogate pair when present.
    ///
    /// An unpaired surrogate becomes U+FFFD, matching how `JSON.parse` +
    /// UTF-8 re-encoding round-trips a lone surrogate.
    fn unicode_escape(&mut self) -> Result<char, ParseError> {
        let hi = self.hex4()?;
        if (0xD800..0xDC00).contains(&hi) {
            // Expect a low surrogate.
            if self.peek() == Some(b'\\') && self.b.get(self.i + 1) == Some(&b'u') {
                let save = self.i;
                self.i += 2;
                let lo = self.hex4()?;
                if (0xDC00..0xE000).contains(&lo) {
                    let c = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                    return char::from_u32(c).ok_or_else(|| self.err("bad surrogate pair"));
                }
                self.i = save;
            }
            return Ok('\u{FFFD}');
        }
        if (0xDC00..0xE000).contains(&hi) {
            return Ok('\u{FFFD}');
        }
        char::from_u32(hi).ok_or_else(|| self.err("bad code point"))
    }

    fn hex4(&mut self) -> Result<u32, ParseError> {
        if self.i + 4 > self.b.len() {
            return Err(self.err("truncated \\u escape"));
        }
        let mut v: u32 = 0;
        for k in 0..4 {
            let d = self.b[self.i + k];
            let nib = match d {
                b'0'..=b'9' => u32::from(d - b'0'),
                b'a'..=b'f' => u32::from(d - b'a') + 10,
                b'A'..=b'F' => u32::from(d - b'A') + 10,
                _ => return Err(self.err("bad hex digit")),
            };
            v = (v << 4) | nib;
        }
        self.i += 4;
        Ok(v)
    }

    fn number(&mut self) -> Result<Json, ParseError> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        // int part
        match self.peek() {
            Some(b'0') => self.i += 1,
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.i += 1;
                }
            }
            _ => return Err(self.err("bad number")),
        }
        // frac
        if self.peek() == Some(b'.') {
            self.i += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("bad fraction"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.i += 1;
            }
        }
        // exp
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            self.i += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.i += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("bad exponent"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.i += 1;
            }
        }
        let text = std::str::from_utf8(&self.b[start..self.i]).map_err(|_| self.err("bad number"))?;
        text.parse::<f64>()
            .map(Json::Num)
            .map_err(|_| self.err("bad number"))
    }
}

/// Byte length of a UTF-8 sequence from its lead byte.
fn utf8_len(lead: u8) -> usize {
    match lead {
        0x00..=0x7f => 1,
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        _ => 4,
    }
}

// ==== SERIALIZER ====

/// Serialize a value to compact JSON, matching `JSON.stringify` output.
pub fn stringify(v: &Json) -> String {
    let mut out = String::new();
    write_value(&mut out, v);
    out
}

fn write_value(out: &mut String, v: &Json) {
    match v {
        Json::Null => out.push_str("null"),
        Json::Bool(true) => out.push_str("true"),
        Json::Bool(false) => out.push_str("false"),
        Json::Num(x) => out.push_str(&format_number(*x)),
        Json::Str(st) => write_string(out, st),
        Json::Arr(items) => {
            out.push('[');
            for (idx, it) in items.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                write_value(out, it);
            }
            out.push(']');
        }
        Json::Obj(map) => {
            out.push('{');
            for (idx, (k, val)) in map.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write_value(out, val);
            }
            out.push('}');
        }
    }
}

/// Write a JSON string literal, escaping exactly what `JSON.stringify` escapes.
///
/// Control characters below 0x20 become `\u00XX` unless they have a short
/// form; everything else (including non-ASCII) is emitted as raw UTF-8.
fn write_string(out: &mut String, sv: &str) {
    out.push('"');
    for ch in sv.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Format a number the way `JSON.stringify` does.
///
/// Key parity point: JS has one number type, so an integral `f64` prints
/// without a fractional part (`100`, not `100.0`). Non-finite values become
/// `null`, matching `JSON.stringify(NaN)`.
pub fn format_number(x: f64) -> String {
    if !x.is_finite() {
        return "null".to_string();
    }
    if x == 0.0 {
        // Covers -0.0, which JS prints as "0".
        return "0".to_string();
    }
    if x.fract() == 0.0 && x.abs() < 1e21 {
        return format!("{}", x as i128);
    }
    // Shortest round-trip representation; Rust's Display for f64 already
    // produces the shortest string that parses back to the same value.
    let repr = format!("{x}");
    if repr.contains('e') {
        // Rust prints exponents as `1e21`; JS prints `1e+21`.
        return repr.replacen('e', "e+", 1).replace("e+-", "e-");
    }
    repr
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scalars() {
        assert_eq!(parse(b"null").unwrap(), Json::Null);
        assert_eq!(parse(b"true").unwrap(), Json::Bool(true));
        assert_eq!(parse(b"\"hi\"").unwrap(), Json::Str("hi".into()));
        assert_eq!(parse(b"-1.5e2").unwrap(), Json::Num(-150.0));
    }

    #[test]
    fn rejects_trailing_content() {
        assert!(parse(b"{} x").is_err());
    }

    #[test]
    fn rejects_malformed_object() {
        assert!(parse(b"{\"a\":}").is_err());
        assert!(parse(b"{'a':1}").is_err());
    }

    #[test]
    fn integral_floats_print_without_fraction() {
        assert_eq!(format_number(100.0), "100");
        assert_eq!(format_number(-0.0), "0");
        assert_eq!(format_number(1.5), "1.5");
    }

    #[test]
    fn non_finite_prints_null() {
        assert_eq!(format_number(f64::NAN), "null");
        assert_eq!(format_number(f64::INFINITY), "null");
    }

    #[test]
    fn escapes_control_characters() {
        assert_eq!(stringify(&Json::Str("a\u{1}b".into())), "\"a\\u0001b\"");
        assert_eq!(stringify(&Json::Str("a\"b".into())), "\"a\\\"b\"");
    }

    #[test]
    fn round_trips_unicode() {
        let v = parse("\"héllo 🛹\"".as_bytes()).unwrap();
        assert_eq!(v.as_str(), Some("héllo 🛹"));
        assert_eq!(stringify(&v), "\"héllo 🛹\"");
    }

    #[test]
    fn decodes_surrogate_pairs() {
        let v = parse(b"\"\\ud83d\\udef9\"").unwrap();
        assert_eq!(v.as_str(), Some("🛹"));
    }

    #[test]
    fn rejects_excessive_nesting() {
        let deep = format!("{}{}", "[".repeat(200), "]".repeat(200));
        assert!(parse(deep.as_bytes()).is_err());
    }

    #[test]
    fn objects_serialize_key_sorted() {
        let v = parse(b"{\"b\":1,\"a\":2}").unwrap();
        assert_eq!(stringify(&v), "{\"a\":2,\"b\":1}");
    }
}

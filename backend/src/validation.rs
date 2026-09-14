//! Input validation and HTML escaping.
//!
//! Zero-crate port of `backend/lib/validation.ts`. The email rule is the same
//! grammar the Node regex encodes, rewritten as a hand-scanner — no regex
//! engine is needed for a fixed grammar.

/// Escape HTML special characters.
///
/// Replaces `& < > " ' /` with entities, matching `escapeHtml`. The `/`
/// escape is unusual but intentional: it is what the Node backend stores, so
/// names round-trip identically between the two servers.
pub fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            '/' => out.push_str("&#x2F;"),
            _ => out.push(c),
        }
    }
    out
}

/// Number of UTF-16 code units in a string.
///
/// JavaScript's `String.prototype.length` counts UTF-16 code units, so an
/// astral-plane character costs 2. Length limits are ported through this
/// helper rather than `chars().count()` so a name or email at the boundary is
/// accepted or rejected identically by both servers.
pub fn utf16_len(s: &str) -> usize {
    s.chars().map(char::len_utf16).sum()
}

/// Validate an email address.
///
/// Encodes the same grammar as the Node regex:
/// - total length ≤ 254 (RFC 5321)
/// - local part: starts and ends with `[A-Za-z0-9]`, interior may also use
///   `.!#$%&'*+/=?^_`{|}~-`
/// - domain: dot-separated labels of `[A-Za-z0-9]` with interior hyphens,
///   each starting and ending alphanumeric
/// - at least two labels, and the final label (TLD) is 2–63 ASCII letters
pub fn validate_email(email: &str) -> bool {
    if email.is_empty() || utf16_len(email) > 254 {
        return false;
    }
    let Some((local, domain)) = email.rsplit_once('@') else {
        return false;
    };
    if !valid_local_part(local) || domain.is_empty() {
        return false;
    }

    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    let (tld, head) = labels.split_last().expect("checked non-empty above");
    for label in head {
        if !valid_domain_label(label) {
            return false;
        }
    }
    tld.len() >= 2 && tld.len() <= 63 && tld.bytes().all(|b| b.is_ascii_alphabetic())
}

/// Local part rule: alphanumeric edges, an allowed interior character set.
fn valid_local_part(local: &str) -> bool {
    const INTERIOR: &[u8] = b".!#$%&'*+/=?^_`{|}~-";
    let b = local.as_bytes();
    match b.len() {
        0 => false,
        1 => b[0].is_ascii_alphanumeric(),
        _ => {
            b[0].is_ascii_alphanumeric()
                && b[b.len() - 1].is_ascii_alphanumeric()
                && b[1..b.len() - 1]
                    .iter()
                    .all(|c| c.is_ascii_alphanumeric() || INTERIOR.contains(c))
        }
    }
}

/// Domain label rule: alphanumeric edges, interior hyphens allowed.
fn valid_domain_label(label: &str) -> bool {
    let b = label.as_bytes();
    match b.len() {
        0 => false,
        1 => b[0].is_ascii_alphanumeric(),
        _ => {
            b[0].is_ascii_alphanumeric()
                && b[b.len() - 1].is_ascii_alphanumeric()
                && b[1..b.len() - 1].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'-')
        }
    }
}

/// Validate password length: 6–72 UTF-16 code units.
///
/// The 72 ceiling is bcrypt's byte limit, kept after the scrypt migration so
/// existing accounts keep working unchanged.
pub fn validate_password(password: &str) -> bool {
    let len = utf16_len(password);
    !password.is_empty() && len >= 6 && len <= 72
}

/// Validate a display name: non-empty after trimming, ≤ 100 code units.
pub fn validate_name(name: &str) -> bool {
    !name.is_empty() && !name.trim().is_empty() && utf16_len(name) <= 100
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_every_mapped_character() {
        assert_eq!(escape_html("<a href=\"x\">&'/"), "&lt;a href=&quot;x&quot;&gt;&amp;&#x27;&#x2F;");
    }

    #[test]
    fn accepts_ordinary_emails() {
        for e in ["a@b.co", "steve@bixbyapps.com", "first.last+tag@sub.example.org", "x1@y-z.io"] {
            assert!(validate_email(e), "should accept {e}");
        }
    }

    #[test]
    fn rejects_malformed_emails() {
        for e in [
            "", "a@b", "@b.co", "a@.co", "a.@b.co", ".a@b.co", "a@b..co", "a@-b.co", "a@b-.co",
            "a@b.c", "a b@c.co", "a@b.co1", "a@@b.co",
        ] {
            assert!(!validate_email(e), "should reject {e:?}");
        }
    }

    #[test]
    fn enforces_rfc_5321_length() {
        let long = format!("{}@example.com", "a".repeat(250));
        assert!(!validate_email(&long));
    }

    #[test]
    fn password_bounds() {
        assert!(!validate_password("12345"));
        assert!(validate_password("123456"));
        assert!(validate_password(&"a".repeat(72)));
        assert!(!validate_password(&"a".repeat(73)));
    }

    #[test]
    fn name_bounds() {
        assert!(!validate_name(""));
        assert!(!validate_name("   "));
        assert!(validate_name("Steve"));
        assert!(validate_name(&"a".repeat(100)));
        assert!(!validate_name(&"a".repeat(101)));
    }

    #[test]
    fn counts_utf16_units_like_js() {
        // An astral character is 2 UTF-16 units, so 50 of them hit the limit.
        assert_eq!(utf16_len("🛹"), 2);
        assert!(validate_name(&"🛹".repeat(50)));
        assert!(!validate_name(&"🛹".repeat(51)));
    }
}

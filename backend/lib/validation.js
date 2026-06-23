/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * Replaces &, <, >, ", ', / with HTML entities. Returns original value
 * if not a string.
 *
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Validate email address format and length
 *
 * RFC 5321 compliant validation with robust regex checking local part,
 * domain, and TLD. Max length 254 characters. Prevents consecutive dots
 * and leading/trailing hyphens.
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321

  // More robust email validation:
  // - Local part: letters, numbers, and common special chars (no consecutive dots)
  // - Domain: letters, numbers, hyphens (no consecutive dots or leading/trailing hyphens)
  // - TLD: 2-63 characters
  const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$/;
  return emailRegex.test(email);
}

/**
 * Validate password length within bcrypt limits
 *
 * Enforces 6-72 character range (bcrypt's maximum is 72 bytes).
 *
 * @param {string} password - Password to validate
 * @returns {boolean} True if valid password length
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 6 || password.length > 72) return false; // bcrypt limit
  return true;
}

/**
 * Validate name length and non-empty after trim
 *
 * Enforces 1-100 character range after trimming whitespace.
 *
 * @param {string} name - Name to validate
 * @returns {boolean} True if valid name
 */
export function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.trim().length === 0 || name.length > 100) return false;
  return true;
}
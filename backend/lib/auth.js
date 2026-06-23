import crypto from 'crypto';
import { promisify } from 'node:util';
import { compare as legacyBcryptCompare } from '../vendor/legacy-bcrypt.js';

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALTLEN = 16;

/** Default JWT token lifetime in days */
export const TOKEN_EXPIRATION_DAYS = 30;

/**
 * Hash password using node:crypto scrypt
 *
 * Format: `scrypt$<base64url salt>$<base64url key>`. New hashes always use
 * scrypt; legacy bcrypt hashes (prefix `$2`) are verified via the dispatch
 * in verifyPassword but never created.
 *
 * @async
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Scrypt hash string
 */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT_SALTLEN);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/**
 * Verify password against stored hash (scrypt or legacy bcrypt)
 *
 * Dispatches on stored hash prefix: `scrypt$` → native scrypt verify;
 * `$2` → bcryptjs (legacy users predating the scrypt migration).
 *
 * @async
 * @param {string} password - Plain text password to verify
 * @param {string} stored - Stored hash (scrypt or bcrypt format)
 * @returns {Promise<boolean>} True if password matches stored hash
 */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt$')) {
    const [, saltB64, keyB64] = stored.split('$');
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(keyB64, 'base64url');
    const candidate = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  }
  if (stored.startsWith('$2')) {
    return await legacyBcryptCompare(password, stored);
  }
  return false;
}

/**
 * Whether a stored hash should be migrated to scrypt on next successful login
 *
 * @param {string} stored - Stored hash
 * @returns {boolean} True if the hash is in legacy bcrypt format
 */
export function needsRehash(stored) {
  return typeof stored === 'string' && !stored.startsWith('scrypt$');
}

/**
 * Calculate JWT expiration timestamp
 *
 * @param {number} [expirationDays=30] - Token lifetime in days
 * @returns {number} Unix timestamp expirationDays in the future
 */
export function tokenExpireTimestamp(expirationDays = TOKEN_EXPIRATION_DAYS) {
  return Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60;
}

/**
 * Sign an HS256 JWT using node:crypto HMAC-SHA256
 *
 * Produces a token byte-compatible with jsonwebtoken: header
 * {"alg":"HS256","typ":"JWT"} followed by the payload, joined and signed
 * over `base64url(header).base64url(payload)`.
 *
 * @param {Object} payload - Payload to encode (must include exp)
 * @param {string} secret - HMAC signing secret
 * @returns {string} Compact JWT string
 */
export function jwtSign(payload, secret) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * Verify an HS256 JWT and return its payload
 *
 * Compatible with tokens issued by jsonwebtoken (same algorithm, same secret).
 * Throws an Error with name === 'TokenExpiredError' for expired tokens, or a
 * generic Error for malformed/invalid signatures.
 *
 * @param {string} token - JWT string to verify
 * @param {string} secret - HMAC verification secret
 * @returns {Object} Decoded payload
 * @throws {Error} If token is malformed, signature invalid, or expired
 */
export function jwtVerify(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [head, body, sig] = parts;
  if (!head || !body || !sig) throw new Error('Invalid token');
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    const err = new Error('Token expired');
    err.name = 'TokenExpiredError';
    throw err;
  }
  return payload;
}

/**
 * Generate RFC 4122 compliant UUID v4
 *
 * Uses crypto.randomUUID() for cryptographically secure unique identifiers.
 *
 * @returns {string} UUID string
 */
export function generateUUID() {
  return crypto.randomUUID();
}
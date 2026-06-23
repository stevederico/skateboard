import crypto from 'crypto';
import { promisify } from 'node:util';
import { compare as legacyBcryptCompare } from '../vendor/legacy-bcrypt.js';
import type { JwtPayload } from '../types.ts';

const scryptAsync = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
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
 * @param password - Plain text password to hash
 * @returns Scrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
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
 * @param password - Plain text password to verify
 * @param stored - Stored hash (scrypt or bcrypt format)
 * @returns True if password matches stored hash
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
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
 * @param stored - Stored hash
 * @returns True if the hash is in legacy bcrypt format
 */
export function needsRehash(stored: string): boolean {
  return typeof stored === 'string' && !stored.startsWith('scrypt$');
}

/**
 * Calculate JWT expiration timestamp
 *
 * @param expirationDays - Token lifetime in days
 * @returns Unix timestamp expirationDays in the future
 */
export function tokenExpireTimestamp(expirationDays: number = TOKEN_EXPIRATION_DAYS): number {
  return Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60;
}

/**
 * Sign an HS256 JWT using node:crypto HMAC-SHA256
 *
 * Produces a token byte-compatible with jsonwebtoken: header
 * {"alg":"HS256","typ":"JWT"} followed by the payload, joined and signed
 * over `base64url(header).base64url(payload)`.
 *
 * @param payload - Payload to encode
 * @param secret - HMAC signing secret
 * @returns Compact JWT string
 */
export function jwtSign(payload: JwtPayload, secret: string): string {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * Validate a decoded JWT body matches the expected payload shape.
 *
 * Requires `userID` (string) — the field authMiddleware trusts as the
 * authenticated identity. `exp` is optional but, when present, must be a
 * number. Narrows unknown JSON before it is trusted as a JwtPayload.
 *
 * @param value - Decoded JSON value from the token body
 * @returns True if the value is a valid JwtPayload
 */
export function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;
  if (!('userID' in value) || typeof value.userID !== 'string') return false;
  if ('exp' in value && typeof value.exp !== 'number') return false;
  return true;
}

/**
 * Verify an HS256 JWT and return its payload
 *
 * Compatible with tokens issued by jsonwebtoken (same algorithm, same secret).
 * Throws an Error with name === 'TokenExpiredError' for expired tokens, or a
 * generic Error for malformed/invalid signatures or payloads.
 *
 * @param token - JWT string to verify
 * @param secret - HMAC verification secret
 * @returns Decoded payload
 * @throws If token is malformed, signature invalid, payload invalid, or expired
 */
export function jwtVerify(token: string, secret: string): JwtPayload {
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
  const decoded: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!isJwtPayload(decoded)) {
    throw new Error('Invalid token');
  }
  const payload = decoded;
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
 * @returns UUID string
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

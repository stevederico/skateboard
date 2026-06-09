/**
 * Type declarations for the vendored bcryptjs subset (legacy-bcrypt.js).
 *
 * Covers only what server.ts and server.test.ts import: `compare`, used to
 * verify legacy `$2*` bcrypt hashes during the lazy scrypt migration. The
 * vendored implementation stays JavaScript on purpose — do not convert it.
 */

/**
 * Asynchronously tests a password against a bcrypt hash.
 *
 * @param password Password to compare
 * @param hashValue Hash to test against
 * @returns Promise resolving with true if the password matches the hash
 */
export function compare(password: string, hashValue: string): Promise<boolean>;

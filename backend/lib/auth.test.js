import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { promisify } from 'node:util';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  tokenExpireTimestamp,
  jwtSign,
  jwtVerify,
  generateUUID,
  TOKEN_EXPIRATION_DAYS,
} from './auth.ts';

const scryptAsync = promisify(crypto.scrypt);
const LEGACY_BCRYPT_HASH = '$2b$10$gix5z78/st4CdQYVM8C4g.ygzzWZQ39pnLKhxVtMWK1HUeASfzIyG';

describe('auth.js', () => {
  describe('hashPassword and verifyPassword', () => {
    it('hashes and verifies with scrypt', async () => {
      const hash = await hashPassword('password123');
      assert.ok(hash.startsWith('scrypt$'));
      assert.equal(await verifyPassword('password123', hash), true);
      assert.equal(await verifyPassword('wrong', hash), false);
    });

    it('verifies legacy bcrypt hashes', async () => {
      assert.equal(await verifyPassword('validpassword123', LEGACY_BCRYPT_HASH), true);
      assert.equal(await verifyPassword('wrong', LEGACY_BCRYPT_HASH), false);
    });

    it('returns false for non-string stored hash', async () => {
      assert.equal(await verifyPassword('pw', null), false);
      assert.equal(await verifyPassword('pw', 123), false);
    });

    it('returns false for unknown hash format', async () => {
      assert.equal(await verifyPassword('pw', 'unknown$hash'), false);
    });
  });

  describe('needsRehash', () => {
    it('returns true for bcrypt and false for scrypt', () => {
      assert.equal(needsRehash(LEGACY_BCRYPT_HASH), true);
      assert.equal(needsRehash('scrypt$abc$def'), false);
      assert.equal(needsRehash(null), false);
    });
  });

  describe('tokenExpireTimestamp', () => {
    it('defaults to TOKEN_EXPIRATION_DAYS', () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = tokenExpireTimestamp();
      const expected = now + TOKEN_EXPIRATION_DAYS * 24 * 60 * 60;
      assert.ok(Math.abs(exp - expected) <= 2);
    });

    it('accepts custom expiration days', () => {
      const exp = tokenExpireTimestamp(7);
      const now = Math.floor(Date.now() / 1000);
      assert.ok(Math.abs(exp - (now + 7 * 24 * 60 * 60)) <= 2);
    });
  });

  describe('jwtSign and jwtVerify', () => {
    const secret = 'test-secret';

    it('signs and verifies a valid token', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = jwtSign({ userID: 'u1', exp }, secret);
      const payload = jwtVerify(token, secret);
      assert.equal(payload.userID, 'u1');
      assert.equal(payload.exp, exp);
    });

    it('rejects malformed tokens', () => {
      assert.throws(() => jwtVerify('not-a-jwt', secret), /Invalid token/);
      assert.throws(() => jwtVerify('a.b', secret), /Invalid token/);
      assert.throws(() => jwtVerify('.b.c', secret), /Invalid token/);
      assert.throws(() => jwtVerify('a..c', secret), /Invalid token/);
    });

    it('rejects invalid signatures including length mismatch', () => {
      const token = jwtSign({ userID: 'u1', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
      const parts = token.split('.');
      const shortSig = parts[2].slice(0, -2);
      assert.throws(() => jwtVerify(`${parts[0]}.${parts[1]}.${shortSig}`, secret), /Invalid signature/);
      assert.throws(() => jwtVerify(`${parts[0]}.${parts[1]}.tampered`, secret), /Invalid signature/);
    });

    it('throws TokenExpiredError for expired tokens', () => {
      const token = jwtSign({ userID: 'u1', exp: Math.floor(Date.now() / 1000) - 10 }, secret);
      assert.throws(() => jwtVerify(token, secret), (err) => {
        assert.equal(err.name, 'TokenExpiredError');
        return true;
      });
    });

    it('accepts tokens without exp claim', () => {
      const token = jwtSign({ userID: 'u1' }, secret);
      const payload = jwtVerify(token, secret);
      assert.equal(payload.userID, 'u1');
    });
  });

  describe('generateUUID', () => {
    it('returns RFC 4122 UUID v4 strings', () => {
      const id = generateUUID();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });
});
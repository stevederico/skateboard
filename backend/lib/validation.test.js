import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  validateEmail,
  validatePassword,
  validateName,
} from './validation.ts';

describe('validation.js', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      assert.equal(escapeHtml('<script>"\'/&</script>'), '&lt;script&gt;&quot;&#x27;&#x2F;&amp;&lt;&#x2F;script&gt;');
    });

    it('returns non-string values unchanged', () => {
      assert.equal(escapeHtml(42), 42);
      assert.equal(escapeHtml(null), null);
    });
  });

  describe('validateEmail', () => {
    it('accepts valid emails', () => {
      assert.equal(validateEmail('user@example.com'), true);
      assert.equal(validateEmail('a.b+c@sub.example.co'), true);
    });

    it('rejects invalid or oversized emails', () => {
      assert.equal(validateEmail(''), false);
      assert.equal(validateEmail(null), false);
      assert.equal(validateEmail(123), false);
      assert.equal(validateEmail('not-an-email'), false);
      assert.equal(validateEmail('bad@'), false);
      assert.equal(validateEmail(`${'a'.repeat(250)}@example.com`), false);
    });
  });

  describe('validatePassword', () => {
    it('accepts passwords within bcrypt limits', () => {
      assert.equal(validatePassword('123456'), true);
      assert.equal(validatePassword('a'.repeat(72)), true);
    });

    it('rejects invalid passwords', () => {
      assert.equal(validatePassword(''), false);
      assert.equal(validatePassword(null), false);
      assert.equal(validatePassword(123), false);
      assert.equal(validatePassword('12345'), false);
      assert.equal(validatePassword('a'.repeat(73)), false);
    });
  });

  describe('validateName', () => {
    it('accepts non-empty trimmed names up to 100 chars', () => {
      assert.equal(validateName('Ada'), true);
      assert.equal(validateName('  Grace  '), true);
      assert.equal(validateName('a'.repeat(100)), true);
    });

    it('rejects invalid names', () => {
      assert.equal(validateName(''), false);
      assert.equal(validateName(null), false);
      assert.equal(validateName(42), false);
      assert.equal(validateName('   '), false);
      assert.equal(validateName('a'.repeat(101)), false);
    });
  });
});
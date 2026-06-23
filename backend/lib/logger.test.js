import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from './logger.ts';

describe('logger.js', () => {
  const originals = {
    error: console.error,
    warn: console.warn,
    log: console.log,
  };

  afterEach(() => {
    console.error = originals.error;
    console.warn = originals.warn;
    console.log = originals.log;
  });

  function captureConsole() {
    const output = { error: [], warn: [], log: [] };
    console.error = (...args) => output.error.push(args.join(' '));
    console.warn = (...args) => output.warn.push(args.join(' '));
    console.log = (...args) => output.log.push(args.join(' '));
    return output;
  }

  it('pretty-prints JSON in development for all levels', () => {
    const output = captureConsole();
    const logger = createLogger(false);

    logger.error('err', { code: 1 });
    logger.warn('warn', { code: 2 });
    logger.info('info', { code: 3 });
    logger.debug('debug', { code: 4 });

    assert.ok(output.error[0].includes('\n'));
    assert.ok(output.warn[0].includes('\n'));
    assert.ok(output.log[0].includes('\n'));
    assert.ok(output.log[1].includes('\n'));
    assert.match(output.error[0], /"level": "ERROR"/);
    assert.match(output.log[1], /"level": "DEBUG"/);
  });

  it('emits compact JSON in production and suppresses debug', () => {
    const output = captureConsole();
    const logger = createLogger(true);

    logger.error('err');
    logger.warn('warn');
    logger.info('info');
    logger.debug('debug');

    assert.ok(!output.error[0].includes('\n  '));
    assert.ok(!output.warn[0].includes('\n  '));
    assert.ok(!output.log[0].includes('\n  '));
    assert.equal(output.log.length, 1);
  });

  it('supports isProd as a function predicate', () => {
    const output = captureConsole();
    let prod = false;
    const logger = createLogger(() => prod);

    logger.debug('visible');
    assert.equal(output.log.length, 1);

    prod = true;
    logger.debug('hidden');
    assert.equal(output.log.length, 1);
    logger.info('compact');
    assert.ok(!output.log[1].includes('\n  '));
  });
});
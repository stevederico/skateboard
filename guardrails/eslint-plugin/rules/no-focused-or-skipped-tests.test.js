import rule from './no-focused-or-skipped-tests.js';
import { runRuleTests } from '../lib/ruleTester.js';

const filename = 'scripts/example.test.js';

runRuleTests('no-focused-or-skipped-tests', rule, {
  valid: [
    { code: "describe('version consistency', { skip: !IS_TEMPLATE }, () => {});", filename },
    { code: "it('works', (t) => { t.skip(); });", filename },
    { code: "test('works', { timeout: 100 }, () => {});", filename },
    { code: 'list.skip(1);', filename },
  ],
  invalid: [
    { code: "it.only('a', () => {});", filename, errors: [{ messageId: 'modifier', data: { name: 'it', modifier: 'only' } }] },
    { code: "describe.skip('a', () => {});", filename, errors: [{ messageId: 'modifier', data: { name: 'describe', modifier: 'skip' } }] },
    { code: "test('a', { only: true }, () => {});", filename, errors: [{ messageId: 'option', data: { name: 'test', modifier: 'only' } }] },
    { code: "suite('a', { skip: true }, () => {});", filename, errors: [{ messageId: 'option' }] },
  ],
});

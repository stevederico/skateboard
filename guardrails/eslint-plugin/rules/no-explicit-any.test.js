import rule from './no-explicit-any.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-explicit-any', rule, {
  valid: [
    'const x: unknown = JSON.parse("1");',
    'function f(value: string): number { return value.length; }',
    'const list: Array<{ id: string }> = [];',
  ],
  invalid: [
    { code: 'let x: any;', errors: [{ messageId: 'any' }] },
    { code: 'function f(a: any[]): void {}', errors: [{ messageId: 'any' }] },
    { code: 'const r = apiRequest<any>("/deals");', errors: [{ messageId: 'any' }] },
    { code: 'type M = Record<string, any>;', errors: [{ messageId: 'any' }] },
  ],
});

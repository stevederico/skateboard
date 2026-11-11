import rule from './no-loose-types.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-loose-types', rule, {
  valid: [
    'type Handler = (event: MouseEvent) => void;',
    'type Bag = Record<string, unknown>;',
    'interface Deal { id: string; amount: number }',
    'type Empty = Record<string, never>;',
  ],
  invalid: [
    { code: 'let cb: Function;', errors: [{ messageId: 'reference' }] },
    { code: 'function f(o: Object) {}', errors: [{ messageId: 'reference' }] },
    { code: 'let s: String;', errors: [{ messageId: 'reference' }] },
    { code: 'function f(o: object) {}', errors: [{ messageId: 'object' }] },
    { code: 'type Props = {};', errors: [{ messageId: 'emptyLiteral' }] },
    { code: 'const x: Array<{}> = [];', errors: [{ messageId: 'emptyLiteral' }] },
  ],
});

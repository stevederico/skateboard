import rule from './no-type-assertion.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-type-assertion', rule, {
  valid: [
    'const sizes = [16, 18, 24] as const;',
    'const route = { path: "home" } satisfies { path: string };',
    'const parsed: unknown = JSON.parse(text);',
    'const deals = await apiRequest<Deal[]>("/deals");',
  ],
  invalid: [
    { code: 'const el = document.getElementById("root") as HTMLDivElement;', errors: [{ messageId: 'cast' }] },
    { code: 'const n = <number>value;', filename: 'src/x.ts', errors: [{ messageId: 'cast' }] },
    { code: 'const u = value as unknown as User;', errors: [{ messageId: 'doubleCast' }] },
    { code: 'const u = JSON.parse(text) as User;', errors: [{ messageId: 'boundary' }] },
    { code: 'async function f(res) { return (await res.json()) as User; }', errors: [{ messageId: 'boundary' }] },
    { code: 'const d = (await apiRequest("/deals")) as Deal[];', errors: [{ messageId: 'boundary' }] },
  ],
});

import rule from './require-jsdoc-on-exports.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('require-jsdoc-on-exports', rule, {
  valid: [
    `/**
 * Dashboard view with metric cards.
 * @returns Dashboard view
 */
export default function HomeView() { return null; }`,
    `/** Adds two numbers. */
export function add(a: number, b: number): number { return a + b; }`,
    `/** Format cents. */
export const formatCents = (cents: number) => String(cents / 100);`,
    'export const appName = "Skateboard";',
    'export interface Props { title: string }',
    'export type Id = string;',
    `/** Merge. */
function threeWayMerge() {}
const ALLOWLIST = [];
export { ALLOWLIST, threeWayMerge };`,
    `/** View. */
function View() { return null; }
export default View;`,
    { code: 'export function helper() {}', filename: 'scripts/example.test.js' },
    "export { x } from './x';",
  ],
  invalid: [
    {
      code: 'export function SectionCards() { return null; }',
      errors: [{ messageId: 'missing', data: { kind: 'function', name: 'SectionCards' } }],
    },
    {
      code: '// not jsdoc\nexport const useThing = () => 1;',
      errors: [{ messageId: 'missing', data: { kind: 'function', name: 'useThing' } }],
    },
    { code: 'export default function () { return null; }', errors: [{ messageId: 'missing', data: { kind: 'function', name: 'default' } }] },
    { code: 'export class Store {}', errors: [{ messageId: 'missing', data: { kind: 'class', name: 'Store' } }] },
    {
      code: 'function ensureSymlink() {}\nexport { ensureSymlink };',
      filename: 'scripts/update-skateboard.js',
      errors: [{ messageId: 'missing', data: { kind: 'function', name: 'ensureSymlink' } }],
    },
    { code: 'const View = () => null;\nexport default View;', errors: [{ messageId: 'missing', data: { kind: 'function', name: 'View' } }] },
  ],
});

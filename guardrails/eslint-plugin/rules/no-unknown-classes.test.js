import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import rule, { cssClassNames } from './no-unknown-classes.js';
import { runRuleTests } from '../lib/ruleTester.js';

const CLASSES = [
  'flex', 'grid', 'gap-2', 'p-4', 'px-2', 'text-sm', 'font-medium', 'hidden', 'opacity-50',
  'bg-accent', 'bg-muted', 'bg-primary', 'text-primary-foreground', 'h-8', 'h-10', 'rounded-md', 'border',
  'md:hover:bg-accent', 'w-[200px]', '[&>svg]:size-4', 'w-[calc(100%-2rem)]', 'md:grid-cols-2', 'dark', 'group',
];

const APP_CSS = String.raw`
/* .commented-out { color: red; } */
@media (min-width: 40.5rem) { .brand-card { padding: 1rem; } }
.hover\:glow:hover { box-shadow: 0 0 4px var(--color-app); }
.tile > .tile-title, a[href$=".pdf"] { background: url("bg.v2.png"); margin: 0.5rem; }
@keyframes pulse { 12.5% { opacity: 1; } }
`;

const opts = [{ classes: CLASSES, cssFiles: [{ path: 'src/assets/styles.css', text: APP_CSS }] }];
const noCss = [{ classes: CLASSES, cssFiles: [] }];
const missingList = [{ uiCssPath: 'does-not-exist/styles.css', cssFiles: [] }];

const unknown = (token, where = 'className', hint = '') => ({ messageId: 'unknown', data: { token, where, hint } });

describe('cssClassNames', () => {
  it('reads class selectors, unescapes them, and skips comments, at-rule preludes, values and strings', () => {
    assert.deepEqual([...cssClassNames(APP_CSS)].sort(), ['brand-card', 'hover:glow', 'tile', 'tile-title']);
  });

  it('unescapes hex escapes', () => {
    assert.deepEqual([...cssClassNames(String.raw`.\32 xl\:p-4 { padding: 1rem }`)], ['2xl:p-4']);
  });
});

describe('real file loading (uiCssPath + cssDir)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'no-unknown-classes-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'ui.css'), '@layer utilities { .flex { display: flex; } .p-4 { padding: calc(var(--spacing) * 4); } .md\\:grid:where(*) { display: grid; } }');
  writeFileSync(path.join(dir, 'old-ui.css'), '@import "tailwindcss";\n.flex { display: flex; }');
  mkdirSync(path.join(dir, 'src', 'assets'), { recursive: true });
  mkdirSync(path.join(dir, 'src', 'node_modules'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'assets', 'styles.css'), '.own-class { color: inherit; }');
  writeFileSync(path.join(dir, 'src', 'node_modules', 'x.css'), '.vendored { color: inherit; }');
  const fileOpts = [{ uiCssPath: path.join(dir, 'ui.css'), cssDir: path.join(dir, 'src') }];
  const oldOpts = [{ uiCssPath: path.join(dir, 'old-ui.css'), cssDir: path.join(dir, 'src') }];

  runRuleTests('no-unknown-classes (files)', rule, {
    valid: [{ code: '<div className="flex p-4 md:grid own-class" />', options: fileOpts }],
    invalid: [
      { code: '<div className="flex vendored" />', options: fileOpts, errors: [unknown('vendored')] },
      { code: '<div className="flex" />', options: oldOpts, errors: [{ messageId: 'listMissing' }] },
    ],
  });
});

runRuleTests('no-unknown-classes', rule, {
  valid: [
    { code: '<div className="group/card peer peer/field-label group" />', options: noCss },
    { code: '<div className="flex data-open:animate-in" />', options: [{ ...noCss[0], ignore: ['data-open:animate-in'] }] },
    { code: '<div className="flex gap-2 p-4" />', options: opts },
    { code: '<div className="md:hover:bg-accent w-[200px] [&>svg]:size-4 w-[calc(100%-2rem)] md:grid-cols-2" />', options: opts },
    { code: '<div className="  dark   group " />', options: opts },
    { code: '<div className={`flex bg-${tone}-500 p-${size} ${extra}`} />', options: opts },
    { code: '<div className={`flex ${active ? "bg-accent" : "bg-muted"} p-4`} />', options: opts },
    { code: '<div className={`flx-${x}`} />', options: opts },
    {
      code: 'const c = cn("flex", active ? "bg-accent" : "bg-muted", disabled && "opacity-50", { "font-medium": selected, hidden: collapsed }, ["px-2", ["text-sm"]]);',
      options: opts,
    },
    { code: '<div className={cn(buttonVariants({ variant }), className, "p-4")} />', options: opts },
    { code: 'const c = clsx(fallback || "flex", value ?? "grid");', options: opts },
    { code: 'const c = cn("bg-" + tone, "flex " + extra);', options: opts },
    {
      code: `const button = cva("flex rounded-md", {
        variants: { variant: { default: "bg-primary text-primary-foreground", ghost: ["bg-muted"] }, size: { sm: "h-8", lg: "h-10" } },
        compoundVariants: [{ variant: "ghost", size: "lg", class: "border" }, { variant: "default", className: "p-4" }],
        defaultVariants: { variant: "default", size: "sm" },
      });`,
      options: opts,
    },
    { code: '<div className="brand-card hover:glow tile tile-title" />', options: opts },
    { code: 'const label = "not-a-class"; const x = format("flx");', options: opts },
    { code: '<input type="text" title="whatever words" />', options: opts },
    { code: '<div className={styles} />', options: opts },
    { code: 'const x = 1;', options: missingList },
    { code: '<div className={styles} />', options: missingList },
  ],
  invalid: [
    { code: '<div className="flex flx p-4" />', options: opts, errors: [unknown('flx')] },
    { code: '<div class="flx" />', options: opts, errors: [unknown('flx', 'class')] },
    { code: '<div className="w-[201px]" />', options: opts, errors: [unknown('w-[201px]')] },
    {
      code: '<div className="lg:hover:bg-accent" />',
      options: opts,
      errors: [unknown('lg:hover:bg-accent', 'className', ' Near miss: "bg-accent" is listed, but not with the "lg:hover:" variant.')],
    },
    {
      code: '<div className="!flex" />',
      options: opts,
      errors: [unknown('!flex', 'className', ' Near miss: "flex" (without the "!" important modifier) is listed.')],
    },
    { code: '<div className={`flx ${x} grd`} />', options: opts, errors: [unknown('flx'), unknown('grd')] },
    { code: '<div className={`flex ${on ? "bg-acent" : ""}`} />', options: opts, errors: [unknown('bg-acent')] },
    {
      code: 'const c = cn(a ? "bg-acent" : "bg-muted", b && "opacty-50", { "font-bold": c, shown: d });',
      options: opts,
      errors: [unknown('bg-acent', 'cn()'), unknown('opacty-50', 'cn()'), unknown('font-bold', 'cn()'), unknown('shown', 'cn()')],
    },
    { code: '<div className={cn("flex", "flx")} />', options: opts, errors: [unknown('flx', 'cn()')] },
    { code: 'const c = cn("flx " + extra);', options: opts, errors: [unknown('flx', 'cn()')] },
    {
      code: `const button = cva(["flex", "rounded-xl"], {
        variants: { size: { sm: "h-7", lg: "h-10" } },
        compoundVariants: [{ size: "lg", class: "shadow-md" }],
        defaultVariants: { size: "sm" },
      });`,
      options: opts,
      errors: [unknown('rounded-xl', 'cva()'), unknown('h-7', 'cva()'), unknown('shadow-md', 'cva()')],
    },
    { code: '<div className="hover:glow" />', options: noCss, errors: [unknown('hover:glow')] },
    { code: '<div className="commented-out" />', options: opts, errors: [unknown('commented-out')] },
    {
      code: 'const a = <><div className="flex" /><span className={cn("p-4", "gap-2")} /></>;',
      options: missingList,
      errors: [{ messageId: 'listMissing', data: { listPath: 'does-not-exist/styles.css' } }],
    },
  ],
});

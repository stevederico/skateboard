/**
 * dependency-cruiser config: whole-graph boundary checks (`npm run depcruise`).
 *
 * The layer rules are GENERATED from guardrails/eslint-plugin/layers.js, the same table
 * the `skateboard/layer-boundaries` lint rule reads, so there is one source of truth:
 * edit LAYERS / ALLOWED_EDGES there and both checkers follow. ESLint sees one file at a
 * time; this pass resolves every import on disk, so it also proves what a single file
 * cannot: cycles, orphans, unresolvable paths, undeclared and dev-only packages.
 *
 * Every `comment` states what was found, `Why:` it is forbidden and the `Fix:`.
 * dependency-cruiser lives in the nested guardrails/ package (see AGENTS.md > Guardrails).
 */
import { ALLOWED_EDGES, BROWSER_LAYERS, ENTRY_MODULE, LAYERS, TARGET_GUIDANCE } from './guardrails/eslint-plugin/layers.js';

/** Test files by the repo convention (`*.test.js`) plus the Playwright flows (`*.e2e.js`). */
const TEST_FILES = '\\.(?:test|e2e)\\.[cm]?[jt]sx?$';

/**
 * Path condition selecting exactly one layer. layers.js is first-match-wins (`ui` sits
 * above `app`), so every earlier layer's pattern is subtracted.
 *
 * @param {number} index - Index of the layer in LAYERS
 * @returns {{ path: string, pathNot?: string[] }} dependency-cruiser path condition
 */
function layerCondition(index) {
  const earlier = LAYERS.slice(0, index).map((layer) => layer.pattern.source);
  return { path: LAYERS[index].pattern.source, ...(earlier.length > 0 ? { pathNot: earlier } : {}) };
}

/** Path conditions for the layers bundled for the browser (ui + app). */
const browserPaths = LAYERS.filter((layer) => BROWSER_LAYERS.has(layer.name)).map((layer) => layer.pattern.source);

/** One forbidden rule per (from, to) layer pair that ALLOWED_EDGES does not list. */
const layerRules = LAYERS.flatMap((from, fromIndex) =>
  LAYERS.flatMap((to, toIndex) => {
    if (ALLOWED_EDGES[from.name].includes(to.name)) return [];
    const { why, fix } = TARGET_GUIDANCE[to.name];
    return [
      {
        name: `layer-${from.name}-to-${to.name}`,
        severity: 'error',
        comment: `Found an import from the ${from.name} layer (${from.description}) into the ${to.name} layer (${to.description}). Why: ${why} Fix: ${fix}`,
        from: layerCondition(fromIndex),
        to: layerCondition(toIndex),
      },
    ];
  }),
);

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...layerRules,
    {
      name: 'no-import-of-entry',
      severity: 'error',
      comment:
        'Found an import of the app entry src/main.tsx. Why: it calls createSkateboardApp() when it loads, so importing it re-runs bootstrap and creates a cycle (main imports the views that import main). ' +
        'Fix: move the shared value into its own module (e.g. src/routes.ts), pass it down as props, or read config with `import constants from "../constants.json"`.',
      from: {},
      to: { path: ENTRY_MODULE.source },
    },
    {
      name: 'no-node-builtins-in-browser',
      severity: 'error',
      comment:
        'Found an import of a Node builtin (fs, path, node:*) in src/. Why: everything under src/ is bundled for the browser, where Node builtins do not exist; Vite stubs them and the call fails at runtime. ' +
        'Fix: use browser APIs (fetch, URL, crypto.subtle, TextEncoder), ask the backend with `apiRequest` from "@stevederico/skateboard-ui/Utilities", or move build-time work into vite.plugins.ts.',
      from: { path: browserPaths },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-browser-import-outside-src',
      severity: 'error',
      comment:
        'Found an import in src/ that resolves to a repo file outside src/ (package.json, index.html, public/, a root config). Why: src/ ships to the browser; reaching out of it bundles repo files into the client and ties the app to the repo layout. ' +
        'Fix: move the value into src/ (e.g. src/constants.json), or inject it at build time with Vite `define` / `import.meta.env.VITE_*`.',
      from: { path: browserPaths },
      to: {
        // Other layers are reported by their layer-* rule; packages and builtins have their own rules.
        pathNot: [...LAYERS.map((layer) => layer.pattern.source), '(^|/)node_modules/'],
        dependencyTypes: ['local'],
        couldNotResolve: false,
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Found a circular dependency (the cycle is printed after the arrow). Why: modules in a cycle load half-initialised (imports are undefined at evaluation time), cannot be code-split or tested alone, and every change to one rebuilds all. ' +
        'Fix: move what both sides need into a third module that imports neither, or pass the value in as a prop / argument instead of importing it.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'Found a module that nothing imports and that imports nothing. Why: dead files rot (they are never type-checked through a caller, never bundled, never run) and mislead whoever greps for the pattern. ' +
        'Fix: import it where it is used (views are lazy-loaded from src/main.tsx; lint rules are registered in guardrails/eslint-plugin/index.js) or delete the file.',
      from: {
        orphan: true,
        pathNot: [
          TEST_FILES,
          '^scripts/', // CLI entry points run by npm scripts
          '^public/', // plain scripts loaded by index.html
          '(^|/)\\.[^/]+\\.[cm]?js$', // dotfile configs (.dependency-cruiser.js)
          '\\.config\\.[cm]?[jt]s$', // tool configs (vite, eslint, playwright)
          '\\.d\\.[cm]?ts$',
        ],
      },
      to: {},
    },
    {
      name: 'no-dev-dependency-in-src',
      severity: 'error',
      comment:
        'Found an import in src/ of a package that package.json lists under devDependencies. Why: src/ is the shipped bundle; a production install (`npm ci --omit=dev`) does not have dev packages, and build tools (vite, typescript, tailwindcss) are Node code that cannot run in the browser. ' +
        'Fix: use what skateboard-ui already exports, or, if the app truly needs the package at runtime, move it to "dependencies" with an exact pin (see AGENTS.md > Dependency Pinning).',
      from: { path: '^src/', pathNot: TEST_FILES },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-undeclared-package',
      severity: 'error',
      comment:
        'Found an import of an npm package that the nearest package.json does not declare (it resolves only because another package pulled it in). Why: transitive packages move or vanish on the next install, so the import breaks without any change here. ' +
        'Fix: prefer a native API or a skateboard-ui export; otherwise add the package with an exact pin to the package.json that owns the importing file (root for src/, scripts/, vite.*; guardrails/package.json for guardrails/).',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-unresolvable-import',
      severity: 'error',
      comment:
        'Found an import that does not resolve to a file or to a path in the package\'s `exports` map. Why: a typo, a deleted file, or a deep path into package internals (e.g. "pkg/dist/x.js") that the package does not export; the build fails or the path breaks on the next release. ' +
        'Fix: correct the relative path, or import the package\'s public subpath (e.g. "@stevederico/skateboard-ui/Utilities", "@stevederico/skateboard-ui/shadcn/ui/<component>"). The Vite "@/" alias is not in tsconfig, so use relative paths.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-relative-node-modules-path',
      severity: 'error',
      comment:
        'Found a relative import that reaches into a node_modules folder. Why: it hard-codes one install layout (hoisting, workspaces, and Docker builds differ) and skips the package\'s `exports` map, so it breaks on the next install. ' +
        'Fix: import the package by name (`import { Button } from "@stevederico/skateboard-ui/shadcn/ui/button"`).',
      from: {},
      to: { dependencyTypes: ['local'], path: '(^|/)node_modules/' },
    },
    {
      name: 'no-import-of-test-file',
      severity: 'error',
      comment:
        'Found a non-test module importing a test file. Why: test files run assertions on import and pull in node:test or Playwright, so shipping or tool code that imports one executes tests at runtime. ' +
        'Fix: move the shared helper out of the test file into a plain module next to it and import that from both.',
      from: { pathNot: TEST_FILES },
      to: { path: TEST_FILES },
    },
  ],
  options: {
    // Resolve packages (so the dependency-type rules work) but never crawl into them.
    doNotFollow: { path: ['(^|/)node_modules/'] },
    exclude: { path: ['^dist/', '^verify-artifacts/', '^backend/target/'] },
    // Keep `import type` edges: a type-only import across layers still couples them.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      // Honour `exports` maps so deep paths a package does not export are unresolvable.
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};

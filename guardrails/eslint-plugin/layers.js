/**
 * Architectural layers of the skateboard template and the import edges allowed between
 * them. This table is the single source for both boundary checkers: the
 * `skateboard/layer-boundaries` lint rule (one file at a time) and the root
 * `.dependency-cruiser.js` (whole graph), which generates one `forbidden` rule per pair
 * that is NOT in ALLOWED_EDGES plus the special cases below (entry module, Node builtins
 * in src/, paths out of src/). Patterns must stay safe-regex clean (no nested
 * quantifiers) or dependency-cruiser refuses the config.
 *
 * Paths are repo-relative with forward slashes. The first matching layer wins, so the
 * more specific `ui` pattern must stay above `app`.
 */

/**
 * @typedef {object} Layer
 * @property {string} name - Short layer id used in messages and ALLOWED_EDGES
 * @property {RegExp} pattern - Matches repo-relative paths in the layer
 * @property {string} description - What lives there (shown in lint messages)
 */

/** @type {Layer[]} */
export const LAYERS = [
  { name: 'ui', pattern: /^src\/components\//, description: 'src/components: browser React views' },
  {
    name: 'app',
    pattern: /^src\//,
    description: 'src/ app wiring: main.tsx entry, icons.ts funnel, constants.json, legal.json, assets/',
  },
  { name: 'server', pattern: /^backend\//, description: 'backend/: zero-crate Rust server' },
  { name: 'tooling', pattern: /^scripts\//, description: 'scripts/: Node maintenance tools (updater, verifiers, doc tests)' },
  { name: 'build', pattern: /^vite\.[^/]+$/, description: 'vite.*: build config and plugins, run by Node at build time' },
  {
    name: 'guardrails',
    pattern: /^(?:guardrails\/|eslint\.config\.js$|\.dependency-cruiser\.js$)/,
    description: 'guardrails/ + eslint.config.js + .dependency-cruiser.js: lint, boundary, and runtime-verify tooling',
  },
];

/**
 * Allowed import edges: layer -> layers it may import from. Anything else is forbidden.
 * - ui and app are one bundle, so they may import each other (except the entry, below).
 * - tooling and build may read app data (src/constants.json) but never UI components.
 * - server is Rust; listed for completeness, it never imports JS.
 * - guardrails depends on nothing in the app.
 *
 * @type {Record<string, string[]>}
 */
export const ALLOWED_EDGES = {
  ui: ['ui', 'app'],
  app: ['app', 'ui'],
  server: ['server'],
  tooling: ['tooling', 'app'],
  build: ['build', 'app'],
  guardrails: ['guardrails'],
};

/** The app entry. It bootstraps the app on import, so no module may import it. */
export const ENTRY_MODULE = /^src\/main(?:|\.ts|\.tsx)$/;

/** Layers that are bundled for the browser: no Node builtins, no paths outside src/. */
export const BROWSER_LAYERS = new Set(['ui', 'app']);

/**
 * Why each layer is off-limits and what to do instead, keyed by the TARGET layer.
 *
 * @type {Record<string, { why: string, fix: string }>}
 */
export const TARGET_GUIDANCE = {
  ui: {
    why: 'src/components are browser React views (JSX, CSS, skateboard-ui context); Node code that imports them drags React and the DOM into tools that run without one.',
    fix: 'read app data from src/constants.json instead, or move the pure logic out of the component into a plain src/*.ts module the tool can import.',
  },
  app: {
    why: 'src/ is the browser bundle; importing it from a layer that must not depend on the app creates a hidden cycle between tooling and product code.',
    fix: 'pass the value in as data (read the JSON file with fs, a CLI flag, or an env var) instead of importing app modules.',
  },
  server: {
    why: 'backend/ is the Rust server; it holds no JS modules, and anything reached there (config, .env, databases) must never be bundled into the browser or read around the HTTP API.',
    fix: 'talk to the server over HTTP: `apiRequest` / `useListData` from "@stevederico/skateboard-ui/Utilities" in src/, `fetch` in scripts. Keep a small TS interface for the response shape in the caller.',
  },
  tooling: {
    why: 'scripts/ are Node-only maintenance tools (fs, child_process, git, the updater); importing them bundles Node code and couples the importer to the upgrade tooling.',
    fix: 'move the shared helper into the importing layer (e.g. a src/*.ts module for app code) or duplicate the few lines it needs.',
  },
  build: {
    why: 'vite.* run in Node at build time; importing them from elsewhere bundles the build toolchain or makes runtime code depend on build internals.',
    fix: 'expose build-time values through Vite (`define`, `import.meta.env.VITE_*`) or move pure helpers into the importing layer.',
  },
  guardrails: {
    why: 'guardrails/ is lint tooling with its own node_modules and TypeScript 5 parser; app, tooling, and build code must run without it installed.',
    fix: 'do not import lint code; copy the constant you need, or express the check as a lint rule instead.',
  },
};

/**
 * Find the layer a repo-relative path belongs to.
 *
 * @param {string} relPath - Repo-relative path with forward slashes
 * @returns {Layer | undefined} The first matching layer, or undefined (e.g. public/, root files)
 */
export function layerOf(relPath) {
  return LAYERS.find((layer) => layer.pattern.test(relPath));
}

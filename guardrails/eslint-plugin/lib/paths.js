import path from 'node:path';

/**
 * Path of the linted file relative to the ESLint working directory (the repo root),
 * always with forward slashes so patterns behave the same on every OS.
 *
 * @param {import('eslint').Rule.RuleContext} context - Rule context
 * @returns {string} Repo-relative path, e.g. `src/components/HomeView.tsx`
 */
export function repoRelative(context) {
  return toPosix(path.relative(context.cwd, context.filename));
}

/**
 * Convert an OS path to forward slashes.
 *
 * @param {string} p - Path in OS format
 * @returns {string} Same path with `/` separators
 */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Resolve an import specifier written in `context.filename` to a repo-relative path.
 * Handles `./` and `../` specifiers plus the Vite `@/` alias (`@/x` → `src/x`).
 * Bare package specifiers return null.
 *
 * @param {import('eslint').Rule.RuleContext} context - Rule context
 * @param {string} source - Import specifier as written
 * @returns {string | null} Repo-relative target path, or null for package imports
 */
export function resolveSpecifier(context, source) {
  if (source.startsWith('@/')) return `src/${source.slice(2)}`;
  if (!source.startsWith('.') && !source.startsWith('/')) return null;
  const absolute = path.resolve(path.dirname(context.filename), source);
  return toPosix(path.relative(context.cwd, absolute));
}

/** Matches test files by the repo convention (`*.test.js`, `*.test.tsx`, ...). */
export const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

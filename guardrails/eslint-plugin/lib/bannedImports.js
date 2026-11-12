import { moduleSourceVisitors, packageName } from './moduleSources.js';

/**
 * @typedef {object} BannedEntry
 * @property {(source: string, pkg: string) => boolean} match - True when the specifier is banned
 * @property {string} why - Root cause: why the repo forbids this import
 * @property {string} fix - Exact replacement the author should use
 */

/**
 * Build a rule that bans a family of imports. Every report names the specifier, the
 * reason, and the replacement, because the reader is usually an agent that will act on
 * the message verbatim.
 *
 * @param {object} options - Rule definition
 * @param {string} options.description - The written rule being enforced (quoted from the docs)
 * @param {string} options.source - Where the written rule lives
 * @param {BannedEntry[]} options.entries - Banned specifier families, checked in order
 * @returns {import('eslint').Rule.RuleModule} ESLint rule
 */
export function createBannedImportRule({ description, source, entries }) {
  return {
    meta: {
      type: 'problem',
      docs: { description, source },
      schema: [],
      messages: {
        banned: 'Found an import of "{{source}}". Why: {{why}} Fix: {{fix}}',
      },
    },
    create(context) {
      return moduleSourceVisitors((node, specifier) => {
        const pkg = packageName(specifier);
        const entry = entries.find((e) => e.match(specifier, pkg));
        if (entry) {
          context.report({ node, messageId: 'banned', data: { source: specifier, why: entry.why, fix: entry.fix } });
        }
      });
    },
  };
}

/**
 * Matcher for a list of package names, including their subpaths.
 *
 * @param {string[]} names - Package names (`axios`, `@scope/pkg`)
 * @returns {(source: string, pkg: string) => boolean} Matcher
 */
export function packages(names) {
  const set = new Set(names);
  return (_source, pkg) => set.has(pkg);
}

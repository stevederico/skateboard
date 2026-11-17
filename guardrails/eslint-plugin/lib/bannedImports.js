import { moduleSourceVisitors, packageName } from './moduleSources.js';

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

export function packages(names) {
  const set = new Set(names);
  return (_source, pkg) => set.has(pkg);
}

import { builtinModules } from 'node:module';
import { moduleSourceVisitors } from '../lib/moduleSources.js';
import { repoRelative, resolveSpecifier } from '../lib/paths.js';
import { ALLOWED_EDGES, BROWSER_LAYERS, ENTRY_MODULE, TARGET_GUIDANCE, layerOf } from '../layers.js';

const BUILTINS = new Set(builtinModules);

/**
 * True for `node:fs`, `fs`, `fs/promises`, and other Node builtin specifiers.
 *
 * @param {string} source - Import specifier
 * @returns {boolean} Whether the specifier is a Node builtin
 */
const isNodeBuiltin = (source) => source.startsWith('node:') || BUILTINS.has(source) || BUILTINS.has(source.split('/')[0]);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Respect layer boundaries: src/ may not import backend/, scripts/, guardrails/, vite.* or Node builtins; src/components may not import the src/main.tsx entry; scripts/ and vite.* may not import src/components; no file climbs out of its layer into another via ../.',
      source: 'AGENTS.md > Guardrails (layer table in guardrails/eslint-plugin/layers.js)',
    },
    schema: [],
    messages: {
      crossLayer:
        'Found an import of "{{source}}" from the {{from}} layer ({{fromDesc}}) into the {{to}} layer ({{toDesc}}). Why: {{why}} Fix: {{fix}}',
      entry:
        'Found an import of the app entry "{{source}}". Why: src/main.tsx calls createSkateboardApp() when it loads, so importing it re-runs bootstrap and creates a cycle (main imports the views that import main). ' +
        'Fix: move the shared value into its own module (e.g. src/routes.ts), pass it down as props, or read config with `getState().state.constants` / `import constants from "../constants.json"`.',
      nodeBuiltin:
        'Found an import of the Node builtin "{{source}}" in {{from}} code. Why: everything under src/ is bundled for the browser, where Node builtins do not exist; Vite stubs them and the call fails at runtime. ' +
        'Fix: use browser APIs (fetch, URL, crypto.subtle, TextEncoder), ask the backend with `apiRequest` from "@stevederico/skateboard-ui/Utilities", or move build-time work into vite.plugins.ts.',
      outsideSrc:
        'Found an import of "{{source}}" that resolves to {{target}}, outside src/. Why: src/ ships to the browser; reaching out of it bundles repo files (package.json, configs, server or tool code) into the client and ties the app to the repo layout. ' +
        'Fix: move the value into src/ (e.g. src/constants.json), or inject it at build time with Vite `define` / `import.meta.env.VITE_*`.',
      outsideRepo:
        'Found an import of "{{source}}" that climbs out of the repository. Why: other checkouts, CI, and Docker builds do not have that path, so the build only works on one machine. ' +
        'Fix: add the code as a pinned dependency in package.json, or copy it into the layer that owns it.',
    },
  },
  create(context) {
    const fromPath = repoRelative(context);
    const fromLayer = layerOf(fromPath);
    if (!fromLayer) return {};
    const isBrowser = BROWSER_LAYERS.has(fromLayer.name);

    return moduleSourceVisitors((node, source) => {
      if (isBrowser && isNodeBuiltin(source)) {
        context.report({ node, messageId: 'nodeBuiltin', data: { source, from: fromLayer.name } });
        return;
      }
      const target = resolveSpecifier(context, source);
      if (target === null) return;
      if (target.startsWith('../') || target === '..') {
        context.report({ node, messageId: 'outsideRepo', data: { source } });
        return;
      }
      if (ENTRY_MODULE.test(target)) {
        context.report({ node, messageId: 'entry', data: { source } });
        return;
      }
      const toLayer = layerOf(target);
      if (!toLayer) {
        if (isBrowser) context.report({ node, messageId: 'outsideSrc', data: { source, target } });
        return;
      }
      if (ALLOWED_EDGES[fromLayer.name].includes(toLayer.name)) return;
      const { why, fix } = TARGET_GUIDANCE[toLayer.name];
      context.report({
        node,
        messageId: 'crossLayer',
        data: { source, from: fromLayer.name, fromDesc: fromLayer.description, to: toLayer.name, toDesc: toLayer.description, why, fix },
      });
    });
  },
};

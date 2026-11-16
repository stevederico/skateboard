import { moduleSourceVisitors, mergeVisitors } from '../lib/moduleSources.js';

const UI = '@stevederico/skateboard-ui';

/** Utilities exports removed in late 4.x, with what replaced each. */
const REMOVED_UTILITIES = {
  useForm: 'React `useState` per field with the validation pattern in skills/skateboard/rules/forms.md',
  logEvent: 'nothing in the shell; call your own analytics endpoint with `apiRequest` inside the event handler',
  setSidebarVisible: '`showSidebar()` / `hideSidebar()` (or `setUIVisibility({ sidebar })`) from "@stevederico/skateboard-ui/Utilities"',
  setTabBarVisible: '`showTabBar()` / `hideTabBar()` (or `setUIVisibility({ tabBar })`) from "@stevederico/skateboard-ui/Utilities"',
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never import per-icon subpaths `@stevederico/skateboard-ui/icons/<Name>` or public DynamicIcon (removed in 5.0), or `@stevederico/skateboard-ui/shadcn/...` (removed in ui 5.17.0); no `useForm`, `logEvent`, `setSidebarVisible` / `setTabBarVisible` (removed Utilities).',
      source: 'AGENTS.md > Icons / Migrating 4.x -> 5.0 (steps 10, 11 and 13); docs/UPGRADE.md 5.19.0',
    },
    schema: [],
    messages: {
      icons:
        'Found an import of "{{source}}". Why: skateboard-ui 5.0 deleted per-icon subpaths; the package exports one `./icons` entry (5.13+), so this path does not resolve and the build fails. ' +
        'Fix: add the icon to the explicit export list in src/icons.ts (`export { Plus } from "@stevederico/skateboard-ui/icons";`) and import it from the funnel: `import { Plus } from "../icons";`.',
      dynamicIcon:
        'Found an import of "{{source}}". Why: public DynamicIcon was removed in skateboard-ui 5.0 (string-to-icon lookup pulls every icon into the bundle). The shell still resolves constants.json icon strings privately. ' +
        'Fix: use a named icon from the funnel (`import { House } from "../icons";`) and render `<House size={18} />`.',
      shadcn:
        'Found an import of "{{source}}". Why: skateboard-ui 5.17.0 removed every `./shadcn/*` export (shadcn/ui was only an alias of ui/, and shadcn/lib + shadcn/hooks became lib/ and hooks/), so this path no longer resolves and the build fails. ' +
        'Fix: import "{{replacement}}" instead (same exports).',
      removedUtility:
        'Found `{{name}}` imported from "@stevederico/skateboard-ui/Utilities". Why: it was removed from the shell in late 4.x, so the import is undefined at runtime. ' +
        'Fix: use {{replacement}}.',
    },
  },
  create(context) {
    return mergeVisitors(
      moduleSourceVisitors((node, source) => {
        if (source.startsWith(`${UI}/icons/`)) {
          context.report({ node, messageId: 'icons', data: { source } });
        } else if (source === `${UI}/shadcn` || source.startsWith(`${UI}/shadcn/`)) {
          const rest = source.slice(`${UI}/shadcn/`.length);
          // Only lib/utils (cn) was ever exported from shadcn/lib.
          const sub = rest.startsWith('ui/') || rest.startsWith('hooks/') ? rest : 'lib/utils';
          context.report({ node, messageId: 'shadcn', data: { source, replacement: `${UI}/${sub}` } });
        } else if (source === `${UI}/DynamicIcon` || source.startsWith(`${UI}/DynamicIcon/`)) {
          context.report({ node, messageId: 'dynamicIcon', data: { source } });
        }
      }),
      {
        ImportDeclaration(node) {
          if (node.source.value !== `${UI}/Utilities`) return;
          for (const spec of node.specifiers) {
            if (spec.type !== 'ImportSpecifier') continue;
            const name = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
            if (Object.hasOwn(REMOVED_UTILITIES, name)) {
              context.report({ node: spec, messageId: 'removedUtility', data: { name, replacement: REMOVED_UTILITIES[name] } });
            }
          }
        },
      },
    );
  },
};

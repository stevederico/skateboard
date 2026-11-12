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
        'Never import from `@stevederico/skateboard-ui/icons` or use public DynamicIcon (removed in 5.0); no `useForm`, `logEvent`, `setSidebarVisible` / `setTabBarVisible` (removed Utilities).',
      source: 'AGENTS.md > Icons / Migrating 4.x -> 5.0 (steps 10 and 13)',
    },
    schema: [],
    messages: {
      icons:
        'Found an import of "{{source}}". Why: skateboard-ui 5.0 deleted its icon re-exports, so this path no longer exists and the build fails. ' +
        'Fix: add the icon to the explicit export list in src/icons.ts (`export { Plus } from "lucide-react";`) and import it from the funnel: `import { Plus } from "../icons";`.',
      dynamicIcon:
        'Found an import of "{{source}}". Why: public DynamicIcon was removed in skateboard-ui 5.0 (string-to-icon lookup pulls every icon into the bundle). The shell still resolves constants.json icon strings privately. ' +
        'Fix: use a named icon from the funnel (`import { House } from "../icons";`) and render `<House size={18} />`.',
      removedUtility:
        'Found `{{name}}` imported from "@stevederico/skateboard-ui/Utilities". Why: it was removed from the shell in late 4.x, so the import is undefined at runtime. ' +
        'Fix: use {{replacement}}.',
    },
  },
  create(context) {
    return mergeVisitors(
      moduleSourceVisitors((node, source) => {
        if (source === `${UI}/icons` || source.startsWith(`${UI}/icons/`)) {
          context.report({ node, messageId: 'icons', data: { source } });
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

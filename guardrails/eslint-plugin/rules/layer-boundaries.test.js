import rule from './layer-boundaries.js';
import { runRuleTests } from '../lib/ruleTester.js';

const ui = 'src/components/HomeView.tsx';

runRuleTests('layer-boundaries', rule, {
  valid: [
    { code: "import { SectionCards } from './SectionCards';", filename: ui },
    { code: "import { Plus } from '../icons';", filename: ui },
    { code: "import constants from '../constants.json';", filename: ui },
    { code: "import { Plus } from '@/icons';", filename: ui },
    { code: "import Header from '@stevederico/skateboard-ui/Header';", filename: ui },
    { code: "const HomeView = lazy(() => import('./components/HomeView'));", filename: 'src/main.tsx' },
    { code: "import './assets/styles.css';", filename: 'src/main.tsx' },
    { code: "import { readFileSync } from 'node:fs';", filename: 'scripts/tool.js' },
    { code: "import { verifyUiVersion } from './verify-ui-version.ts';", filename: 'scripts/verify-ui-version.mjs' },
    { code: "import constants from '../src/constants.json' with { type: 'json' };", filename: 'scripts/tool.js' },
    { code: "import { htmlReplacePlugin } from './vite.plugins.ts';", filename: 'vite.config.ts' },
    { code: "import plugin from './guardrails/eslint-plugin/index.js';", filename: 'eslint.config.js' },
    { code: "import { x } from '../../somewhere';", filename: 'public/theme-init.js' },
  ],
  invalid: [
    { code: "import { readFileSync } from 'node:fs';", filename: ui, errors: [{ messageId: 'nodeBuiltin' }] },
    { code: "import path from 'path';", filename: 'src/main.tsx', errors: [{ messageId: 'nodeBuiltin' }] },
    { code: "import { verifyUiVersion } from '../../scripts/verify-ui-version.ts';", filename: ui, errors: [{ messageId: 'crossLayer', data: {
      source: '../../scripts/verify-ui-version.ts', from: 'ui', fromDesc: 'src/components: browser React views', to: 'tooling',
      toDesc: 'scripts/: Node maintenance tools (updater, verifiers, doc tests)',
      why: 'scripts/ are Node-only maintenance tools (fs, child_process, git, the updater); importing them bundles Node code and couples the importer to the upgrade tooling.',
      fix: 'move the shared helper into the importing layer (e.g. a src/*.ts module for app code) or duplicate the few lines it needs.',
    } }] },
    { code: "import { customLoggerPlugin } from '../vite.plugins.ts';", filename: 'src/main.tsx', errors: [{ messageId: 'crossLayer' }] },
    { code: "import rule from '../guardrails/eslint-plugin/index.js';", filename: 'src/main.tsx', errors: [{ messageId: 'crossLayer' }] },
    { code: "import cfg from '../../backend/config.json';", filename: ui, errors: [{ messageId: 'crossLayer' }] },
    { code: "import { appRoutes } from '../main';", filename: ui, errors: [{ messageId: 'entry' }] },
    { code: "import HomeView from '../src/components/HomeView.tsx';", filename: 'scripts/tool.js', errors: [{ messageId: 'crossLayer' }] },
    { code: "import HomeView from './src/components/HomeView.tsx';", filename: 'vite.plugins.ts', errors: [{ messageId: 'crossLayer' }] },
    { code: "import pkg from '../package.json';", filename: 'src/main.tsx', errors: [{ messageId: 'outsideSrc' }] },
    { code: "import { x } from '../../../../other-repo/x.js';", filename: 'scripts/tool.js', errors: [{ messageId: 'outsideRepo' }] },
    { code: "import { ALLOWLIST } from '../../scripts/update-skateboard.js';", filename: 'guardrails/eslint-plugin/index.js', errors: [{ messageId: 'crossLayer' }] },
  ],
});

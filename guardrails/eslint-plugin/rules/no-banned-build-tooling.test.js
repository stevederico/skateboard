import rule from './no-banned-build-tooling.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-banned-build-tooling', rule, {
  valid: [
    { code: "import tailwindcss from '@tailwindcss/vite';\nexport default { plugins: [tailwindcss()] };", filename: 'vite.config.ts' },
    { code: "export default { optimizeDeps: { include: ['react'], exclude: ['lightningcss'] } };", filename: 'vite.config.ts' },
    { code: 'const server = { force: true };', filename: 'vite.config.ts' },
  ],
  invalid: [
    { code: "import autoprefixer from 'autoprefixer';", filename: 'vite.config.ts', errors: [{ messageId: 'cssToolchain' }] },
    { code: "import nesting from 'postcss-nesting';", filename: 'vite.config.ts', errors: [{ messageId: 'cssToolchain' }] },
    { code: 'export default { content: ["./src/**/*.tsx"] };', filename: 'tailwind.config.js', errors: [{ messageId: 'configFile' }] },
    { code: 'export default { plugins: {} };', filename: 'postcss.config.mjs', errors: [{ messageId: 'configFile' }] },
    { code: "import react from '@vitejs/plugin-react-swc';", filename: 'vite.config.ts', errors: [{ messageId: 'swc' }] },
    { code: 'export default { optimizeDeps: { force: true } };', filename: 'vite.config.ts', errors: [{ messageId: 'forceOptimize' }] },
  ],
});

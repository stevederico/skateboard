import rule from './icons-through-funnel.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('icons-through-funnel', rule, {
  valid: [
    { code: "import { Plus } from '../icons';", filename: 'src/components/BlankView.tsx' },
    { code: "export { LayoutDashboard, Plus } from '@stevederico/skateboard-ui/icons';", filename: 'src/icons.ts' },
    { code: "import { Plus } from '@stevederico/skateboard-ui/icons';\nexport function AddIcon() { return <Plus size={18} />; }", filename: 'src/icons.tsx' },
    { code: "import { Plus } from './icons';", filename: 'src/main.tsx' },
  ],
  invalid: [
    {
      code: "import { Plus, Trash2 } from '@stevederico/skateboard-ui/icons';",
      filename: 'src/components/BlankView.tsx',
      errors: [{ messageId: 'direct', data: { source: '@stevederico/skateboard-ui/icons', names: 'Plus, Trash2', funnel: '../icons' } }],
    },
    {
      code: "import { Plus } from '@stevederico/skateboard-ui/icons';",
      filename: 'src/main.tsx',
      errors: [{ messageId: 'direct', data: { source: '@stevederico/skateboard-ui/icons', names: 'Plus', funnel: './icons' } }],
    },
    {
      code: "import { Plus, Trash2 } from 'lucide-react';",
      filename: 'src/components/BlankView.tsx',
      errors: [{ messageId: 'lucide', data: { source: 'lucide-react', names: 'Plus, Trash2', funnel: '../icons' } }],
    },
    {
      code: "export { LayoutDashboard } from 'lucide-react';",
      filename: 'src/icons.ts',
      errors: [{ messageId: 'lucide', data: { source: 'lucide-react', names: 'LayoutDashboard', funnel: './icons' } }],
    },
    { code: "const icons = await import('lucide-react');", filename: 'scripts/tool.js', errors: [{ messageId: 'lucide' }] },
    { code: "export * from '@stevederico/skateboard-ui/icons';", filename: 'src/icons.ts', errors: [{ messageId: 'starExport' }] },
    {
      code: "import * as Icons from '@stevederico/skateboard-ui/icons';\nexport const { Plus } = Icons;",
      filename: 'src/icons.ts',
      errors: [{ messageId: 'namespaceImport' }],
    },
  ],
});

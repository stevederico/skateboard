import rule from './icons-through-funnel.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('icons-through-funnel', rule, {
  valid: [
    { code: "import { Plus } from '../icons';", filename: 'src/components/BlankView.tsx' },
    { code: "export { LayoutDashboard, Plus } from 'lucide-react';", filename: 'src/icons.ts' },
    { code: "import { Plus } from 'lucide-react';\nexport function AddIcon() { return <Plus size={18} />; }", filename: 'src/icons.tsx' },
    { code: "import { Plus } from './icons';", filename: 'src/main.tsx' },
  ],
  invalid: [
    {
      code: "import { Plus, Trash2 } from 'lucide-react';",
      filename: 'src/components/BlankView.tsx',
      errors: [{ messageId: 'direct', data: { source: 'lucide-react', names: 'Plus, Trash2', funnel: '../icons' } }],
    },
    {
      code: "import { Plus } from 'lucide-react';",
      filename: 'src/main.tsx',
      errors: [{ messageId: 'direct', data: { source: 'lucide-react', names: 'Plus', funnel: './icons' } }],
    },
    { code: "const icons = await import('lucide-react');", filename: 'scripts/tool.js', errors: [{ messageId: 'direct' }] },
    { code: "export * from 'lucide-react';", filename: 'src/icons.ts', errors: [{ messageId: 'starExport' }] },
    { code: "import * as Icons from 'lucide-react';\nexport const { Plus } = Icons;", filename: 'src/icons.ts', errors: [{ messageId: 'namespaceImport' }] },
  ],
});

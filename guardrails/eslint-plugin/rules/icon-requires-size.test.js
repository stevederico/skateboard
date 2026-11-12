import rule from './icon-requires-size.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('icon-requires-size', rule, {
  valid: [
    'import { Plus } from "../icons"; <Plus size={18} aria-hidden="true" />;',
    'import { TrendingUp } from "../icons"; <TrendingUp className="size-4" aria-hidden="true" />;',
    'import { TrendingUp } from "@/icons"; <TrendingUp {...iconProps} />;',
    'import { Badge } from "@stevederico/skateboard-ui/shadcn/ui/badge"; <Badge />;',
    { code: 'import { Plus } from "./icons.ts"; <Plus size={16} />;', filename: 'src/main.tsx' },
  ],
  invalid: [
    {
      code: 'import { TrendingUp } from "../icons"; <TrendingUp aria-hidden="true" />;',
      errors: [{ messageId: 'missingSize', data: { name: 'TrendingUp' } }],
    },
    { code: 'import { X } from "lucide-react"; <X />;', errors: [{ messageId: 'missingSize' }] },
    { code: 'import { Plus } from "./icons"; <Plus className="text-muted-foreground" />;', filename: 'src/main.tsx', errors: [{ messageId: 'missingSize' }] },
  ],
});

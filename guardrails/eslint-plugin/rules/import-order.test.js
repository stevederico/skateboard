import rule from './import-order.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('import-order', rule, {
  valid: [
    `import './assets/styles.css';
import { lazy, Suspense } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import HomeViewSkeleton from './components/HomeViewSkeleton';
import constants from './constants.json';`,
    `import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cn } from '@/lib/cn';
import { SectionCards } from './SectionCards';`,
    `import Header from '@stevederico/skateboard-ui/Header';
import './side-effect.css';
import { Plus } from '../icons';`,
  ],
  invalid: [
    {
      code: `import { Plus } from '../icons';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';`,
      errors: [{
        messageId: 'order',
        data: { group: 'external package', source: '@stevederico/skateboard-ui/shadcn/ui/button', laterGroup: 'relative path', later: '../icons' },
      }],
    },
    {
      code: `import { cn } from '@/lib/cn';
import { join } from 'node:path';
import { x } from './x';
import { y } from '@/y';`,
      errors: [{ messageId: 'order', data: { group: 'external package', source: 'node:path', laterGroup: 'internal (@/) module', later: '@/lib/cn' } }],
    },
  ],
});

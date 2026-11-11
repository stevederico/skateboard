import rule from './suspense-skeleton-fallback.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('suspense-skeleton-fallback', rule, {
  valid: [
    '<Suspense fallback={<HomeViewSkeleton />}><HomeView /></Suspense>',
    '<Suspense fallback={null}><CommandMenu /></Suspense>',
    '<Suspense fallback={<PageSkeleton />}><X /></Suspense>',
    '<Button disabled><Spinner className="size-4" /></Button>',
  ],
  invalid: [
    { code: '<Suspense fallback={<Spinner />}><HomeView /></Suspense>', errors: [{ messageId: 'spinnerFallback' }] },
    {
      code: '<Suspense fallback={<div className="flex flex-1 items-center justify-center"><Spinner /></div>}><V /></Suspense>',
      errors: [{ messageId: 'spinnerFallback' }],
    },
  ],
});

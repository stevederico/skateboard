import rule from './no-loading-text-in-button.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-loading-text-in-button', rule, {
  valid: [
    '<Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner className="size-4" /> : "Save"}</Button>',
    '<p>Loading your projects</p>',
    '<Button aria-label="Loading">x</Button>',
    'const label = "Loading...";',
    '<Button>{status === "loading" ? <Spinner /> : "Retry"}</Button>',
  ],
  invalid: [
    { code: '<Button>Loading...</Button>', errors: [{ messageId: 'loadingText', data: { text: 'Loading...' } }] },
    { code: '<Button disabled={busy}>{busy ? "Loading…" : "Save"}</Button>', errors: [{ messageId: 'loadingText' }] },
    { code: '<Button>{busy ? `Loading` : "Save"}</Button>', errors: [{ messageId: 'loadingText' }] },
  ],
});

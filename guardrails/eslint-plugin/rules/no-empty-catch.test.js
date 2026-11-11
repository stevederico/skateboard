import rule from './no-empty-catch.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-empty-catch', rule, {
  valid: [
    'try { run(); } catch (err) { console.error(err); }',
    'try { return JSON.parse(text); } catch { return false; }',
    'main().catch((e) => { console.error(e); process.exit(1); });',
  ],
  invalid: [
    { code: 'try { run(); } catch (err) {}', errors: [{ messageId: 'emptyCatch' }] },
    { code: 'try { run(); } catch {\n  // ignore\n}', errors: [{ messageId: 'emptyCatch' }] },
    { code: 'save().catch(() => {});', errors: [{ messageId: 'noopCatch' }] },
    { code: 'save().catch(() => undefined);', errors: [{ messageId: 'noopCatch' }] },
    { code: 'save().catch(function () {});', errors: [{ messageId: 'noopCatch' }] },
  ],
});

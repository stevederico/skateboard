import rule from './no-browser-dialogs.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-browser-dialogs', rule, {
  valid: [
    'toast.error("Could not save. Try again.");',
    'dialog.confirm();',
    'const ok = await confirmDelete(id);',
  ],
  invalid: [
    { code: 'alert("saved");', errors: [{ messageId: 'dialog' }] },
    { code: 'if (confirm("Delete?")) remove();', errors: [{ messageId: 'dialog' }] },
    { code: 'const name = window.prompt("Name?");', errors: [{ messageId: 'dialog' }] },
    { code: 'globalThis.alert("x");', errors: [{ messageId: 'dialog' }] },
  ],
});

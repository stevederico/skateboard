const DIALOGS = new Set(['alert', 'confirm', 'prompt']);
const GLOBALS = new Set(['window', 'globalThis', 'self']);

const FIXES = {
  alert: 'use a toast (`toast()` / `toast.error()`, per AGENTS.md > Error Handling) for transient messages, or an inline error next to the field',
  confirm: 'use `<AlertDialog>` from `@stevederico/skateboard-ui/shadcn/ui/alert-dialog` (AlertDialogAction / AlertDialogCancel) and run the action in its onClick handler',
  prompt: 'use `<Dialog>` from `@stevederico/skateboard-ui/shadcn/ui/dialog` with a `<Label>` + `<Input>` from `@stevederico/skateboard-ui/shadcn/ui/input` and a submit `<Button>`',
};

/**
 * Dialog name called by this expression (`alert(...)`, `window.confirm(...)`), or null.
 *
 * @param {any} callee - CallExpression callee
 * @returns {string | null} `alert`, `confirm`, `prompt`, or null
 */
function dialogName(callee) {
  if (callee.type === 'Identifier' && DIALOGS.has(callee.name)) return callee.name;
  if (
    callee.type === 'MemberExpression' && !callee.computed &&
    callee.object.type === 'Identifier' && GLOBALS.has(callee.object.name) &&
    DIALOGS.has(callee.property.name)
  ) return callee.property.name;
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use `alert()`, `confirm()`, or `prompt()`: use shadcn Dialog/AlertDialog.',
      source: 'AGENTS.md > React Rules',
    },
    schema: [],
    messages: {
      dialog:
        'Found a native `{{name}}()` call. Why: browser dialogs block the main thread, cannot be styled or themed, break in iOS/PWA web views, and ignore the shell focus/keyboard handling. ' +
        'Fix: {{fix}}.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = dialogName(node.callee);
        if (name) context.report({ node, messageId: 'dialog', data: { name, fix: FIXES[name] } });
      },
    };
  },
};

/** Built-in types too loose to describe a value, with the precise replacement for each. */
const LOOSE_REFERENCES = {
  Function: '`(event: MouseEvent) => void` or the exact call signature',
  Object: '`Record<string, unknown>` or a named interface',
  String: '`string`',
  Number: '`number`',
  Boolean: '`boolean`',
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use loose built-in types (`Function`, `object`, `{}`): write precise signatures and shapes.',
      source: 'AGENTS.md > TypeScript Anti-Patterns',
    },
    schema: [],
    messages: {
      reference:
        'Found the loose type `{{name}}`. Why: it accepts almost anything (any callable, any non-null value), so calls and property reads are unchecked. ' +
        'Fix: use {{fix}}.',
      object:
        'Found the `object` type. Why: `object` admits every non-primitive but exposes no properties, which pushes callers into casts. ' +
        'Fix: describe the shape with an interface, or use `Record<string, unknown>` and narrow with `in` / `typeof` checks.',
      emptyLiteral:
        'Found the `{}` type. Why: `{}` means "any non-nullish value" (strings and numbers included), not "empty object". ' +
        'Fix: use `Record<string, never>` for an empty object, `Record<string, unknown>` for an unknown object, `unknown` for any value, or the real interface.',
    },
  },
  create(context) {
    return {
      TSTypeReference(node) {
        if (node.typeName.type !== 'Identifier') return;
        const { name } = node.typeName;
        if (Object.hasOwn(LOOSE_REFERENCES, name)) {
          context.report({ node, messageId: 'reference', data: { name, fix: LOOSE_REFERENCES[name] } });
        }
      },
      TSObjectKeyword(node) {
        context.report({ node, messageId: 'object' });
      },
      TSTypeLiteral(node) {
        if (node.members.length === 0) context.report({ node, messageId: 'emptyLiteral' });
      },
    };
  },
};

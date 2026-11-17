import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseToken } from '../lib/classStrings.js';

const DEFAULT_UI_CSS = 'node_modules/@stevederico/skateboard-ui/styles.css';

const DEFAULT_CSS_DIR = 'src';

const CLSX_FUNCTIONS = new Set(['cn', 'clsx', 'cx', 'classNames', 'twMerge']);

const MARKER = /^(?:group|peer)(?:\/[\w-]+)?$/;

const CLASS_ATTRIBUTES = new Set(['className', 'class']);

const CSS_ESCAPE = String.raw`\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?|\\[^\n\r\f0-9a-fA-F]`;

const CLASS_SELECTOR_RE = new RegExp(
  `\\.(-?(?:[A-Za-z_]|[^\\x00-\\x7f]|${CSS_ESCAPE})(?:[\\w-]|[^\\x00-\\x7f]|${CSS_ESCAPE})*)`,
  'g',
);

const CACHE = new Map();

function unescapeCss(ident) {
  return ident.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\(.)/g, (_, hex, ch) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : ch,
  );
}

/**
 * Class names defined by `.name` selectors in a stylesheet. Only rule preludes are
 * scanned (text before `{`); at-rule preludes, declarations, comments and quoted
 * strings are skipped, so `0.5rem` or `url("a.png")` never count as classes.
 *
 * @param {string} text - Stylesheet source
 * @returns {Set<string>} Unescaped class names
 */
export function cssClassNames(text) {
  const out = new Set();
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let prelude = '';
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\') {
      prelude += ch + (src[i + 1] ?? '');
      i += 1;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      if (!prelude.trim().startsWith('@')) {
        for (const m of prelude.matchAll(CLASS_SELECTOR_RE)) out.add(unescapeCss(m[1]));
      }
      prelude = '';
    } else if (ch === '}' || ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return out;
}

function readUiCss(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  if (/@import\s+["']tailwindcss["']/.test(text)) return null;
  return cssClassNames(text);
}

function readCssDir(dir) {
  const out = new Set();
  if (!existsSync(dir)) return out;
  for (const rel of readdirSync(dir, { recursive: true })) {
    const file = String(rel);
    if (!file.endsWith('.css') || file.split(/[\\/]/).includes('node_modules')) continue;
    for (const name of cssClassNames(readFileSync(path.join(dir, file), 'utf8'))) out.add(name);
  }
  return out;
}

function loadAllowed(cwd, options) {
  const key = `${cwd}\0${JSON.stringify(options)}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const listPath = options.uiCssPath ?? DEFAULT_UI_CSS;
  const shipped = options.classes ? new Set(options.classes) : readUiCss(path.resolve(cwd, listPath));
  const own = options.cssFiles
    ? new Set(options.cssFiles.flatMap((f) => [...cssClassNames(f.text)]))
    : readCssDir(path.resolve(cwd, options.cssDir ?? DEFAULT_CSS_DIR));
  const allowed = { shipped, own, listPath };
  CACHE.set(key, allowed);
  return allowed;
}

function keyName(prop) {
  if (prop.type !== 'Property' || prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
}

function flattenConcat(node) {
  if (node.type === 'BinaryExpression' && node.operator === '+') return [...flattenConcat(node.left), ...flattenConcat(node.right)];
  return [node];
}

class TokenCollector {
  constructor() {
    this.seenCalls = new Set();
    this.tokens = [];
  }

  addText(node, text, where, openStart = false, openEnd = false) {
    for (const m of text.matchAll(/\S+/g)) {
      if (openStart && m.index === 0) continue;
      if (openEnd && m.index + m[0].length === text.length) continue;
      this.tokens.push({ node, token: m[0], where });
    }
  }

  segments(segments, where) {
    segments.forEach((seg, i) => {
      const prev = segments[i - 1];
      const next = segments[i + 1];
      if ('text' in seg) {
        this.addText(seg.node, seg.text, where, Boolean(prev), Boolean(next));
        return;
      }
      const leftFree = !prev || /\s$/.test(prev.text ?? 'x') || ('text' in prev && prev.text === '' && i === 1);
      const rightFree = !next || /^\s/.test(next.text ?? 'x') || ('text' in next && next.text === '' && i === segments.length - 2);
      if (leftFree && rightFree) this.value(seg.expr, where);
    });
  }

  value(node, where) {
    if (!node) return;
    switch (node.type) {
      case 'Literal':
        if (typeof node.value === 'string') this.addText(node, node.value, where);
        break;
      case 'TemplateLiteral': {
        const segs = [];
        node.quasis.forEach((q, i) => {
          segs.push({ text: q.value.cooked ?? q.value.raw, node });
          if (i < node.expressions.length) segs.push({ expr: node.expressions[i] });
        });
        this.segments(segs, where);
        break;
      }
      case 'BinaryExpression': {
        if (node.operator !== '+') break;
        const segs = [];
        for (const part of flattenConcat(node)) {
          const last = segs[segs.length - 1];
          if (part.type === 'Literal' && typeof part.value === 'string') {
            if (last && 'text' in last) last.text += part.value;
            else segs.push({ text: part.value, node: part });
          } else {
            segs.push({ expr: part });
          }
        }
        this.segments(segs, where);
        break;
      }
      case 'JSXExpressionContainer':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
        this.value(node.expression, where);
        break;
      case 'ConditionalExpression':
        this.value(node.consequent, where);
        this.value(node.alternate, where);
        break;
      case 'LogicalExpression':
        if (node.operator !== '&&') this.value(node.left, where);
        this.value(node.right, where);
        break;
      case 'ArrayExpression':
        node.elements.forEach((e) => this.value(e, where));
        break;
      case 'SpreadElement':
        this.value(node.argument, where);
        break;
      case 'ObjectExpression':
        for (const prop of node.properties) {
          if (prop.type !== 'Property') continue;
          if (prop.computed) this.value(prop.key, where);
          else if (prop.key.type === 'Identifier') this.tokens.push({ node: prop.key, token: prop.key.name, where });
          else this.value(prop.key, where);
        }
        break;
      case 'CallExpression':
        this.call(node);
        break;
      default:
        break;
    }
  }

  call(node) {
    if (node.callee.type !== 'Identifier') return;
    const name = node.callee.name;
    const where = `${name}()`;
    if (CLSX_FUNCTIONS.has(name)) {
      this.seenCalls.add(node);
      node.arguments.forEach((a) => this.value(a, where));
    } else if (name === 'cva') {
      this.seenCalls.add(node);
      this.cva(node, where);
    }
  }

  cva(node, where) {
    const [base, config] = node.arguments;
    this.value(base, where);
    if (config?.type !== 'ObjectExpression') return;
    for (const prop of config.properties) {
      const key = keyName(prop);
      if (key === 'variants' && prop.value.type === 'ObjectExpression') {
        for (const group of prop.value.properties) {
          if (group.type !== 'Property' || group.value.type !== 'ObjectExpression') continue;
          for (const option of group.value.properties) if (option.type === 'Property') this.value(option.value, where);
        }
      } else if (key === 'compoundVariants' && prop.value.type === 'ArrayExpression') {
        for (const entry of prop.value.elements) {
          if (entry?.type !== 'ObjectExpression') continue;
          for (const field of entry.properties) {
            const fieldName = keyName(field);
            if (fieldName === 'class' || fieldName === 'className') this.value(field.value, where);
          }
        }
      }
    }
  }
}

function nearMiss(token, isAllowed) {
  const { variants, utility } = parseToken(token);
  if (variants.length && isAllowed(utility)) {
    return ` Near miss: "${utility}" is listed, but not with the "${variants.join(':')}:" variant.`;
  }
  const bare = token.replace(/^!|!$/g, '');
  if (bare !== token && isAllowed(bare)) return ` Near miss: "${bare}" (without the "!" important modifier) is listed.`;
  return '';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every static class token in app code is defined either by skateboard-ui\'s plain CSS (node_modules/@stevederico/skateboard-ui/styles.css) or by the app\'s own CSS under src/ (src/assets/styles.css). Apps run no Tailwind.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          classes: { type: 'array', items: { type: 'string' } },
          uiCssPath: { type: 'string' },
          ignore: { type: 'array', items: { type: 'string' } },
          cssFiles: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, text: { type: 'string' } },
              required: ['path', 'text'],
              additionalProperties: false,
            },
          },
          cssDir: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unknown:
        'Found the class "{{token}}" in {{where}}, and neither skateboard-ui\'s CSS nor the app\'s own CSS defines it. ' +
        'Why: skateboard apps run no Tailwind; styling is plain CSS: skateboard-ui\'s styles.css (its components and theme) plus the app\'s own src/assets/styles.css (the classes the app uses), so this class produces no CSS and the element renders unstyled. ' +
        'Fix: use a class one of those files defines, or add a rule for it to src/assets/styles.css by hand (e.g. `.my-card { padding: 1rem; }`, or the plain-CSS equivalent of the utility, using the theme variables such as `var(--spacing)`, `var(--muted)`), which this rule then accepts.{{hint}}',
      listMissing:
        'Found class names in this file, but {{listPath}} does not exist, so this rule cannot check any of them. ' +
        'Why: skateboard-ui 5.18.0+ ships plain CSS whose classes are the shipped list; 5.17.0 and older shipped Tailwind source (or nothing here), so a class with no CSS cannot be told apart from one that renders. ' +
        'Fix: upgrade @stevederico/skateboard-ui to 5.18.0 or newer and give the app its own plain CSS file (docs/UPGRADE.md); until then this rule checks nothing.',
    },
  },
  create(context) {
    const allowed = loadAllowed(context.cwd, context.options[0] ?? {});
    const ignore = new Set(context.options[0]?.ignore ?? []);
    const isAllowed = (t) => MARKER.test(t) || ignore.has(t) || Boolean(allowed.shipped?.has(t)) || allowed.own.has(t);
    const collector = new TokenCollector();
    let missingReported = false;

    const flush = () => {
      for (const { node, token, where } of collector.tokens) {
        if (!allowed.shipped) {
          if (!missingReported) context.report({ node, messageId: 'listMissing', data: { listPath: allowed.listPath } });
          missingReported = true;
          break;
        }
        if (!isAllowed(token)) {
          context.report({ node, messageId: 'unknown', data: { token, where, hint: nearMiss(token, isAllowed) } });
        }
      }
      collector.tokens = [];
    };

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !CLASS_ATTRIBUTES.has(node.name.name) || !node.value) return;
        collector.value(node.value, node.name.name);
        flush();
      },
      CallExpression(node) {
        if (collector.seenCalls.has(node)) return;
        collector.call(node);
        flush();
      },
    };
  },
};

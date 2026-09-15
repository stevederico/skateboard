#!/usr/bin/env node
/**
 * Fail if markdown links to missing local files or broken in-repo anchors.
 *
 * Scans README.md, AGENTS.md, SECURITY.md, docs/, and skills/.
 * External http(s) links are skipped (no network in CI).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} dir
 * @param {(n: string) => boolean} pred
 * @returns {string[]}
 */
function walk(dir, pred) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, pred));
    else if (pred(name)) out.push(p);
  }
  return out;
}

/**
 * GitHub-style heading slug.
 * @param {string} heading
 */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * @param {string} file
 * @returns {{ text: string, anchors: Set<string> }}
 */
function loadMarkdown(file) {
  const text = readFileSync(file, 'utf8');
  const anchors = new Set();
  for (const line of text.split('\n')) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) anchors.add(slugify(m[2].replace(/`/g, '')));
  }
  return { text, anchors };
}

const files = [
  ...walk(ROOT, (n) => n.endsWith('.md') && (n === 'README.md' || n === 'AGENTS.md' || n === 'SECURITY.md' || n === 'CLAUDE.md')),
  ...walk(join(ROOT, 'docs'), (n) => n.endsWith('.md')),
  ...walk(join(ROOT, 'skills'), (n) => n.endsWith('.md')),
].filter((f) => existsSync(f) && !f.includes('node_modules'));

/** @type {Map<string, { text: string, anchors: Set<string> }>} */
const cache = new Map();
for (const f of files) cache.set(f, loadMarkdown(f));

const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
/** @type {string[]} */
const errors = [];
let checked = 0;

for (const file of files) {
  const { text } = cache.get(file) ?? loadMarkdown(file);
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    const href = m[2].trim();
    if (!href || href.startsWith('#') === false && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
      if (href.startsWith('http')) continue;
      if (href.startsWith('mailto:')) continue;
    }
    checked += 1;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;

    const [pathPart, hash] = href.split('#');
    let targetFile = file;
    if (pathPart) {
      targetFile = resolve(dirname(file), pathPart);
      if (!existsSync(targetFile)) {
        errors.push(`${relative(ROOT, file)}: missing file ${href}`);
        continue;
      }
    }
    if (hash) {
      const doc = cache.get(targetFile) ?? (existsSync(targetFile) && targetFile.endsWith('.md') ? loadMarkdown(targetFile) : null);
      if (doc && !doc.anchors.has(hash.toLowerCase()) && !doc.anchors.has(hash)) {
        // GitHub sometimes keeps punctuation differently — try slugify of hash as-is
        const want = hash.toLowerCase();
        if (![...doc.anchors].some((a) => a === want)) {
          errors.push(`${relative(ROOT, file)}: missing anchor #${hash} (in ${relative(ROOT, targetFile)})`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`test:docs failed (${errors.length} broken link(s), ${checked} local links checked):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`test:docs ok (${checked} local links across ${files.length} markdown files)`);

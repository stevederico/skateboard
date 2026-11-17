import path from 'node:path';

export function repoRelative(context) {
  return toPosix(path.relative(context.cwd, context.filename));
}

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

export function resolveSpecifier(context, source) {
  if (source.startsWith('@/')) return `src/${source.slice(2)}`;
  if (!source.startsWith('.') && !source.startsWith('/')) return null;
  const absolute = path.resolve(path.dirname(context.filename), source);
  return toPosix(path.relative(context.cwd, absolute));
}

export const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

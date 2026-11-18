import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** A block mapping from the pnpm lockfile; scalar and flow values stay as their source text. */
export type LockfileNode = string | LockfileMapping;
export type LockfileMapping = Map<string, LockfileNode>;

const ENTRY = /^('(?:[^']|'')*'|.+?):(?: (.*))?$/;

function unquote(value: string): string {
  return value.startsWith("'") && value.endsWith("'") && value.length >= 2
    ? value.slice(1, -1).replaceAll("''", "'")
    : value;
}

/**
 * Parses the block-mapping structure of a pnpm v9 lockfile. Sequence items and flow
 * collections are not expanded; the dependency-security tests only read mapping keys
 * and scalar resolutions.
 */
export function parseLockfile(text: string): LockfileMapping {
  const root: LockfileMapping = new Map();
  const stack: { indent: number; mapping: LockfileMapping }[] = [{ indent: -1, mapping: root }];
  for (const line of text.split(/\r?\n/)) {
    const content = line.trimStart();
    if (content === '' || content.startsWith('#')) continue;
    const indent = line.length - content.length;
    while ((stack.at(-1)?.indent ?? -1) >= indent) stack.pop();
    const parent = stack.at(-1)?.mapping ?? root;
    if (content.startsWith('- ') || content === '-') continue;
    const entry = ENTRY.exec(content);
    if (!entry?.[1]) continue;
    const key = unquote(entry[1]);
    const value = entry[2]?.trim() ?? '';
    if (value === '') {
      const child: LockfileMapping = new Map();
      parent.set(key, child);
      stack.push({ indent, mapping: child });
    } else {
      parent.set(key, unquote(value));
    }
  }
  return root;
}

export function mappingAt(node: LockfileNode | undefined, ...path: string[]): LockfileMapping {
  let current = node;
  for (const key of path) {
    assert.ok(current instanceof Map, `lockfile path ${path.join('.')} is not a mapping`);
    current = current.get(key);
  }
  assert.ok(current instanceof Map, `lockfile path ${path.join('.')} is not a mapping`);
  return current;
}

export function scalarAt(node: LockfileNode | undefined, ...path: string[]): string {
  const parentPath = path.slice(0, -1);
  const key = path.at(-1);
  assert.ok(key !== undefined, 'lockfile scalar path is empty');
  const value = mappingAt(node, ...parentPath).get(key);
  if (typeof value !== 'string') assert.fail(`lockfile path ${path.join('.')} is not a scalar`);
  return value;
}

export async function readLockfile(): Promise<{ text: string; root: LockfileMapping }> {
  const text = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  return { text, root: parseLockfile(text) };
}

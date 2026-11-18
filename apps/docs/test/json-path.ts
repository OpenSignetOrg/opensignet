import assert from 'node:assert/strict';

import type { Operation, PublicOperation } from '../scripts/public-api-contract.ts';

/**
 * Reads a nested JSON value. Every container on the path must be an object or array, exactly
 * as plain property access would require; only the final value may be missing.
 */
export function pick(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null)
      assert.fail(`Expected an object before ${path.join('.')}`);
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export function pickArray(value: unknown, ...path: (string | number)[]): unknown[] {
  const found = pick(value, ...path);
  if (!Array.isArray(found)) assert.fail(`Expected an array at ${path.join('.')}`);
  return found;
}

export function pickString(value: unknown, ...path: (string | number)[]): string {
  const found = pick(value, ...path);
  if (typeof found !== 'string') assert.fail(`Expected a string at ${path.join('.')}`);
  return found;
}

export function operationById(operations: readonly PublicOperation[], id: string): Operation {
  const entry = operations.find((candidate) => candidate.operation.operationId === id);
  assert.ok(entry, `Missing operation ${id}`);
  return entry.operation;
}

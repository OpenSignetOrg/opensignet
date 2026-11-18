import assert from 'node:assert/strict';
import type { OpenSignetActionProvider } from '../dist/index.js';

type ProviderAction = ReturnType<OpenSignetActionProvider['getActions']>[number];
export type WalletProvider = Parameters<ProviderAction['invoke']>[0];

/**
 * Tests select actions by their runtime name, so the union of action types is viewed through
 * this name-independent shape. Method syntax keeps each action's own argument type assignable;
 * the action's Zod schema remains the runtime authority for its arguments.
 */
export interface NamedAction {
  name: string;
  schema: { parse(value: unknown): unknown };
  invoke(walletProvider: WalletProvider, args: unknown): Promise<string>;
}

export function actionNamed(provider: OpenSignetActionProvider, name: string): NamedAction {
  const action: NamedAction | undefined = provider
    .getActions()
    .find((candidate) => candidate.name === name);
  assert.ok(action, `missing action ${name}`);
  return action;
}

export interface SubmittedTransaction {
  to: string;
  data: `0x${string}`;
}

function isHex(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && value.startsWith('0x');
}

/** Narrows a wallet-provider transaction request to the fields these tests assert. */
export function submittedTransaction(value: unknown): SubmittedTransaction {
  assert.ok(value !== null && typeof value === 'object', 'transaction request was not submitted');
  const to: unknown = Reflect.get(value, 'to');
  const data: unknown = Reflect.get(value, 'data');
  assert.ok(typeof to === 'string', 'transaction request has no target');
  assert.ok(isHex(data), 'transaction request has no hex calldata');
  return { to, data };
}

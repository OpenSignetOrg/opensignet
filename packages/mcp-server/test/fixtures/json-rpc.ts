import assert from 'node:assert/strict';
import { encodeFunctionResult, type Abi, type Hex } from 'viem';

/** One JSON-RPC request as decoded by the fixture; every field is checked before use. */
export interface RpcCall {
  id: number | string | null;
  method: string;
  params: readonly unknown[];
}

/** The `eth_call` transaction object fields the fixtures inspect. */
export interface CallRequest {
  to: Hex;
  data: Hex;
  from?: unknown;
  value?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

export function text(value: unknown): string {
  assert.ok(typeof value === 'string', 'Expected a JSON-RPC string parameter');
  return value;
}

export function rpcCall(value: unknown): RpcCall {
  assert.ok(isRecord(value), 'Expected a JSON-RPC request object');
  const { id, method, params = [] } = value;
  assert.ok(id === null || typeof id === 'number' || typeof id === 'string');
  assert.ok(typeof method === 'string');
  assert.ok(Array.isArray(params));
  return { id, method, params };
}

/** A single request or a batch, as accepted by viem's HTTP transport. */
export function rpcBody(value: unknown): RpcCall | RpcCall[] {
  return Array.isArray(value) ? value.map(rpcCall) : rpcCall(value);
}

export function callRequest(value: unknown): CallRequest {
  assert.ok(isRecord(value), 'Expected an eth_call transaction object');
  const { to, data } = value;
  assert.ok(isHex(to));
  assert.ok(isHex(data));
  return { to, data, from: value.from, value: value.value };
}

/**
 * The fixtures select a function name at runtime from decoded calldata. viem cannot correlate a
 * runtime name with its literal ABI result type, so dynamic encodings use the widened `Abi` type;
 * the encoder still validates each value against the ABI at runtime.
 */
export function encodeDynamicResult(abi: Abi, functionName: string, result: unknown): Hex {
  return encodeFunctionResult({ abi, functionName, result });
}

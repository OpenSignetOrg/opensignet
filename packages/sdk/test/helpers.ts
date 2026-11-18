import assert from 'node:assert/strict';
import type { OpenSignetOptions } from '../dist/index.js';

/** The wallet and public client types accepted by the SDK. */
export type SdkWalletClient = NonNullable<OpenSignetOptions['walletClient']>;
export type SdkPublicClient = NonNullable<OpenSignetOptions['publicClient']>;

/**
 * Cast a partial test double to the full interface the code under test accepts.
 * Tests only implement the members the SDK actually calls.
 */
export function fake<T>(value: object): T {
  return value as T;
}

/** The URL string of a fetch input, as passed by the SDK. */
export function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

/** The SDK sends plain-object headers; expose them as a typed record. */
export function headerRecord(init: RequestInit | undefined): Record<string, string | undefined> {
  const headers = init?.headers;
  assert.ok(
    headers !== undefined && !(headers instanceof Headers) && !Array.isArray(headers),
    'expected plain-object request headers',
  );
  return headers;
}

/** The SDK sends string request bodies; return the exact text. */
export function bodyText(init: RequestInit | undefined): string {
  const body = init?.body;
  if (typeof body !== 'string') assert.fail('expected a string request body');
  return body;
}

/** The request fields the tests inspect, captured from one fetch call. */
export interface RecordedRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string | undefined>;
  body: string | undefined;
  credentials: RequestCredentials | undefined;
  redirect: RequestRedirect | undefined;
  cache: RequestCache | undefined;
}

export function recordRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): RecordedRequest {
  return {
    url: requestUrl(input),
    method: init?.method,
    headers: init?.headers === undefined ? {} : headerRecord(init),
    body: typeof init?.body === 'string' ? init.body : undefined,
    credentials: init?.credentials,
    redirect: init?.redirect,
    cache: init?.cache,
  };
}

/** Parse a JSON string request body into a plain record. */
export function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  const value: unknown = JSON.parse(bodyText(init));
  assert.ok(isRecord(value), 'expected a JSON object body');
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A JSON-RPC request as sent by viem's HTTP transport. */
export interface JsonRpcRequest {
  jsonrpc?: string;
  id: number;
  method: string;
  params: unknown[];
}

/** The `eth_call` transaction object sent by viem. */
export interface EthCall {
  to: `0x${string}`;
  data: `0x${string}`;
  from?: unknown;
  value?: unknown;
}

import assert from 'node:assert/strict';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

/** Deferred teardown registered by a test and drained in `afterEach`. */
export type Cleanup = () => Promise<void>;

export type ToolCallResult = Awaited<ReturnType<Client['callTool']>>;
export type ListedTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

/** Returns the text of one tool-result content item, validated against the MCP result schema. */
export function toolText(result: ToolCallResult, index = 0): string {
  const item = CallToolResultSchema.parse(result).content[index];
  assert.ok(item?.type === 'text', `content[${index}] is not a text item`);
  return item.text;
}

/** Number of content items in a tool result, validated against the MCP result schema. */
export function toolContentLength(result: ToolCallResult): number {
  return CallToolResultSchema.parse(result).content.length;
}

/** Reads one JSON Schema keyword of a listed tool's input property. */
export function schemaKeyword(tool: ListedTool, property: string, keyword: string): unknown {
  const schema = tool.inputSchema.properties?.[property];
  assert.ok(schema, `${tool.name} has no ${property} input property`);
  return Reflect.get(schema, keyword);
}

/** Names of a listed tool's input properties. */
export function schemaPropertyNames(tool: ListedTool): string[] {
  return Object.keys(tool.inputSchema.properties ?? {});
}

/** A JSON-RPC call recorded by a fixture: `params` hold block selectors or an eth_call object. */
export interface RpcTrace {
  method: string;
  params: unknown[];
}

/** An outbound request recorded by a fixture's fetch interceptor. */
export interface FetchTrace {
  url: string;
  method: string;
  headers: string[];
}

/** One Multicall3 sub-call recorded by a fixture. */
export interface MulticallTrace {
  target?: string;
  functionName: string;
  allowFailure: boolean;
  success: boolean;
}

/**
 * Parses fixture trace lines. The JSON is written by this package's own fixtures, so each
 * caller states the recorded shape it relies on.
 */
export function parseTraces<T>(output: string, prefix: string): T[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix))
    .map((line): T => JSON.parse(line.slice(prefix.length)));
}

/** The `eth_call` transaction object of a recorded call. */
export function callObject(call: RpcTrace): Record<string, unknown> & { to: string } {
  const [transaction] = call.params;
  assert.ok(transaction !== null && typeof transaction === 'object', 'Expected an eth_call object');
  const to: unknown = Reflect.get(transaction, 'to');
  assert.ok(typeof to === 'string', 'Expected an eth_call target');
  return {
    to,
    data: Reflect.get(transaction, 'data'),
    from: Reflect.get(transaction, 'from'),
    value: Reflect.get(transaction, 'value'),
  };
}

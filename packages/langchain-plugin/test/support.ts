import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { OpenSignetTools } from '../dist/index.js';

export type Tool = OpenSignetTools[number];
export type ToolNamed<N extends Tool['name']> = Extract<Tool, { name: N }>;

/** Finds a configured tool by its literal name and narrows it to that tool's exact type. */
export function toolNamed<N extends Tool['name']>(tools: OpenSignetTools, name: N): ToolNamed<N> {
  const tool = tools.find((candidate): candidate is ToolNamed<N> => candidate.name === name);
  assert.ok(tool, `${name} is configured`);
  return tool;
}

/**
 * Model-supplied tool input is untyped at runtime. These calls deliberately bypass the
 * compile-time input type to prove the runtime schema rejects or validates the payload.
 */
export function invokeUntyped(tool: Tool, input: unknown): Promise<unknown> {
  const invoke = tool.invoke as (this: Tool, value: unknown) => Promise<unknown>;
  return invoke.call(tool, input);
}

export interface ObjectSchema {
  type?: unknown;
  required?: string[];
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
}

/** Provider schemas are loosely typed JSON Schema; read the object-schema fields under test. */
export function objectSchema(value: unknown): ObjectSchema {
  assert.ok(typeof value === 'object' && value !== null, 'tool parameters are an object schema');
  return value as ObjectSchema;
}

export function serverPort(server: Server): number {
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  return address.port;
}

export function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

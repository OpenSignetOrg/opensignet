import assert from 'node:assert/strict';
import { mode } from './fixtures/api-fixture.ts';

// Preloaded (`node --import`) in front of the real built MCP server and SDK. Only the API
// boundary and, for the discovery cases, the tools/list answer are replaced.
console.error(`CREWAI_CHILD ${JSON.stringify({ pid: process.pid, writes: false })}`);

interface ListedTool {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}
interface ToolListMessage {
  result?: { tools?: ListedTool[] };
}

const writeStdout = process.stdout.write.bind(process.stdout);
// Replaces every stdout.write overload; only the chunk is inspected and the remaining
// encoding/callback arguments are forwarded unchanged.
process.stdout.write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
  if (['missing-tool', 'duplicate-tool', 'invalid-schema'].includes(mode)) {
    try {
      // MCP stdio frames are JSON-RPC messages; only tools/list results are rewritten.
      const message = JSON.parse(String(chunk)) as ToolListMessage;
      const tools = message.result?.tools;
      if (Array.isArray(tools)) {
        const target = tools.find((tool) => tool.name === 'get_renewal_status');
        assert.ok(target);
        if (mode === 'missing-tool' && message.result)
          message.result.tools = tools.filter((tool) => tool !== target);
        if (mode === 'duplicate-tool') tools.push(target);
        if (mode === 'invalid-schema')
          target.inputSchema.properties = {
            ...target.inputSchema.properties,
            apiUrl: { type: 'string' },
          };
        chunk = `${JSON.stringify(message)}\n`;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  const written: unknown = Reflect.apply(writeStdout, process.stdout, [chunk, ...args]);
  return written === true;
};

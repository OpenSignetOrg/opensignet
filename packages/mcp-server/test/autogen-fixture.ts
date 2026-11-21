// Synthetic test-process preload. Never loaded by the runnable Python examples.
// The actual OpenSignet Node MCP server and SDK still handle every tool invocation; only
// their HTTPS boundary to the OpenSignet API is replaced (see the shared fixture).
import './fixtures/api-fixture.ts';

console.error(`AUTOGEN_CHILD_PID ${process.pid}`);
console.error('AUTOGEN_TEST_OBSERVATIONS synthetic API fixture; no live identity or renewal');

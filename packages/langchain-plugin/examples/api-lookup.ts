import { parseArgs } from 'node:util';
import { OpenSignet } from '@opensignet/sdk';
import { createOpenSignetTools, type OpenSignetTools } from '@opensignet/langchain-plugin';

type Tool = OpenSignetTools[number];
const isLookup = (tool: Tool): tool is Extract<Tool, { name: 'lookup_agent' }> =>
  tool.name === 'lookup_agent';

const { values } = parseArgs({ options: { agent: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('node examples/api-lookup.ts --agent UUID');
  console.log('OPENSIGNET_API_KEY is optional host configuration, never a tool argument.');
} else {
  const apiClient = new OpenSignet({ apiKey: process.env.OPENSIGNET_API_KEY });
  const lookup = createOpenSignetTools({ apiClient }).find(isLookup);
  try {
    if (!lookup || values.agent === undefined) throw new Error('A valid agent UUID is required.');
    const result = await lookup.invoke({ agentId: values.agent });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error('A valid agent UUID is required. No API result was confirmed.');
    process.exitCode = 1;
  }
}

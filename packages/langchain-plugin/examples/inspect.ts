import { parseArgs } from 'node:util';
import { createOpenSignetTools, type OpenSignetTools } from '@opensignet/langchain-plugin';

type Tool = OpenSignetTools[number];
const isRenewal = (tool: Tool): tool is Extract<Tool, { name: 'inspect_agent_renewal' }> =>
  tool.name === 'inspect_agent_renewal';

const { values } = parseArgs({
  options: {
    domain: { type: 'string' },
    token: { type: 'string' },
    owner: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log('node examples/inspect.ts (--domain DOMAIN | --token ID) [--owner ADDRESS]');
} else {
  const input = {
    ...(values.domain === undefined ? {} : { domain: values.domain }),
    ...(values.token === undefined ? {} : { tokenId: values.token }),
    ...(values.owner === undefined ? {} : { expectedOwner: values.owner }),
  };
  const tools = createOpenSignetTools();
  try {
    const inspection = tools.find(isRenewal);
    if (!inspection) throw new Error('The renewal tool is not configured.');
    const result = await inspection.invoke(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error('Invalid tool input. Use --help for the accepted arguments.');
    process.exitCode = 1;
  }
}

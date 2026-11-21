import { parseArgs } from 'node:util';
import { OpenSignet } from '@opensignet/sdk';
import { createOpenSignetTools, type OpenSignetTools } from '@opensignet/langchain-plugin';

type Tool = OpenSignetTools[number];
const isRenewal = (tool: Tool): tool is Extract<Tool, { name: 'get_renewal_status' }> =>
  tool.name === 'get_renewal_status';

const { values } = parseArgs({ options: { agent: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('node examples/renewal.ts --agent UUID');
  console.log(
    'OPENSIGNET_API_KEY (the identity’s key) is host configuration, never a tool argument.',
  );
} else {
  const apiClient = new OpenSignet({
    apiUrl: process.env.OPENSIGNET_API_URL,
    apiKey: process.env.OPENSIGNET_API_KEY,
  });
  const renewal = createOpenSignetTools({ apiClient }).find(isRenewal);
  try {
    if (!renewal || values.agent === undefined) throw new Error('A valid agent UUID is required.');
    const result = await renewal.invoke({ agentId: values.agent });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error('A valid agent UUID is required. No renewal status was read.');
    process.exitCode = 1;
  }
}

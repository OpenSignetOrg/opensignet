import { parseArgs } from 'node:util';
import { createOpenSignetTools, type OpenSignetTools } from '@opensignet/langchain-plugin';

type Tool = OpenSignetTools[number];
const isPreparation = (tool: Tool): tool is Extract<Tool, { name: 'prepare_auto_renew_change' }> =>
  tool.name === 'prepare_auto_renew_change';

const { values } = parseArgs({
  options: {
    token: { type: 'string' },
    owner: { type: 'string' },
    enabled: { type: 'string' },
    'builder-code': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log(
    'node examples/prepare.ts --token ID --owner ADDRESS --enabled true|false --builder-code CODE',
  );
  console.log(
    'Outputs an unsigned plan only. No wallet, approval, payment or execution is performed.',
  );
} else if (values.enabled !== 'true' && values.enabled !== 'false') {
  console.error('--enabled must be explicitly true or false. Nothing was prepared.');
  process.exitCode = 1;
} else {
  const preparation = createOpenSignetTools({ includeUnsignedPlans: true }).find(isPreparation);
  const { token, owner } = values;
  const builderCode = values['builder-code'];
  try {
    if (!preparation || token === undefined || owner === undefined || builderCode === undefined) {
      throw new Error('Every plan input is required.');
    }
    const result = await preparation.invoke({
      tokenId: token,
      expectedOwner: owner,
      enabled: values.enabled === 'true',
      builderCode,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error('Invalid plan inputs. Use --help for the accepted arguments.');
    process.exitCode = 1;
  }
}

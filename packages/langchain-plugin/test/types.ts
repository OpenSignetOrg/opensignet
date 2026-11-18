import { createOpenSignetTools, type OpenSignetToolResult } from '../dist/index.js';
import type { AgentRenewalInspection, AutoRenewChangePlan } from '@opensignet/sdk';

// Compiled only. These calls prove the public tools preserve SDK input/output
// types; this file is never executed or emitted by the test suite.
async function contract() {
  const tools = createOpenSignetTools({ includeUnsignedPlans: true });
  const renewal = tools.find((candidate) => candidate.name === 'inspect_agent_renewal')!;
  const result: OpenSignetToolResult<AgentRenewalInspection> = await renewal.invoke({
    tokenId: '1',
  });
  if (result.ok && result.data.status === 'found') {
    const token: string = result.data.identity.tokenId;
    const owner: `0x${string}` = result.data.identity.nftOwner;
    void [token, owner];
  }
  // @ts-expect-error Token IDs must not lose precision as JSON numbers.
  await renewal.invoke({ tokenId: 1 });
  const prepare = tools.find((candidate) => candidate.name === 'prepare_auto_renew_change')!;
  const plan: OpenSignetToolResult<AutoRenewChangePlan> = await prepare.invoke({
    tokenId: '1',
    expectedOwner: '0x1111111111111111111111111111111111111111',
    enabled: false,
    builderCode: 'example_app',
  });
  void plan;
  // @ts-expect-error All four primitive planning fields are mandatory.
  await prepare.invoke({ tokenId: '1', enabled: false });
  // @ts-expect-error Host configuration accepts clients, not raw model RPC URLs.
  createOpenSignetTools({ rpcUrl: 'https://untrusted.example.invalid' });
}
void contract;

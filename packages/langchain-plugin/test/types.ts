import { OpenSignet, type DomainRenewalStatus } from '@opensignet/sdk';
import { createOpenSignetTools, type OpenSignetToolResult } from '../dist/index.js';

// Compiled only. These calls prove the public tools preserve SDK input/output
// types; this file is never executed or emitted by the test suite.
async function contract() {
  const apiClient = new OpenSignet({ apiKey: 'host-configured' });
  const tools = createOpenSignetTools({ apiClient, allowRenewalChanges: true });
  const renewal = tools.find((candidate) => candidate.name === 'get_renewal_status')!;
  const result: OpenSignetToolResult<DomainRenewalStatus> = await renewal.invoke({
    agentId: '11111111-1111-4111-8111-111111111111',
  });
  if (result.ok) {
    const price: string | null = result.data.price;
    const ready: boolean = result.data.ready;
    void [price, ready];
  }
  const change = tools.find((candidate) => candidate.name === 'set_auto_renew')!;
  // @ts-expect-error `enabled` must be a boolean, never text a model guessed.
  await change.invoke({ agentId: '11111111-1111-4111-8111-111111111111', enabled: 'yes' });
  // @ts-expect-error Every tool needs a host-configured client.
  createOpenSignetTools({});
  // @ts-expect-error Host configuration accepts clients, not raw model endpoints.
  createOpenSignetTools({ apiClient, apiUrl: 'https://untrusted.example.invalid' });
}
void contract;

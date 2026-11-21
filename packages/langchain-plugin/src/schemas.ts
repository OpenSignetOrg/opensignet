import { z } from 'zod';

const agentId = z.string().uuid().describe('OpenSignet agent ID (UUID).');

export const agentLookupSchema = z.object({ agentId }).strict();
export const registrationStatusSchema = z.object({ registrationId: z.string().uuid() }).strict();
export const renewalStatusSchema = z.object({ agentId }).strict();
export const servicePlanSchema = z.object({ agentId }).strict();

export const autoRenewSwitchSchema = z
  .object({
    agentId,
    enabled: z
      .boolean()
      .describe('true to renew the domain automatically each year, false to stop.'),
  })
  .strict();

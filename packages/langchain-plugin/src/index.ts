import { tool } from '@langchain/core/tools';
import {
  agentLookupSchema,
  autoRenewSwitchSchema,
  registrationStatusSchema,
  renewalStatusSchema,
  servicePlanSchema,
} from './schemas.js';
import type {
  OpenSignetToolErrorCode,
  OpenSignetToolResult,
  OpenSignetToolsOptions,
} from './types.js';

export {
  agentLookupSchema,
  autoRenewSwitchSchema,
  registrationStatusSchema,
  renewalStatusSchema,
  servicePlanSchema,
} from './schemas.js';
export type {
  OpenSignetToolErrorCode,
  OpenSignetToolResult,
  OpenSignetToolsOptions,
} from './types.js';

/** The plain-language answer for each refusal a tool can report. */
const messages = {
  API_UNAVAILABLE: 'The OpenSignet API call failed. Nothing was confirmed or changed.',
  RENEWAL_APPROVAL_REQUIRED:
    'Renewing from the OpenSignet wallet needs the owner’s approval once, on opensignet.com. Nothing was changed.',
  CARD_UNAVAILABLE:
    'This domain renews on a card and none is saved. The owner adds one on opensignet.com. Nothing was changed.',
  DOMAIN_NOT_REGISTERED: 'The domain is still being registered. Try again once it is active.',
} satisfies Record<OpenSignetToolErrorCode, string>;

/** The SDK reports API refusals as `HTTP <status>[<CODE>]: …`; only known codes are surfaced. */
function refusal(error: unknown): OpenSignetToolErrorCode {
  const code = error instanceof Error ? /\[([A-Z_]+)\]/.exec(error.message)?.[1] : undefined;
  return code !== undefined && code in messages && code !== 'API_UNAVAILABLE'
    ? (code as OpenSignetToolErrorCode)
    : 'API_UNAVAILABLE';
}

async function call<T>(run: () => Promise<T>): Promise<OpenSignetToolResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    const code = refusal(error);
    return { ok: false, error: { code, message: messages[code] } };
  }
}

/**
 * Real LangChain tools over the OpenSignet API. They read identities, registrations, plans and
 * renewals; only `set_auto_renew`, when the host allows it, changes anything. No tool signs a
 * transaction, pays, or accepts an endpoint or credential from the model.
 */
export function createOpenSignetTools(options: OpenSignetToolsOptions) {
  const { apiClient } = options;
  const reads = [
    tool((input) => call(() => apiClient.getRenewal(input.agentId)), {
      name: 'get_renewal_status',
      description:
        'How the identity’s domain renews: whether automatic renewal is on, how it is paid (OpenSignet wallet or card), its yearly price in USDC atomic units, when it is charged (30 to 7 days before expiry), the wallet balance and approval, and the first thing in the way (issue.code, issue.message).',
      schema: renewalStatusSchema,
    }),
    tool((input) => call(() => apiClient.getServicePlan(input.agentId)), {
      name: 'get_service_plan',
      description:
        'The limits the identity has from its account plan, and how the plan renews. Plans are changed by a person on opensignet.com, not through tools.',
      schema: servicePlanSchema,
    }),
    tool((input) => call(() => apiClient.getAgentById(input.agentId)), {
      name: 'lookup_agent',
      description: 'Read one OpenSignet identity record with the host-configured client.',
      schema: agentLookupSchema,
    }),
    tool((input) => call(() => apiClient.getRegistration(input.registrationId)), {
      name: 'get_registration_status',
      description:
        'Read one registration status once using the host-configured payer authentication, which may request an API-auth signMessage. An API key alone is insufficient. Does not register, resume, poll, retry a payment or execute a transaction.',
      schema: registrationStatusSchema,
    }),
  ];
  const changes =
    options.allowRenewalChanges === true
      ? [
          tool((input) => call(() => apiClient.setAutoRenew(input.agentId, input.enabled)), {
            name: 'set_auto_renew',
            description:
              'Turn automatic renewal of the identity’s domain on or off. Renewing from the OpenSignet wallet needs the owner’s approval once on opensignet.com; until then turning it on returns RENEWAL_APPROVAL_REQUIRED. Turning it off means the domain expires unless renewed; the owner is still reminded before it does.',
            schema: autoRenewSwitchSchema,
          }),
        ]
      : [];
  return [...reads, ...changes];
}

export type OpenSignetTools = ReturnType<typeof createOpenSignetTools>;

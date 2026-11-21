# @opensignet/langchain-plugin

OpenSignet is the agent-native identity and communications infrastructure.

Typed LangChain tools for OpenSignet: read an identity, its registration, its plan and how its
domain renews, and, when the host allows it, turn automatic renewal on or off. Uses the real
`@langchain/core/tools` API and the public OpenSignet SDK. No model API key or paid LLM is
needed to invoke these tools.

These examples use version `0.1.0` with SDK `0.1.0`. For local development, build the SDK
followed by this package from the public workspace checkout.

## Install

```bash
npm install @opensignet/langchain-plugin@0.1.0 @opensignet/sdk@^0.1.0 @langchain/core@^1.2.11
```

Requires Node.js 20 or newer and ESM. Tested against `@langchain/core` 1.2.11 and Zod 3.25.76.
No `langchain`, LangGraph, or model-provider package is required.

## Create the tools

```js
import { OpenSignet } from '@opensignet/sdk';
import { createOpenSignetTools } from '@opensignet/langchain-plugin';

const apiClient = new OpenSignet({ apiKey: process.env.OPENSIGNET_API_KEY });
const tools = createOpenSignetTools({ apiClient });
const renewal = tools.find((tool) => tool.name === 'get_renewal_status');
const result = await renewal.invoke({ agentId: '11111111-1111-4111-8111-111111111111' });
```

`createOpenSignetTools()` returns genuine typed LangChain tools. Pass the array to an agent's
tools configuration, or call `invoke` directly; a LangChain ToolCall envelope also works and
returns a ToolMessage.

| Tool                      | What it does                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `get_renewal_status`      | Whether the domain renews, how it is paid, its price, the charge window and what stands in the way |
| `get_service_plan`        | The identity's limits from its account plan, and how the plan renews                               |
| `lookup_agent`            | One identity record                                                                                |
| `get_registration_status` | One registration's status, read once with the payer's wallet authentication                        |
| `set_auto_renew`          | Only with `allowRenewalChanges: true`: turns the domain's automatic renewal on or off              |

Successful calls return `{ ok: true, data }` with the SDK result unchanged. Refusals return
`{ ok: false, error: { code, message } }` in plain language: `RENEWAL_APPROVAL_REQUIRED`,
`CARD_UNAVAILABLE`, `DOMAIN_NOT_REGISTERED`, or `API_UNAVAILABLE` for anything else. Invalid
tool arguments raise LangChain's `ToolInputParsingException` before any request.

## Renewal

OpenSignet charges each renewal when it falls due, 30 to 7 days before the domain expires,
from the account's OpenSignet wallet or its saved card. No tool signs or sends a transaction.
`get_renewal_status` reports `ready` and, when something is in the way, `issue.code` and
`issue.message` (for example `wallet_balance_low`).

```js
const tools = createOpenSignetTools({ apiClient, allowRenewalChanges: true });
const change = tools.find((tool) => tool.name === 'set_auto_renew');
await change.invoke({ agentId, enabled: false });
```

Renewing from the OpenSignet wallet needs the owner's approval once, on opensignet.com; until
then turning it on returns `RENEWAL_APPROVAL_REQUIRED`. Code switches renewal within that
approval and can never widen what the wallet may pay. Turning it off means the domain expires
unless it is renewed; the owner is still reminded before it does.

## Trusted configuration

Options are application configuration, never model arguments:

| Option                | Behavior                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| `apiClient`           | Required. The host-configured `OpenSignet` SDK instance every tool calls. |
| `allowRenewalChanges` | Only literal `true` adds `set_auto_renew`. Defaults to false.             |

Use the identity's own API key, kept in a host secret store. Do not place API URLs, API keys
or private keys in tool arguments; unknown fields are rejected.

**An ordinary API key alone does not authorize registration-status reads.** The SDK requires
the payer's configured wallet authentication or an authenticated session with
`registrationExpectedPayer`. A host-configured wallet may be asked to `signMessage` for API
authentication; that is not `signTypedData`, a payment, or a transaction. The SDK checks the
response's authenticated payer and registration ID.

The plugin does not configure tracing or log inputs, outputs, or authentication. Your
application's LangChain/LangSmith callbacks may record tool inputs and results; review the
tracing policy before enabling protected reads.

## Run and test locally

```bash
pnpm --filter @opensignet/sdk build
pnpm --filter @opensignet/langchain-plugin build
pnpm --filter @opensignet/langchain-plugin test
cd packages/langchain-plugin
node examples/renewal.ts --help
node examples/api-lookup.ts --help
```

The examples are TypeScript and run from a source checkout with Node 22.18 or newer, which
strips types natively; Node does not strip types inside `node_modules`.

Tests use real LangChain `invoke`, provider-schema conversion, the actual SDK and a local HTTP
API stand-in. A disposable local signer tests API authentication only; it is never funded,
persisted, or printed. No paid model, live account, or API credential is needed.

## Sources and license

Apache-2.0 for this package. Dependencies retain their own licenses: the SDK is
Apache-2.0; LangChain core and Zod are MIT. TypeScript is Apache-2.0.
See `LICENSE` and `NOTICE`.

- [Official LangChain tools guide](https://docs.langchain.com/oss/javascript/langchain/tools)
- [Official core tool implementation](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/tools/index.ts)
- [Official LangChain core license](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/LICENSE)
- [OpenSignet framework guide](https://docs.opensignet.com/frameworks/langchain)
- [Public SDK source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/sdk)

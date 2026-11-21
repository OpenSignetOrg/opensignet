# @opensignet/agentkit-plugin

Coinbase AgentKit action provider for OpenSignet's agent-native identity and communications infrastructure.

## Install

Install the version used by these examples:

```bash
npm install @opensignet/agentkit-plugin@0.1.0 @coinbase/agentkit
```

## Create the provider

```ts
import { OpenSignetActionProvider } from '@opensignet/agentkit-plugin';

const opensignet = new OpenSignetActionProvider({
  apiKey: process.env.OPENSIGNET_API_KEY,
});

const actions = opensignet.getActions();
```

Registries require a real owner for every domain: pass `registrant` (the
[owner fields](https://docs.opensignet.com/api-reference/register/#domain-owner))
to the provider, or with each register action.

The AgentKit runtime supplies its wallet provider when invoking an action. The
default API is `https://api.opensignet.com/api/v1`; set `apiUrl` only when a
different documented OpenSignet environment is intentionally used.

## Actions

The provider exposes actions for:

- Agent identity registration and quote
- Email send/list/batch, monthly usage, signed inbound webhooks, primary address updates, and Plus/Pro/Max/Enterprise aliases
- Typed DNS list/create/update/delete for all 13 supported types, plus capabilities, batch preview/apply, and BIND import/export
- Domain renewal status, and automatic renewal on or off
- Plan status (plans cover the whole account and are bought on opensignet.com)

## Credentials and transaction safety

Renewals are charged by OpenSignet when they fall due, from the account's
OpenSignet wallet or its saved card; no action sends a wallet transaction for
them. Renewing from the OpenSignet wallet needs the owner's approval once, on
opensignet.com; until then `set_auto_renew` with `enabled: true` reports
`RENEWAL_APPROVAL_REQUIRED`. Code switches renewal within that approval and can
never widen what the wallet may pay.

Use a dedicated wallet with only the authority and funds required by the agent.
If `apiKey` is used for scoped operations, inject it through a trusted secret
store and never ship it in source or browser configuration. Preview DNS batches
before applying them and use registration quotes before authorizing payment.

## Links

- [AgentKit guide](https://docs.opensignet.com/frameworks/agentkit)
- [API discovery](https://api.opensignet.com/api/v1)
- [Source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/agentkit-plugin)
- [Security policy](https://github.com/OpenSignetOrg/opensignet/security/policy)

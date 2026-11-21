# @opensignet/eliza-plugin

ElizaOS actions for OpenSignet's agent-native identity and communications infrastructure.

## Install

Install the version used by these examples:

```bash
npm install @opensignet/eliza-plugin@0.1.0 @elizaos/core
```

## Add the plugin

```ts
import openSignetPlugin from '@opensignet/eliza-plugin';

export const character = {
  name: 'Domain Agent',
  plugins: [openSignetPlugin],
};
```

## Actions

The plugin gives Eliza agents a complete OpenSignet lifecycle surface:

- Registration quote and x402 registration
- Agent email send/list/batch, monthly usage, signed inbound webhooks, primary address updates, and Plus/Pro/Max/Enterprise aliases
- Typed DNS management for all 13 supported types, including capabilities, revision-safe batches, and BIND import/export
- Domain renewal status, and automatic renewal on or off
- Plan status (plans cover the whole account and are bought on opensignet.com)

## Runtime configuration

The default API is `https://api.opensignet.com/api/v1`. Configure
`OPENSIGNET_API_URL` only for a documented alternate environment.

- `OPENSIGNET_API_KEY` authorizes agent-scoped DNS, email, and management calls.
- `AGENT_PRIVATE_KEY` is needed only for wallet-authorized or paid operations.
- `OPENSIGNET_REGISTRANT` is the domain owner as JSON; registries require it for
  every domain the agent registers. It stays out of public WHOIS wherever the
  registry allows it.
- `OPENSIGNET_NETWORK` defaults to `base`.
- `BASE_RPC_URL` optionally selects the Base RPC used for wallet operations.

Inject credentials with the runtime's secret facility. Do not place a private
key or API key in a character file, repository, command line, or log.

Renewals are charged by OpenSignet when they fall due, from the account's
OpenSignet wallet or its saved card. `SET_AUTO_RENEW` turns a domain's automatic
renewal on or off ("turn off auto renew for <agent id>"). Renewing from the
OpenSignet wallet needs the owner's approval once, on opensignet.com; code can
switch renewal within that approval but never widen what the wallet may pay.

## Links

- [ElizaOS guide](https://docs.opensignet.com/frameworks/elizaos)
- [API discovery](https://api.opensignet.com/api/v1)
- [Source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/eliza-plugin)
- [Security policy](https://github.com/OpenSignetOrg/opensignet/security/policy)

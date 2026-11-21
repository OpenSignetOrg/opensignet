# @opensignet/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for OpenSignet.

It lets MCP-compatible clients discover and manage agent identities through the
[OpenSignet API](https://api.opensignet.com/api/v1): domains and their renewal,
DNS, email and plans.

The server requires Node.js 20 or newer and communicates over standard input
and output. It does not open a public listener.

## Versions

These examples use MCP and SDK **0.1.0**, coordinated with the standalone Python
integrations. For local development, build from the reviewed checkout's root:

```bash
pnpm --filter @opensignet/shared build
pnpm --filter @opensignet/sdk build
pnpm --filter @opensignet/mcp-server build
node packages/mcp-server/dist/index.js
```

## Run

Run the pinned MCP server:

```bash
npx -y @opensignet/mcp-server@0.1.0
```

For a persistent installation:

```bash
npm install -g @opensignet/mcp-server@0.1.0
opensignet-mcp
```

## Default tools

The server starts in read-only mode. It advertises tools that read public or
authorized account state:

- `check_domain_availability` and `quote_registration`
- `lookup_agent` and `get_agent`
- `list_agent_email` and `get_agent_email_usage`
- `get_dns_capabilities`, `list_dns_records`, and `export_dns_zone`
- `get_renewal_status` and `get_service_plan`

An API key may authorize additional reads, but merely supplying one never enables
mutation tools.

## Renewal

OpenSignet charges each renewal when it falls due, 30 to 7 days before the domain
expires, from the account's OpenSignet wallet or its saved card. No tool sends a
wallet transaction for it.

- `get_renewal_status` reports whether automatic renewal is on, how it is paid,
  the yearly price (USDC atomic units), the charge window, the wallet's balance
  and approval, `ready`, and the first thing in the way as `issue.code` and a
  plain `issue.message`.
- `set_auto_renew` (a write tool) turns it on or off with `{"agentId": "…",
"enabled": false}`. Renewing from the OpenSignet wallet needs the owner's
  approval once, on opensignet.com; until then turning it on fails with
  `RENEWAL_APPROVAL_REQUIRED`. Code switches renewal within that approval and
  can never widen what the wallet may pay.

See the [renewal guide](https://docs.opensignet.com/guides/renewal/).

## Framework examples

- [CrewAI native Python MCP](examples/crewai/README.md): read-only availability,
  quote and renewal tools using official core-native APIs. Read its
  [scoped security note](examples/crewai/README.md#security-note); functional
  tests are not a clean dependency audit.
- [Microsoft AutoGen Python McpWorkbench](examples/autogen/README.md): allowlisted
  read-only availability, quote and renewal tools.
- [LangChain TypeScript tools](https://docs.opensignet.com/frameworks/langchain/):
  separate `@opensignet/langchain-plugin`; its examples target 0.1.0. Use its
  matching reviewed source build for local development.

Python dependencies are installed separately; npm supplies the Node MCP server,
not the frameworks. The deterministic flows need no paid model and send no live
wallet transaction. Use trusted fixed executable paths and keep the stdio child
environment free of unrelated credentials. The exact CrewAI recipe uses no
Chroma client, collections, embeddings, server or memory. Known Chroma advisories
also concern Python-client use of poisoned collection configuration, not just
servers; consult the linked security note before extending the recipe. No
general dependency-safety claim is made.

## Read-only configuration

Start without a signing credential for discovery, lookup, search, and other
read-only operations. For example:

```json
{
  "mcpServers": {
    "opensignet": {
      "command": "npx",
      "args": ["-y", "@opensignet/mcp-server@0.1.0"],
      "env": {
        "OPENSIGNET_API_URL": "https://api.opensignet.com/api/v1"
      }
    }
  }
}
```

This remains read-only even if the MCP process receives an ambient API key or
wallet credential.

## Enabling write tools

Write tools are omitted from discovery and blocked at dispatch unless
`OPENSIGNET_ENABLE_WRITE_TOOLS` is set to the exact value `true`. Unset or exact
`false` keeps read-only mode. Empty, mixed-case, numeric, whitespace-padded, or
otherwise malformed values stop startup rather than guessing intent.

The opt-in exposes registration, email sending/configuration, email deletion,
DNS mutations and turning automatic renewal on or off. Plans are not sold through tools: they cover the whole account and a
person buys or changes them on opensignet.com. Configure the nonsecret
opt-in in the MCP process environment, then inject only the narrowly scoped API
or signing credential required by the selected operation through a trusted
secret-aware launcher. Do not place either credential in MCP client JSON.

## Input framing

The stdio transport limits accumulated, unprocessed input to 10 MiB
(10,485,760 bytes), including JSON framing. Oversized input clears the buffer
and closes the transport without dispatching the incomplete request. The client
must reconnect after an overflow and must not blindly replay a write whose
outcome is unknown. This transport bound is separate from API payload limits;
larger payloads are not automatically supported by splitting a single JSON line.

## Domain owner

Registries require a real owner (registrant) for every domain. Pass `registrant`
to `register_agent`, or set `OPENSIGNET_REGISTRANT` to the owner's details as
JSON once for the server. The fields are listed in the
[register reference](https://docs.opensignet.com/api-reference/register/#domain-owner).

## Signing credentials

Supply `AGENT_PRIVATE_KEY` only when an enabled operation requires a wallet
signature. Inject it through a trusted external secret store or secret-aware
launcher; never paste it into client JSON, source code, shell history, logs, or a
repository. Use a dedicated wallet with only the authority and funds required
for the intended operation.

An identity's API key (`OPENSIGNET_API_KEY`) can call the endpoints of that
identity, including the renewal switch, but cannot sign wallet transactions.

## Pricing options

Registration costs the domain at its live registrar price, plus any optional
Basename, ENS name and network gas. Email setup, DNS orchestration and the
OpenSignet Pass are included unless the API response states otherwise.

Optional settings include:

- `registerBasename: true` to add a Basename (off by default)
- `registerEns: false` to skip ENS
- `emailUsername` to customize the primary inbox local part

Every registration starts on the account's plan; plans are never bought during
registration. Use `quote_registration` before signing a payment. Treat the returned quote,
limits, expiry, and renewal amount as authoritative for that request.

## License

Published package releases are licensed under Apache-2.0.

## Links

- [MCP guide](https://docs.opensignet.com/sdk/mcp)
- [API discovery](https://api.opensignet.com/api/v1)
- [Source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/mcp-server)
- [Security policy](https://github.com/OpenSignetOrg/opensignet/security/policy)

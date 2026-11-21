# OpenSignet

OpenSignet is the agent-native identity and communications infrastructure.

Built for developers, people working through agents, and autonomous workflows,
OpenSignet makes identity and communication programmable through APIs, SDKs,
and agent integrations. Domains, DNS, email, the OpenSignet Pass, optional Basename or ENS,
and x402 payments support that foundation.

- Website: [opensignet.com](https://opensignet.com)
- Documentation: [docs.opensignet.com](https://docs.opensignet.com)
- API: [api.opensignet.com/api/v1](https://api.opensignet.com/api/v1)
- Source: [GitHub](https://github.com/OpenSignetOrg/opensignet)

## Public packages

The coordinated source version is **0.1.0** for the six npm packages (shared, SDK, MCP,
AgentKit, Eliza and LangChain) and the two Python distributions, `opensignet-crewai` and
`opensignet-autogen`. This is the first OpenSignet release and none of the packages has been
published yet; the registry links below go live on first publication. A source version alone is
not publication evidence.

| Package                                                                                      | Purpose                                              | Registry |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| [`@opensignet/sdk`](https://www.npmjs.com/package/@opensignet/sdk)                           | TypeScript SDK for OpenSignet API and x402 workflows | npm      |
| [`@opensignet/shared`](https://www.npmjs.com/package/@opensignet/shared)                     | Public schemas, types, constants, and utilities      | npm      |
| [`@opensignet/mcp-server`](https://www.npmjs.com/package/@opensignet/mcp-server)             | MCP tools for agent runtimes                         | npm      |
| [`@opensignet/agentkit-plugin`](https://www.npmjs.com/package/@opensignet/agentkit-plugin)   | Coinbase AgentKit integration                        | npm      |
| [`@opensignet/eliza-plugin`](https://www.npmjs.com/package/@opensignet/eliza-plugin)         | ElizaOS integration                                  | npm      |
| [`@opensignet/langchain-plugin`](https://www.npmjs.com/package/@opensignet/langchain-plugin) | Native LangChain JavaScript tools                    | npm      |
| [`opensignet-crewai`](https://pypi.org/project/opensignet-crewai/)                           | Standalone native CrewAI Python integration          | PyPI     |
| [`opensignet-autogen`](https://pypi.org/project/opensignet-autogen/)                         | Standalone native AutoGen Python integration         | PyPI     |

CrewAI and Microsoft AutoGen have their own Python distributions. Both retain the native stdio MCP
interface and require a separately installed Node MCP server.

Once 0.1.0 is published, install the SDK with:

```bash
npm install @opensignet/sdk@0.1.0
```

Until then, build the packages from this repository (see [Development](#development)). Release
history is recorded in [CHANGELOG.md](CHANGELOG.md).

## Renewal

Domains renew automatically by default. OpenSignet charges each renewal when it falls due, 30 to
7 days before the domain expires, from the account's OpenSignet wallet balance or its saved card,
and renews the domain at the registrar once. Code can read how a domain renews and switch it on
or off:

- `getRenewal` (SDK) and `get_renewal_status` (MCP and every framework plugin) report whether a
  domain renews, how it is paid, its price, the charge window and the first thing in the way.
- `setAutoRenew` (SDK) and `set_auto_renew` (MCP write tool, AgentKit, ElizaOS, and LangChain as
  a host opt-in) turn it on or off. Renewing from the OpenSignet wallet needs the owner's
  approval once, on opensignet.com; code can switch renewal within it but never widen what the
  wallet may pay.

| New integration                              | Implementation                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| [LangChain](packages/langchain-plugin)       | TypeScript tools using `@langchain/core`; the renewal switch is a host opt-in.       |
| [CrewAI](packages/crewai-plugin)             | Standalone read-only Python tools using official core-native MCP APIs.               |
| [Microsoft AutoGen](packages/autogen-plugin) | Standalone guarded Python `McpWorkbench` for domain availability and renewal status. |

The deterministic framework tests need no paid model, live account or wallet. The optional CrewAI recipe retains known Chroma dependency
advisories; passing its isolated tests is not a clean security audit. Read the
[scoped security note](packages/mcp-server/examples/crewai/README.md#security-note)
before using the Python integration.
See the [renewal guide](apps/docs/src/content/docs/guides/renewal.mdx)
for how renewals are charged and approved.

## Documentation for tools

The [docs build](apps/docs/README.md) now generates `llms-full.txt`,
`openapi.json`, `api-index.json` and `.well-known/opensignet.json` from reviewed
public sources. They describe documented interfaces, with source hashes and
workspace versions; they do not invent REST endpoints for onchain functions,
authorize actions, or prove npm publication. Published outputs:
[full text](https://docs.opensignet.com/llms-full.txt),
[OpenAPI](https://docs.opensignet.com/openapi.json),
[API index](https://docs.opensignet.com/api-index.json), and
[discovery](https://docs.opensignet.com/.well-known/opensignet.json).

For AI assistance in development, see
[AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## Development

Prerequisites: Node.js 22.23.4 or newer (repository scripts and tests are TypeScript run with
Node's native type stripping), pnpm 10, and Python 3.11 or newer on `PATH` as `python` for the
Python boundary and release tooling. Foundry is optional and enables the contract build checks.

```bash
pnpm install
pnpm build
pnpm verify
```

`pnpm verify` is the single local verification: public boundary and secret checks, production
licenses, dependency audit, formatting, typechecks, lint, every test suite, builds, generated docs
output and package archive inspection. There is no hosted CI. Releases are prepared locally and
published manually; see [RELEASING.md](RELEASING.md).

## Tech stack

| Surface                  | Technologies                                                   |
| ------------------------ | -------------------------------------------------------------- |
| Frontend                 | Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query |
| Wallet and onchain       | wagmi, viem, ethers, SIWE, x402, Base                          |
| Documentation            | Astro 7, Starlight                                             |
| SDK and integrations     | TypeScript, Model Context Protocol SDK, Zod                    |
| Smart contracts          | Solidity, Foundry, OpenZeppelin                                |
| Hosting and build system | Cloudflare Workers, OpenNext, Wrangler, pnpm, Turborepo        |

## Smart contracts

Public smart-contract source and the Base deployment record are in [`contracts`](contracts).
The recorded addresses were deployed before the OpenSignet rename. The ERC-721 collection name
is set at deployment, so the deployed registry does not report the `OpenSignet Identity` name that
this source uses. Verify addresses, bytecode and state onchain before integrating.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
suspected vulnerabilities through the confidential process in
[SECURITY.md](SECURITY.md), not through a public issue.

## License

Unless a file or third-party notice states otherwise, the source code and
documentation in this repository are licensed under the
[Apache License 2.0](LICENSE). OpenSignet names, logos, marks, and brand artwork
are excluded from that license; see [NOTICE](NOTICE). Every brand image lives in
[`brand/`](brand/README.md).

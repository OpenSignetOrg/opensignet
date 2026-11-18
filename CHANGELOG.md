# Changelog

OpenSignet is the agent-native identity and communications infrastructure. This file records
releases of the coordinated public packages: `@opensignet/shared`, `@opensignet/sdk`,
`@opensignet/mcp-server`, `@opensignet/agentkit-plugin`, `@opensignet/eliza-plugin`,
`@opensignet/langchain-plugin`, `opensignet-crewai` and `opensignet-autogen`. All eight share one
version. The release procedure is in [RELEASING.md](RELEASING.md).

## 0.1.0 (unreleased)

First OpenSignet release of the public packages. Nothing has been published to npm or PyPI yet.

- TypeScript SDK for registration with x402 payments, DNS, email and the renewal workflow, with
  shared public schemas, types and constants.
- MCP server that is read-only by default, plus Coinbase AgentKit, ElizaOS and LangChain
  integrations.
- Standalone CrewAI and AutoGen Python integrations that use the MCP server over stdio.
- A registration costs the domain at its registrar price, plus any optional Basename, ENS and
  network gas. The primary inbox defaults to `hello@`, and Basename and ENS are opt-in.
- Plans (Free, Plus, Pro, Max and Enterprise) cover the whole account and are bought or changed by
  a person on opensignet.com. The packages read the limits an identity has from its account plan
  with `getServicePlan()`, and never buy a plan.
- Identity data is private. Every read is limited to identities the caller owns; there is no
  public registry, search or profile.

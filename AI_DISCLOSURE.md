# AI Assistance Disclosure

OpenSignet is the agent-native identity and communications infrastructure.
AI coding assistants, OpenAI Codex and Anthropic Claude, have assisted its development. We do not
represent AI-assisted work as unaided human coding.

## Human Direction

The founder defines the product, user problems, scope and acceptance criteria,
reviews the resulting work, and makes final product and release decisions.
An agent's output is not permission to sign a transaction, spend funds, change
production services or publish a release. Those actions follow their own
authorization and verification requirements.

## Assisted Work

These assistants have helped with repository inspection, implementation planning, code
editing, tests, failure-path analysis, documentation and release preparation.
The assisted public areas include:

- Resumable registration, payment-state handling and recovery without automatic
  repeat payment after an uncertain outcome.
- Read-only identity and renewal inspection, plus unsigned auto-renew planning.
  Wallet execution requires a separate host-provided human approval callback.
- SDK, MCP, LangChain, CrewAI and AutoGen interfaces and their tests.
- Machine-readable documentation generated from reviewed public sources.
- Conversion of repository tooling and tests to TypeScript, and local verification and release
  tooling.

Package releases are recorded in [CHANGELOG.md](CHANGELOG.md). Code review, automated tests and release artifacts are separate from proof that
a live user workflow has been manually exercised or deployed successfully.

This disclosure describes AI assistance in the publicly available product,
developer tools and documentation.

# OpenSignet With Native CrewAI

This thin example imports the separately installable **`opensignet-crewai`**
Python package. The package uses CrewAI's official native `MCPClient`,
`StdioTransport` and `MCPNativeTool`, backed by the official Python MCP SDK,
to call the separately installed Node.js OpenSignet MCP server. It does not
install `crewai-tools` or `mcpadapt`. The implementation is maintained only in
`packages/crewai-plugin/src/opensignet_crewai`, not duplicated in this example.

The example needs **no LLM, model API key or wallet private key**. Its exact
tool allowlist is:

1. `check_domain_availability`: whether a domain can be registered, with its price.
2. `get_renewal_status`: how an identity's domain renews and what stands in the way.

Both are read-only; write tools are forced off. The renewal read needs the
identity's own API key, which the host passes explicitly.

## Install

Use Python **3.12** and Node.js **20 or later**. The Python lock pins CrewAI
**1.15.21**, MCP **1.28.1**, and transitive dependencies with artifact hashes.
Create a **fresh isolated environment**; installing over the older adapter's
environment would leave its removed dependencies installed. Do not install this
recipe into a backend/VPS or a shared application environment.

From this directory on macOS/Linux:

```sh
python3.12 -m venv .venv-native
.venv-native/bin/python -m pip install --require-hashes -r requirements.lock
```

On Windows PowerShell:

```powershell
py -3.12 -m venv .venv-native
.venv-native/Scripts/python.exe -m pip install --require-hashes -r requirements.lock
```

Install `opensignet-crewai==0.1.0`
in that environment as well. To retain the exact hash-locked runtime graph:

```sh
.venv-native/bin/python -m pip install --no-deps opensignet-crewai==0.1.0
.venv-native/bin/python -m pip check
```

For source development, build `packages/crewai-plugin` with `python -m build` from
the repository root, then replace the distribution name above with the absolute
path to `opensignet_crewai-0.1.0-py3-none-any.whl`. Use the corresponding Windows
Python path on Windows. The built wheel is required; the example does not
silently import an uninstalled source tree.

The SDK, MCP and Python package versions used here are **0.1.0**.
For source validation, build the reviewed public
checkout from its root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @opensignet/shared build
pnpm --filter @opensignet/sdk build
pnpm --filter @opensignet/mcp-server build
```

Consumers can instead install the pinned npm server
in their own project:

```sh
npm install --save-exact @opensignet/mcp-server@0.1.0
```

Point `--server` to that installation's
`node_modules/@opensignet/mcp-server/dist/index.js`, or to
`packages/mcp-server/dist/index.js` in the reviewed source checkout. The example
does not download or execute a package through `npx`. Only run a local executable
and server entry you trust. Paths containing spaces must be quoted.

## Check A Domain And Its Renewal

From this directory:

```sh
.venv-native/bin/python readonly_flow.py --server ../../dist/index.js --domain your-agent.xyz
OPENSIGNET_API_KEY=osk_... .venv-native/bin/python readonly_flow.py \
  --server ../../dist/index.js --agent-id 11111111-1111-4111-8111-111111111111
```

On Windows use `.venv-native/Scripts/python.exe` and set the key with
`$env:OPENSIGNET_API_KEY = '...'`. `--api-key-env NAME` reads the key from another
variable; `--node` selects an explicit Node executable.

The domain check prints the availability answer. The renewal read prints
`renewal` (the full status), `ready`, and `nextStep`: the plain message of the
first thing in the way, or null when nothing is. OpenSignet charges renewals
itself, 30 to 7 days before expiry, from the account's OpenSignet wallet or saved
card; nothing here signs, pays or changes a setting. A failed read, a missing key
or an answer for another identity stops with a clear error and confirms nothing.

## Use The Tools In A Crew

The returned objects are official native `MCPNativeTool` instances, subclassing
CrewAI `BaseTool`. Keep the tool context open through `kickoff()` and provide
your own configured model. Each invocation owns and closes a separate MCP client:

```python
from pathlib import Path
from opensignet_crewai import readonly_tools
from crewai import Agent, Crew, Process, Task

# your_llm is supplied by your application. No model credentials enter Node.
# api_key is the identity's key from your secret store.
with readonly_tools(Path("/trusted/path/to/mcp-server/dist/index.js"), api_key=api_key) as tools:
    reviewer = Agent(
        role="OpenSignet renewal reviewer",
        goal="Report whether a domain will keep renewing, and what to fix if not",
        backstory="You read OpenSignet renewal status and cannot change anything.",
        tools=list(tools.values()),
        llm=your_llm,
        allow_delegation=False,
        cache=False,
        verbose=False,
    )
    task = Task(
        description=(
            "Read the renewal of identity {agent_id}. Say whether it will renew on "
            "its own and, if not, the one thing the owner should do. Never claim a "
            "renewal was paid or changed."
        ),
        expected_output="The renewal status and the next step, or a clear failure.",
        agent=reviewer,
    )
    crew = Crew(agents=[reviewer], tasks=[task], process=Process.sequential,
                cache=False, memory=False, verbose=False)
    # Supply agent_id from your application's user input.
    result = crew.kickoff(inputs=user_inputs)
```

The optional model call can cost money and sends the renewal status to the
selected model provider. It is not part of the paid-model-free test. This example
disables framework telemetry/tracing and never loads a `.env` file. OS process
plumbing is allowlisted; wallet and model keys, `ALLOW_WRITES`, `NODE_OPTIONS` and
ambient OpenSignet settings are not forwarded, and the identity's API key only
when the host passes it. Write tools are forced off.
This is credential minimization, not an OS sandbox against a malicious binary.

Explicit `BaseTool.args_schema` models reject extra, malformed or coerced
arguments (an endpoint or key from the model, a non-UUID agent) before any
request. Discovery rejects missing, duplicated or incompatible canonical tools.
The official client is configured with `max_retries=1`, which in this pinned
version means **one total attempt**, and no tool-list/result caching. Native
30-second connection/discovery/call deadlines remain. A closed context rejects further calls. Framework console output is
suppressed only within this context, preserving machine-readable CLI JSON.

## Security Note

Python dependencies are separate from npm's runtime dependencies and audit.
The lock still includes mandatory ChromaDB 1.1.1 with four known advisories:
[CVE-2026-45829](https://www.hiddenlayer.com/research/chromatoast-served-pre-auth),
[CVE-2026-45830](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb),
[CVE-2026-45831](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb-3),
[CVE-2026-45833](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb-5).
There is also a reported [poisoned-collection configuration risk in the Python client](https://github.com/chroma-core/chroma/issues/6717);
this is not a blanket claim that risk exists only in an HTTP server.

The qualified recipe does not call Chroma clients, collections or embeddings,
run a Chroma server, or enable memory/knowledge/caching. Tests trap those entrypoints
while the native Agent/Crew and full MCP flow run. This bounds the tested recipe,
not the installed library's safety: the Python vulnerability audit is **not clean**.
Enabling memory, remote collections or arbitrary framework capabilities is outside
this scope and needs a separate security review. Do not suppress these advisories
or bypass declared dependency constraints to force an upgrade.

## Test Without Paid Services

After building the reviewed SDK/MCP, run from `packages/mcp-server`:

```sh
node test/crewai-integration.ts
```

From the public repository root, the installed-wheel/artifact verifier is:

```sh
packages/crewai-plugin/.venv-consumer/bin/python -B packages/mcp-server/test/crewai-package.py --dist packages/crewai-plugin/dist -v
```

Replace that Python path with your fresh environment's executable (on Windows,
use its `Scripts/python.exe`). Install the exact local wheel from the supplied
`--dist` directory first. The verifier checks artifact allowlists, license and
dependency metadata, RECORD hashes, installed package bytes and non-editable
provenance, and both CLI entry points outside the source checkout. The native
suite also verifies that the thin example calls the installed package.

It uses this example's `.venv-native` by default. `OPENSIGNET_CREWAI_PYTHON` may point
to another environment installed from this lock plus the built Python wheel. Missing dependencies fail the
suite with installation instructions; it never silently skips or installs them.

The suite starts the actual official Python connector, real Node MCP server and
real SDK. A process-local stand-in replaces the OpenSignet API's answers; it
rejects any write, any other host and any credential on a public read, checks
that each MCP child exits, and fails if a Chroma entrypoint is used. No model,
wallet, chain, live API, customer identity or paid service is contacted.

Regenerate dependencies deliberately with the lock's recorded uv version, then rerun integration:

```sh
uv pip compile requirements.in --python-version 3.12 --universal --generate-hashes --output-file requirements.lock
```

Development checks, from the public repository root (the pinned tools are not
runtime dependencies):

```sh
uvx --from ruff==0.15.6 ruff check packages/crewai-plugin/src/opensignet_crewai packages/mcp-server/examples/crewai/readonly_flow.py packages/mcp-server/test/crewai-integration.py packages/mcp-server/test/crewai-package.py
uvx --from ruff==0.15.6 ruff format --check packages/crewai-plugin/src/opensignet_crewai packages/mcp-server/examples/crewai/readonly_flow.py packages/mcp-server/test/crewai-integration.py packages/mcp-server/test/crewai-package.py
uvx --from pyright==1.1.407 pyright --project packages/mcp-server/examples/crewai/pyrightconfig.json
```

Official references: [CrewAI native MCP integration](https://docs.crewai.com/en/mcp/dsl-integration),
[pinned native client source](https://github.com/crewAIInc/crewAI/blob/1.15.21/lib/crewai/src/crewai/mcp/client.py),
[Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.28.1).

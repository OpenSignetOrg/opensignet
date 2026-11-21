# OpenSignet CrewAI

`opensignet-crewai` is the separately installable Python integration for
OpenSignet's Node.js MCP server. It returns official CrewAI `MCPNativeTool`
objects with strict typed inputs. It uses CrewAI's native `MCPClient` and
`StdioTransport`, not `crewai-tools` or `mcpadapt`.

Version **0.1.0** requires Python **3.12**
and Node.js **20 or later**. The Python package does not bundle or
automatically download Node.js, the MCP server, a model, or wallet credentials.

## Installation

Use a fresh isolated virtual environment, never a shared backend/VPS environment.
Install the matching Python integration and Node MCP server:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install opensignet-crewai==0.1.0
npm install --save-exact @opensignet/mcp-server@0.1.0
```

On Windows use `py -3.12 -m venv .venv` and `.venv/Scripts/python.exe`.
CrewAI 1.15.21 and the Python MCP SDK 1.28.1 are exact direct dependencies.
For the fully pinned, hash-verified transitive environment, install
[`requirements.lock`](https://github.com/OpenSignetOrg/opensignet/blob/main/packages/mcp-server/examples/crewai/requirements.lock)
first, then the reviewed OpenSignet wheel with `--no-deps`, and run
`python -m pip check`. The release's lock and wheel must come from the same
reviewed source. Do not silently upgrade the dependency graph.

## Read-Only Flow

```python
from pathlib import Path
from opensignet_crewai import domain_availability, readonly_tools, renewal_report

server = Path("node_modules/@opensignet/mcp-server/dist/index.js")
with readonly_tools(server) as tools:
    print(domain_availability(tools, "your-agent", "xyz"))

# The identity's own API key, from your secret store.
with readonly_tools(server, api_key=api_key) as tools:
    report = renewal_report(tools, "11111111-1111-4111-8111-111111111111")
    print(report["ready"], report["nextStep"])
```

`readonly_tools` accepts an optional `node` executable path and an optional
`api_key`, and yields exactly:

1. `check_domain_availability`
2. `get_renewal_status`

These are real CrewAI `BaseTool` instances. Keep the context open while your
Agent/Crew uses them; set `allow_delegation=False`, `cache=False` and
`memory=False`, and do not enable knowledge or Chroma capabilities. The
deterministic helpers need no LLM or model API key.

The installed command and module entry point expose the same reads:

```sh
opensignet-crewai --server node_modules/@opensignet/mcp-server/dist/index.js --domain your-agent.xyz
OPENSIGNET_API_KEY=osk_... opensignet-crewai \
  --server node_modules/@opensignet/mcp-server/dist/index.js \
  --agent-id 11111111-1111-4111-8111-111111111111
python -m opensignet_crewai --help
```

`renewal_report` returns `renewal` (the full status), `ready`, and `nextStep`:
the plain message of the first thing in the way, or null. OpenSignet charges each
renewal itself, 30 to 7 days before expiry, from the account's OpenSignet wallet
or saved card; nothing here signs, pays or changes a setting. Turning renewal on
or off is a write tool of the MCP server, outside this read-only package. A
failed read, a missing key or an answer for another identity raises
`WorkflowError` and confirms nothing.

## Security And Bounds

Only minimal OS process variables enter Node, plus the identity's API key when
the host passes it (it must look like an OpenSignet key). Wallet and model keys,
`NODE_OPTIONS`, `ALLOW_WRITES` and ambient OpenSignet settings are excluded.
Write tools are forced off. No `.env` file is loaded. The connector disables
CrewAI telemetry/tracing in the Python process. This is credential minimization,
not an OS sandbox for an untrusted local executable.

Strict input models reject extras, malformed agents and domains, and any
endpoint or key from the model before a request. Discovery rejects missing,
duplicate and incompatible tools.
The pinned official client retains its 30-second connection/discovery/call
deadlines, with **one total attempt** (`max_retries=1`) and tool/result caches
off. Discovery uses one worker thread; each tool call owns and closes its own
MCP session and Node child. There is no new aggregate workflow deadline or
global concurrency guarantee. A closed context rejects new calls.

### Known Dependency Advisories

The required ChromaDB 1.1.1 dependency has four known advisories:
[CVE-2026-45829](https://www.hiddenlayer.com/research/chromatoast-served-pre-auth),
[CVE-2026-45830](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb),
[CVE-2026-45831](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb-3),
[CVE-2026-45833](https://www.hiddenlayer.com/sai-security-advisory/2026-06-chromadb-5).
The reported
[poisoned-collection configuration risk also includes Python clients](https://github.com/chroma-core/chroma/issues/6717).
This is not a blanket claim that the risk exists only in an HTTP server.

The qualified two-tool flow does not call Chroma clients, collections or
embeddings, run a Chroma server, or enable memory, knowledge or caching. Tests
trap those entry points while real Agent/Crew construction and MCP calls run.
That is evidence about this bounded flow, not a patched dependency or a clean
Python CVE audit. Enabling other framework capabilities requires separate
review. Do not suppress advisories or override CrewAI's dependency constraints.
These Python dependencies are not installed by npm or deployed to OpenSignet's
backend/VPS runtime. Dependencies retain their own licenses; this package's
Apache-2.0 license does not replace them.

## Build And Verify

From a reviewed source checkout, a PEP 517 build creates a source distribution
and builds a wheel from it:

```sh
python -m build packages/crewai-plugin
```

Hatchling 1.27.0 is the pinned build backend. Both artifacts use explicit file
allowlists; no environment, tests, Node binary or vendored dependency is shipped.
Install the wheel into a fresh environment with the reviewed hash lock, then
run the installed-package and real-MCP tests documented in
[`the thin example`](https://github.com/OpenSignetOrg/opensignet/blob/main/packages/mcp-server/examples/crewai/README.md).

Primary references: [CrewAI native MCP](https://docs.crewai.com/en/mcp/dsl-integration),
[pinned native client](https://github.com/crewAIInc/crewAI/blob/1.15.21/lib/crewai/src/crewai/mcp/client.py),
[Python packaging](https://packaging.python.org/en/latest/tutorials/packaging-projects/).

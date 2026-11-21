# OpenSignet AutoGen

A native Python package built on Microsoft's official AutoGen `McpWorkbench`.
It connects to the separately installed OpenSignet Node.js MCP server over
stdio. The package owns the guarded implementation; the older MCP example files
are compatibility imports and launchers, not a second implementation.

## Installation

Version **0.1.0** uses the separately installed
`@opensignet/mcp-server@0.1.0` bridge.
The runtime never installs npm packages or silently falls back to another version.

Install both packages:

```bash
python -m pip install opensignet-autogen==0.1.0
npm install --ignore-scripts --no-audit --no-fund @opensignet/mcp-server@0.1.0
```

Python 3.10+ is required; qualification uses Python 3.12. The package pins official
`autogen-agentchat`, `autogen-core` and `autogen-ext[mcp]` at 0.7.5, Python
`mcp` at 1.30.0, and Pydantic at 2.13.5. These are Microsoft AutoGen packages,
not the similarly named AG2 distribution.

## Use The Installed Connector

```python
import asyncio
from pathlib import Path

from opensignet_autogen import (
    OpenSignetWorkbench,
    domain_availability,
    renewal_report,
    server_parameters,
)


async def check(api_key: str):
    # api_key is the identity's own key, from your secret store.
    params = server_parameters(
        Path("/absolute/path/to/node"),
        installed_package=Path("/trusted/node_modules/@opensignet/mcp-server"),
        api_key=api_key,
    )
    async with OpenSignetWorkbench(params) as tools:
        print(await domain_availability(tools, "your-domain", "xyz"))
        report = await renewal_report(tools, "11111111-1111-4111-8111-111111111111")
        print(report["ready"], report["nextStep"])


asyncio.run(check(api_key))
```

Both paths must be configured by the trusted application owner, never by a model
or tool response. Use `node.exe` on Windows. For development only, replace
`installed_package` with `source_checkout=Path("/reviewed/built/OpenSignet")`.
That explicit mode requires the existing built MCP entrypoint; it never runs a
TypeScript loader or fetches an alternate executable.

The console command and `python -m opensignet_autogen` accept the same arguments:

```bash
opensignet-autogen --node /absolute/path/to/node \
  --installed-package /trusted/node_modules/@opensignet/mcp-server \
  --domain your-domain.xyz
OPENSIGNET_API_KEY=osk_... opensignet-autogen --node /absolute/path/to/node \
  --installed-package /trusted/node_modules/@opensignet/mcp-server \
  --agent-id 11111111-1111-4111-8111-111111111111
```

`renewal_report` returns `renewal` (the full status), `ready`, and `nextStep`:
the plain message of the first thing in the way, or null. A failed read, a
missing key or an answer for another identity raises and confirms nothing.
`--api-key-env NAME` reads the identity's key from another variable.

## Policy And Trust Boundary

Only these MCP tools are discoverable and callable:

- `check_domain_availability`
- `get_renewal_status`

The workbench validates closed argument schemas before calling the actual MCP
server. Endpoint, key, command and approval fields, write tools and anything
else are rejected. Arguments are limited to 16 KiB, parsed JSON results to
1 MiB, and stdio reads to 30 seconds. The trusted package manifest is limited
to 64 KiB. Agent IDs must be UUIDs; a domain is a lowercase label and TLD.

The child receives an OS-variable allowlist, a minimal PATH, the read-only flag
and, only when the host passes it, the identity's API key (it must look like an
OpenSignet key). Wallet keys, ambient OpenSignet settings, model/provider
configuration, cloud/proxy credentials and `NODE_OPTIONS` are not forwarded.
Python MCP's inherited OS variables are accounted for by the pinned client
version. This is not an OS sandbox: the configured executable and installed
dependencies must be trusted.

OpenSignet charges each renewal itself, 30 to 7 days before expiry, from the
account's OpenSignet wallet or saved card. Nothing in this package signs, pays
or changes a setting; turning renewal on or off is a write tool of the MCP
server, outside this read-only package. Errors are never converted into
successful answers. Use the workbench as an async context manager. Component
serialization is refused because restoring the upstream base provider would
drop the guard.

## Optional Real AssistantAgent

`create_assistant(model, workbench)` constructs the real AutoGen AssistantAgent,
with this guarded workbench, at most three tool iterations and no MCP sampling
model. Supply and close your own trusted model client. No provider extra or model
key is required for the deterministic reads.

`opensignet-autogen-assistant` is an optional CLI. It reads a trusted AutoGen
component JSON from `AUTOGEN_MODEL_CONFIG` (at most 16 KiB); configure the actual
provider extra separately. Loading component JSON can import code, so never take
it from a model, website or MCP output. The package does not save that config or
forward provider keys to Node. Model calls can incur provider charges.

## Build And Qualify Without Publishing

From the public checkout, use an isolated Python venv/cache under ignored
`.qa/`, not a source directory or a global install:

```bash
python -m pip install build==1.3.0
python -m build --outdir .qa/autogen-package/dist packages/autogen-plugin
python -m pip install \
  -r packages/mcp-server/examples/autogen/framework-requirements.txt \
  -c packages/mcp-server/examples/autogen/constraints.txt
python -m pip install --force-reinstall --no-deps --no-index \
  .qa/autogen-package/dist/opensignet_autogen-0.1.0-py3-none-any.whl
python -m pip check
python -B packages/autogen-plugin/test/verify_artifacts.py .qa/autogen-package/dist
```

The PEP 517 build creates a wheel from the sdist as well as the sdist itself.
Both have an explicit source/license allowlist. No tests, caches, credentials,
Node installation or private code belong in either archive.
The framework-only requirements deliberately exclude this package. Never use the consumer's self-requirement to bootstrap a first-release build.

Build the public MCP/SDK through the repository's reviewed workflow, then run:

```bash
OPENSIGNET_AUTOGEN_PYTHON=/absolute/path/to/venv/bin/python \
  node --test packages/mcp-server/test/autogen.integration.test.ts
```

On PowerShell, set `$env:OPENSIGNET_AUTOGEN_PYTHON` to the isolated venv's
`Scripts/python.exe`. The native suite verifies that the connector imports from
an installed distribution, uses actual AutoGen and the Node MCP/SDK against a
labelled synthetic API stand-in, exercises the real replay-model AssistantAgent,
and checks MCP child shutdown. It makes no paid LLM or live wallet calls.

Packaging follows [PyPA's PEP 517 project guide](https://packaging.python.org/en/latest/tutorials/packaging-projects/)
and [Hatchling's explicit file selection](https://hatch.pypa.io/latest/config/build/#explicit-selection).
The source is Apache-2.0; included LICENSE and NOTICE preserve the public
repository's copyright and trademark terms.

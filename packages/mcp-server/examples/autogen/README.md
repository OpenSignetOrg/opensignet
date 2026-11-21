# AutoGen + OpenSignet

These files are thin imports and CLI launchers for the native Python package
`opensignet-autogen` (import `opensignet_autogen`). The guarded workbench,
argument validation, environment policy, AssistantAgent and command-line logic
are maintained only in that package. OpenSignet still uses its separate Node.js
MCP bridge over stdio.

## Install

These examples use `opensignet-autogen==0.1.0` on PyPI and
`@opensignet/mcp-server@0.1.0` on npm.

Install the Python requirements in an isolated venv
and the exact Node MCP bridge in a trusted directory:

```bash
python -m pip install -r requirements.txt -c constraints.txt
npm install --ignore-scripts --no-audit --no-fund @opensignet/mcp-server@0.1.0
```

For release staging from the public checkout, install the reviewed local wheel
before running these examples or native tests:

```bash
python -m build --outdir .qa/autogen-package/dist packages/autogen-plugin
python -m pip install \
  -r packages/mcp-server/examples/autogen/framework-requirements.txt \
  -c packages/mcp-server/examples/autogen/constraints.txt
python -m pip install --force-reinstall --no-deps --no-index \
  .qa/autogen-package/dist/opensignet_autogen-0.1.0-py3-none-any.whl
python -m pip check
```

Keep all venvs and caches under the ignored `.qa/` directory when developing in
the public repository. There is no editable/source import fallback: tests must
exercise the installed distribution.
CI uses `framework-requirements.txt`, not the self-package consumer requirement,
so the first release never needs to fetch itself from PyPI before it exists.

## Use

Prefer the package directly:

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
```

The installed `opensignet-autogen` command or `python -m opensignet_autogen`
reads without an LLM. The compatibility command `python renewal_status.py`
accepts the same options:

```bash
opensignet-autogen --node /absolute/path/to/node \
  --installed-package /trusted/node_modules/@opensignet/mcp-server \
  --domain your-domain.xyz
OPENSIGNET_API_KEY=osk_... opensignet-autogen --node /absolute/path/to/node \
  --installed-package /trusted/node_modules/@opensignet/mcp-server \
  --agent-id 11111111-1111-4111-8111-111111111111
```

An explicit development alternative is `--source-checkout /reviewed/built/OpenSignet`.
Build the public shared/SDK/MCP packages through the repository's reviewed
workflow first. Never accept either trusted path or launch configuration from
an LLM, tool output or untrusted website.

The workflow exposes only `check_domain_availability` and `get_renewal_status`.
The renewal read prints `renewal` (the full status), `ready`, and `nextStep`: the
plain message of the first thing in the way, or null. OpenSignet charges each
renewal itself, 30 to 7 days before expiry, from the account's OpenSignet wallet
or saved card; nothing here signs, pays or changes a setting. `--api-key-env NAME`
reads the identity's key from another variable.

For a real optional AssistantAgent, import `create_assistant(model, workbench)`.
The `assistant_example.py` compatibility launcher delegates to the package's
optional CLI, which accepts trusted owner model configuration through
`AUTOGEN_MODEL_CONFIG`. Configure your own provider extra separately. Model
calls may cost money; provider keys/config are never persisted or sent to Node.
The deterministic examples and fixture tests need no model key.

See the [canonical package guide](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/autogen-plugin)
for exact bounds, pinned framework versions, owner-approval and environment
boundaries, packaging and usage. The legacy `opensignet_workbench.py` module
only re-exports those package APIs; it has no separate guard implementation.

## Native Checks

Use the interpreter where the reviewed wheel is installed:

```bash
OPENSIGNET_AUTOGEN_PYTHON=/absolute/path/to/venv/bin/python \
  node --test packages/mcp-server/test/autogen.integration.test.ts
```

PowerShell:

```powershell
$env:OPENSIGNET_AUTOGEN_PYTHON = 'C:/absolute/path/to/venv/Scripts/python.exe'
node --test packages/mcp-server/test/autogen.integration.test.ts
```

The suite verifies the installed package origin, actual AutoGen/AssistantAgent
and MCP/SDK execution through a labelled synthetic API stand-in, strict inputs,
minimal child environment and shutdown of all fixture-owned MCP processes.
Without the selected Python interpreter the optional test is explicitly skipped.
These are not paid LLM calls, live wallet transactions or customer observations.

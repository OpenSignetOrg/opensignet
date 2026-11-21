"""Read-only native CrewAI -> stdio MCP -> OpenSignet: domain availability and renewal."""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Iterator, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import copy_context
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Any

# This read-only connector does not need framework tracing or telemetry.
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["CREWAI_TELEMETRY_DISABLED"] = "true"
os.environ["CREWAI_TRACING_ENABLED"] = "false"

from crewai.tools import BaseTool
from crewai.mcp import MCPClient
from crewai.mcp.transports.stdio import StdioTransport
from crewai.tools.mcp_native_tool import MCPNativeTool
from crewai.tools.tool_failure import ToolFailure
from crewai.events.utils.console_formatter import (
    set_suppress_console_output,
    should_suppress_console_output,
)
from mcp import StdioServerParameters
from pydantic import BaseModel, ConfigDict, Field


READ_ONLY_TOOLS = (
    "check_domain_availability",
    "get_renewal_status",
)

# OS process plumbing only. Never copy os.environ into the Node child.
PROCESS_ENV_NAMES = frozenset(
    {
        "APPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "PATH",
        "PATHEXT",
        "PROCESSOR_ARCHITECTURE",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERNAME",
        "USERPROFILE",
        "HOME",
        "LOGNAME",
        "SHELL",
        "TERM",
        "USER",
    }
)


class WorkflowError(RuntimeError):
    """A read failed, or its answer could not be trusted."""


# The identity's API key, as the dashboard shows it once: "osk_" and 43 base62 characters.
API_KEY_PATTERN = re.compile(r"^osk_[0-9A-Za-z]{43}$")
UUID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class AvailabilityArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: str = Field(
        min_length=1, max_length=63, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
    )
    tld: str = Field(min_length=2, max_length=24, pattern=r"^[a-z]+$")


class AgentArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    agentId: str = Field(pattern=UUID_PATTERN)


ARGUMENTS: dict[str, type[BaseModel]] = {
    "check_domain_availability": AvailabilityArguments,
    "get_renewal_status": AgentArguments,
}

# The MCP schemas these tools must keep: property name -> JSON type.
EXPECTED_SCHEMAS: dict[str, dict[str, str]] = {
    "check_domain_availability": {"name": "string", "tld": "string"},
    "get_renewal_status": {"agentId": "string"},
}


def child_environment(
    source: Mapping[str, str] | None = None, api_key: str | None = None
) -> dict[str, str]:
    """OS plumbing, read-only mode and, only when the host passes one, the identity's API key."""
    source = os.environ if source is None else source
    result = {
        key: value for key, value in source.items() if key.upper() in PROCESS_ENV_NAMES
    }
    result["OPENSIGNET_ENABLE_WRITE_TOOLS"] = "false"
    if api_key is not None:
        if not API_KEY_PATTERN.fullmatch(api_key):
            raise ValueError("The API key is not an OpenSignet API key (osk_…)")
        result["OPENSIGNET_API_KEY"] = api_key
    return result


def server_parameters(
    entry: Path, node: str = "node", api_key: str | None = None
) -> StdioServerParameters:
    entry = entry.expanduser().resolve(strict=True)
    if not entry.is_file() or entry.suffix not in {".js", ".mjs"}:
        raise ValueError("Point --server to the trusted installed MCP JavaScript entry")
    executable = shutil.which(node)
    if executable is None:
        raise ValueError("Node.js was not found; provide its executable with --node")
    return StdioServerParameters(
        command=str(Path(executable).resolve(strict=True)),
        args=[str(entry)],
        env=child_environment(api_key=api_key),
    )


def constrain_tools(tools: Sequence[BaseTool]) -> dict[str, BaseTool]:
    names = [tool.name for tool in tools]
    if len(names) != len(READ_ONLY_TOOLS) or set(names) != set(READ_ONLY_TOOLS):
        raise WorkflowError(
            "MCP tool contract mismatch. Use the reviewed @opensignet/mcp-server "
            f"{version('opensignet-crewai')} build with every read-only tool this package uses."
        )
    by_name = {tool.name: tool for tool in tools}
    selected = {name: by_name[name] for name in READ_ONLY_TOOLS}
    for name, tool in selected.items():
        # Public BaseTool schema hook; the official MCP transport/call stays intact.
        tool.args_schema = ARGUMENTS[name]
        tool.cache_function = lambda _arguments, _result: False
    return selected


def compatible(definition: Mapping[str, Any], name: str) -> bool:
    schema = definition.get("inputSchema", {})
    expected = EXPECTED_SCHEMAS[name]
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    return (
        definition.get("name") == name
        and isinstance(schema, dict)
        and schema.get("type") == "object"
        and isinstance(properties, dict)
        and set(properties) == set(expected)
        and all(
            isinstance(properties[key], dict) and properties[key].get("type") == kind
            for key, kind in expected.items()
        )
    )


@contextmanager
def native_tools(parameters: StdioServerParameters) -> Iterator[dict[str, BaseTool]]:
    active = True
    previous_console_suppression = should_suppress_console_output()
    set_suppress_console_output(True)
    environment = parameters.env or {}
    child = child_environment(environment, environment.get("OPENSIGNET_API_KEY"))

    def client_factory() -> MCPClient:
        if not active:
            raise WorkflowError("The read-only tool context is closed")
        return MCPClient(
            transport=StdioTransport(
                command=parameters.command,
                args=list(parameters.args),
                env=dict(child),
            ),
            # The native client's range(max_retries) counts total attempts.
            max_retries=1,
            cache_tools_list=False,
        )

    async def discover() -> list[dict[str, Any]]:
        async with client_factory() as client:
            return await client.list_tools(use_cache=False)

    try:
        # Discovery enters/exits the native transport on one loop, even in an async host.
        with ThreadPoolExecutor(max_workers=1) as executor:
            definitions = executor.submit(
                copy_context().run, asyncio.run, discover()
            ).result()
        tools: list[BaseTool] = []
        for definition in definitions:
            name = definition.get("original_name")
            if name not in READ_ONLY_TOOLS:
                continue
            if not compatible(definition, name):
                raise WorkflowError(
                    "MCP server returned an incompatible read-only tool schema"
                )
            native = MCPNativeTool(
                client_factory=client_factory,
                tool_name=name,
                original_tool_name=name,
                server_name="opensignet",
                tool_schema={
                    "description": definition.get("description", ""),
                    "args_schema": ARGUMENTS[name],
                },
            )
            native.name = name
            tools.append(native)
        yield constrain_tools(tools)
    finally:
        # Native tools own and disconnect a fresh client for each invocation.
        active = False
        set_suppress_console_output(previous_console_suppression)


@contextmanager
def readonly_tools(
    entry: Path, node: str = "node", api_key: str | None = None
) -> Iterator[dict[str, BaseTool]]:
    with native_tools(server_parameters(entry, node, api_key)) as tools:
        yield tools


def call_json(tool: BaseTool, arguments: dict[str, Any]) -> dict[str, Any]:
    raw = tool.run(**arguments)
    if isinstance(raw, ToolFailure):
        raise WorkflowError(f"{tool.name} failed; nothing was confirmed")
    try:
        result = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as error:
        raise WorkflowError(f"{tool.name} did not return a JSON answer") from error
    if not isinstance(result, dict) or "error" in result:
        raise WorkflowError(f"{tool.name} failed; nothing was confirmed")
    return result


def domain_availability(
    tools: Mapping[str, BaseTool], name: str, tld: str
) -> dict[str, Any]:
    """Whether `name.tld` can be registered, with its price."""
    request = AvailabilityArguments.model_validate(
        {"name": name, "tld": tld}
    ).model_dump()
    answer = call_json(tools["check_domain_availability"], request)
    if not isinstance(answer.get("available"), bool):
        raise WorkflowError("The availability answer is incomplete")
    return answer


def renewal_report(tools: Mapping[str, BaseTool], agent_id: str) -> dict[str, Any]:
    """How the identity's domain renews, and the one thing to do next if it would not."""
    request = AgentArguments.model_validate({"agentId": agent_id}).model_dump()
    status = call_json(tools["get_renewal_status"], request)
    issue = status.get("issue")
    if (
        str(status.get("agentId", "")).lower() != agent_id.lower()
        or not isinstance(status.get("autoRenew"), bool)
        or not isinstance(status.get("ready"), bool)
        or (status["ready"] is False and not isinstance(issue, dict))
    ):
        raise WorkflowError(
            "The renewal answer is for another identity or is incomplete"
        )
    next_step = issue.get("message") if isinstance(issue, dict) else None
    return {
        "renewal": status,
        "ready": status["ready"],
        "nextStep": None if status["ready"] else next_step,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--server",
        required=True,
        type=Path,
        help="Trusted installed @opensignet/mcp-server/dist/index.js",
    )
    parser.add_argument("--node", default="node")
    subject = parser.add_mutually_exclusive_group(required=True)
    subject.add_argument("--domain", help="A domain to check, e.g. northwind.ai")
    subject.add_argument("--agent-id", help="An identity whose renewal to read")
    parser.add_argument(
        "--api-key-env",
        default="OPENSIGNET_API_KEY",
        help="Environment variable holding the identity's API key (renewal reads only)",
    )
    args = parser.parse_args()
    try:
        if args.domain is not None:
            name, _, tld = args.domain.strip().lower().partition(".")
            with readonly_tools(args.server, args.node) as tools:
                result = domain_availability(tools, name, tld)
        else:
            api_key = os.environ.get(args.api_key_env)
            if not api_key:
                raise WorkflowError(f"Set {args.api_key_env} to the identity's API key")
            with readonly_tools(args.server, args.node, api_key) as tools:
                result = renewal_report(tools, args.agent_id)
        print(json.dumps(result, indent=2))
        return 0
    except (WorkflowError, ValueError) as error:
        print(f"{error}. Nothing was changed.", file=sys.stderr)
        return 1
    except Exception:
        # Upstream exceptions can include local process paths or environment input.
        print("The read failed. Nothing was changed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

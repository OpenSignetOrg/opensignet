"""Native Python AutoGen MCP integration: read-only domain and renewal tools."""

from __future__ import annotations

import contextlib
import json
import os
import re
from importlib.metadata import version
from pathlib import Path
from typing import Any, Mapping

from autogen_core import CancellationToken
from autogen_core.tools import TextResultContent, ToolResult, ToolSchema
from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictStr,
    ValidationError,
)

MCP_NPM_VERSION = version("opensignet-autogen")
TOOL_NAMES = frozenset(("check_domain_availability", "get_renewal_status"))
# The identity's API key, as the dashboard shows it once: "osk_" and 43 base62 characters.
API_KEY_PATTERN = re.compile(r"^osk_[0-9A-Za-z]{43}$")
READ_TIMEOUT_SECONDS = 30
MAX_ARGUMENT_BYTES = 16_384
MAX_RESULT_BYTES = 1_048_576

# MCP Python 1.30 inherits only this OS environment subset. We explicitly replace
# PATH and never forward application, wallet, provider, proxy or write settings.
SYSTEM_ENV_KEYS = frozenset(
    (
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
        "USERNAME",
        "USERPROFILE",
        "HOME",
        "LOGNAME",
        "SHELL",
        "TERM",
        "USER",
    )
)


def require_versions() -> None:
    for package, expected in (
        ("autogen-core", "0.7.5"),
        ("autogen-agentchat", "0.7.5"),
        ("autogen-ext", "0.7.5"),
        ("mcp", "1.30.0"),
    ):
        if version(package) != expected:
            raise RuntimeError(
                f"Install the package's pinned requirements: {package}=={expected}"
            )


def minimal_child_environment(
    node: Path, source: Mapping[str, str] | None = None, api_key: str | None = None
) -> dict[str, str]:
    """OS plumbing, read-only mode and, only when the host passes one, the identity's key."""
    ambient = os.environ if source is None else source
    result = {
        key: ambient[key]
        for key in SYSTEM_ENV_KEYS
        if key in ambient and not ambient[key].startswith("()")
    }
    paths = [str(node.parent)]
    if os.name == "nt" and ambient.get("SYSTEMROOT"):
        paths.append(str(Path(ambient["SYSTEMROOT"]) / "System32"))
    elif os.name != "nt":
        paths.extend(("/usr/bin", "/bin"))
    result["PATH"] = os.pathsep.join(paths)
    result["OPENSIGNET_ENABLE_WRITE_TOOLS"] = "false"
    if api_key is not None:
        if not API_KEY_PATTERN.fullmatch(api_key):
            raise ValueError("The API key is not an OpenSignet API key (osk_...)")
        result["OPENSIGNET_API_KEY"] = api_key
    return result


def server_parameters(
    node: Path,
    *,
    installed_package: Path | None = None,
    source_checkout: Path | None = None,
    api_key: str | None = None,
) -> StdioServerParams:
    """Only owner-supplied trusted paths, never model/tool-result launch config."""
    require_versions()
    node = node.expanduser().resolve(strict=True)
    if not node.is_file() or node.name.lower() not in ("node", "node.exe"):
        raise ValueError("--node must identify a trusted Node executable")
    if (installed_package is None) == (source_checkout is None):
        raise ValueError(
            "Select exactly one installed package or public source checkout"
        )
    package = (
        (
            installed_package
            if installed_package is not None
            else source_checkout / "packages" / "mcp-server"
        )
        .expanduser()
        .resolve(strict=True)
    )
    manifest_path = package / "package.json"
    if manifest_path.stat().st_size > 65_536:
        raise ValueError("Unexpected MCP package manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("name") != "@opensignet/mcp-server":
        raise ValueError("Not the OpenSignet MCP package")
    if installed_package is not None and manifest.get("version") != MCP_NPM_VERSION:
        raise ValueError(f"Expected @opensignet/mcp-server@{MCP_NPM_VERSION}")
    entry = (package / "dist" / "index.js").resolve(strict=True)
    if not entry.is_file() or not entry.is_relative_to(package):
        raise ValueError(
            "Build the reviewed MCP source first; no source-loader fallback"
        )
    return StdioServerParams(
        command=str(node),
        args=[str(entry)],
        cwd=str(package),
        env=minimal_child_environment(node, api_key=api_key),
        read_timeout_seconds=READ_TIMEOUT_SECONDS,
    )


UUID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class AvailabilityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: StrictStr = Field(
        min_length=1, max_length=63, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
    )
    tld: StrictStr = Field(min_length=2, max_length=24, pattern=r"^[a-z]+$")


class AgentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    agentId: StrictStr = Field(pattern=UUID_PATTERN)


INPUTS: dict[str, type[BaseModel]] = {
    "check_domain_availability": AvailabilityInput,
    "get_renewal_status": AgentInput,
}


def error_result(name: str, code: str) -> ToolResult:
    return ToolResult(
        name=name,
        is_error=True,
        result=[TextResultContent(content=json.dumps({"error": {"code": code}}))],
    )


class OpenSignetWorkbench(McpWorkbench):
    """Real McpWorkbench with an enforced read-only tool allowlist."""

    def _to_config(self):
        # The inherited provider name points to the unfiltered McpWorkbench.
        # Refuse serialization rather than silently lose the policy on reload.
        raise TypeError(
            "Construct OpenSignetWorkbench explicitly; "
            "do not serialize it as the base MCP component"
        )

    async def start(self) -> None:
        try:
            await super().start()
        except BaseException:
            with contextlib.suppress(Exception):
                await super().stop()
            raise

    async def list_tools(self) -> list[ToolSchema]:
        return [
            tool for tool in await super().list_tools() if tool["name"] in TOOL_NAMES
        ]

    async def call_tool(
        self,
        name: str,
        arguments: Mapping[str, Any] | None = None,
        cancellation_token: CancellationToken | None = None,
        call_id: str | None = None,
    ) -> ToolResult:
        if name not in TOOL_NAMES:
            return error_result(name, "READ_ONLY_TOOL_DENIED")
        try:
            raw = dict(arguments or {})
            if (
                len(json.dumps(raw, allow_nan=False).encode("utf-8"))
                > MAX_ARGUMENT_BYTES
            ):
                return error_result(name, "INPUT_TOO_LARGE")
            parsed = INPUTS[name].model_validate(raw).model_dump()
        except (ValidationError, ValueError, TypeError):
            return error_result(name, "INVALID_INPUT")
        # Annotations and model instructions are not authorization controls.
        return await super().call_tool(name, parsed, cancellation_token, call_id)


def result_json(result: ToolResult) -> dict[str, Any]:
    if result.is_error:
        raise RuntimeError(f"{result.name} failed; nothing was confirmed")
    if len(result.result) != 1 or not isinstance(result.result[0], TextResultContent):
        raise RuntimeError("Expected one JSON text tool result")
    text = result.result[0].content
    if len(text.encode("utf-8")) > MAX_RESULT_BYTES:
        raise RuntimeError("Tool result exceeded the package's output bound")
    value = json.loads(text)
    if not isinstance(value, dict):
        raise RuntimeError("Expected a JSON object from the trusted MCP package")
    return value


async def _require(workbench: OpenSignetWorkbench, name: str) -> None:
    if name not in {tool["name"] for tool in await workbench.list_tools()}:
        raise RuntimeError(
            f"{name} is missing. Install MCP {MCP_NPM_VERSION} or build the reviewed "
            "public source."
        )


async def domain_availability(
    workbench: OpenSignetWorkbench, name: str, tld: str
) -> dict[str, Any]:
    """Whether `name.tld` can be registered, with its price."""
    request = AvailabilityInput.model_validate({"name": name, "tld": tld}).model_dump()
    await _require(workbench, "check_domain_availability")
    answer = result_json(
        await workbench.call_tool("check_domain_availability", request)
    )
    if not isinstance(answer.get("available"), bool):
        raise RuntimeError("The availability answer is incomplete")
    return answer


async def renewal_report(
    workbench: OpenSignetWorkbench, agent_id: str
) -> dict[str, Any]:
    """How the identity's domain renews, and the one thing to do next if it would not."""
    request = AgentInput.model_validate({"agentId": agent_id}).model_dump()
    await _require(workbench, "get_renewal_status")
    status = result_json(await workbench.call_tool("get_renewal_status", request))
    issue = status.get("issue")
    if (
        str(status.get("agentId", "")).lower() != agent_id.lower()
        or type(status.get("autoRenew")) is not bool
        or type(status.get("ready")) is not bool
        or (status["ready"] is False and not isinstance(issue, dict))
    ):
        raise RuntimeError(
            "The renewal answer is for another identity or is incomplete"
        )
    next_step = issue.get("message") if isinstance(issue, dict) else None
    return {
        "mode": "read_only",
        "renewal": status,
        "ready": status["ready"],
        "nextStep": None if status["ready"] else next_step,
    }

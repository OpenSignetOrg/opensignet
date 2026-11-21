"""Guarded native AutoGen integration for OpenSignet: read-only domain and renewal tools."""

from importlib.metadata import version

from .assistant import create_assistant
from .workbench import (
    API_KEY_PATTERN,
    MAX_ARGUMENT_BYTES,
    MAX_RESULT_BYTES,
    MCP_NPM_VERSION,
    READ_TIMEOUT_SECONDS,
    SYSTEM_ENV_KEYS,
    TOOL_NAMES,
    AgentInput,
    AvailabilityInput,
    OpenSignetWorkbench,
    domain_availability,
    error_result,
    minimal_child_environment,
    renewal_report,
    require_versions,
    result_json,
    server_parameters,
)

__version__ = version("opensignet-autogen")

__all__ = [
    "OpenSignetWorkbench",
    "AgentInput",
    "AvailabilityInput",
    "API_KEY_PATTERN",
    "MCP_NPM_VERSION",
    "TOOL_NAMES",
    "READ_TIMEOUT_SECONDS",
    "MAX_ARGUMENT_BYTES",
    "MAX_RESULT_BYTES",
    "SYSTEM_ENV_KEYS",
    "require_versions",
    "minimal_child_environment",
    "server_parameters",
    "error_result",
    "result_json",
    "domain_availability",
    "renewal_report",
    "create_assistant",
    "__version__",
]

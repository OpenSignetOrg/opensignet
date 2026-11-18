"""Compatibility import; opensignet_autogen is the only implementation."""

from opensignet_autogen import (
    MAX_ARGUMENT_BYTES,
    MAX_RESULT_BYTES,
    MCP_NPM_VERSION,
    READ_TIMEOUT_SECONDS,
    SYSTEM_ENV_KEYS,
    TOOL_NAMES,
    OpenSignetWorkbench,
    IdentityInput,
    PrepareInput,
    error_result,
    inspect_and_prepare,
    minimal_child_environment,
    require_versions,
    result_json,
    server_parameters,
)

__all__ = [
    "OpenSignetWorkbench",
    "IdentityInput",
    "PrepareInput",
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
    "inspect_and_prepare",
]

"""Typed, read-only OpenSignet tools backed by CrewAI's native MCP client."""

from importlib.metadata import version

from .connector import (
    READ_ONLY_TOOLS,
    AgentArguments,
    AvailabilityArguments,
    WorkflowError,
    call_json,
    child_environment,
    constrain_tools,
    domain_availability,
    main,
    native_tools,
    readonly_tools,
    renewal_report,
    server_parameters,
)

__version__ = version("opensignet-crewai")

__all__ = [
    "READ_ONLY_TOOLS",
    "AgentArguments",
    "AvailabilityArguments",
    "WorkflowError",
    "call_json",
    "child_environment",
    "constrain_tools",
    "domain_availability",
    "main",
    "native_tools",
    "readonly_tools",
    "renewal_report",
    "server_parameters",
]

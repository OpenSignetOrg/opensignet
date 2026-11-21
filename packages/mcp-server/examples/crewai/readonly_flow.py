"""Compatibility example for the separately installed opensignet-crewai package."""

from opensignet_crewai import (
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

if __name__ == "__main__":
    raise SystemExit(main())

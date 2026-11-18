"""Compatibility example for the separately installed opensignet-crewai package."""

from opensignet_crewai import (
    READ_ONLY_TOOLS,
    AutoRenewArguments,
    IdentityArguments,
    WorkflowError,
    call_json,
    child_environment,
    constrain_tools,
    inspect_and_prepare,
    main,
    native_tools,
    readonly_tools,
    require_owned_identity,
    server_parameters,
)

__all__ = [
    "READ_ONLY_TOOLS",
    "AutoRenewArguments",
    "IdentityArguments",
    "WorkflowError",
    "call_json",
    "child_environment",
    "constrain_tools",
    "inspect_and_prepare",
    "main",
    "native_tools",
    "readonly_tools",
    "require_owned_identity",
    "server_parameters",
]

if __name__ == "__main__":
    raise SystemExit(main())

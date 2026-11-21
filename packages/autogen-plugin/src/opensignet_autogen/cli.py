"""Read a domain's availability or an identity's renewal, without a model or paid LLM call."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

from .workbench import (
    OpenSignetWorkbench,
    domain_availability,
    renewal_report,
    server_parameters,
)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument(
        "--node", type=Path, required=True, help="Trusted absolute Node executable"
    )
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--installed-package",
        type=Path,
        help="Trusted node_modules/@opensignet/mcp-server directory",
    )
    source.add_argument(
        "--source-checkout",
        type=Path,
        help="Reviewed, built OpenSignet public checkout",
    )
    subject = result.add_mutually_exclusive_group(required=True)
    subject.add_argument("--domain", help="A domain to check, e.g. northwind.ai")
    subject.add_argument("--agent-id", help="An identity whose renewal to read")
    result.add_argument(
        "--api-key-env",
        default="OPENSIGNET_API_KEY",
        help="Environment variable holding the identity's API key (renewal reads only)",
    )
    return result


def api_key_from(args: argparse.Namespace) -> str | None:
    if args.agent_id is None:
        return None
    key = os.environ.get(args.api_key_env)
    if not key:
        raise ValueError(f"Set {args.api_key_env} to the identity's API key")
    return key


async def run(args: argparse.Namespace) -> dict:
    params = server_parameters(
        args.node,
        installed_package=args.installed_package,
        source_checkout=args.source_checkout,
        api_key=api_key_from(args),
    )
    async with OpenSignetWorkbench(params) as workbench:
        if args.domain is not None:
            name, _, tld = args.domain.strip().lower().partition(".")
            return await domain_availability(workbench, name, tld)
        return await renewal_report(workbench, args.agent_id)


def main() -> None:
    try:
        print(
            json.dumps(
                asyncio.run(run(parser().parse_args())), indent=2, allow_nan=False
            )
        )
    except (KeyboardInterrupt, Exception) as error:
        raise SystemExit(
            f"Read-only workflow stopped ({type(error).__name__}). Nothing was changed."
        ) from None


if __name__ == "__main__":
    main()

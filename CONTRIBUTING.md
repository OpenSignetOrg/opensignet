# Contributing to OpenSignet

Thank you for improving OpenSignet's public developer experience.

## Prerequisites

- **Node.js 22.23.4 or newer.** Every repository script, test and configuration file is
  TypeScript, run directly with Node's native type stripping (`node file.ts`,
  `node --test "test/*.test.ts"`). Use erasable TypeScript syntax only: no enums, namespaces or
  parameter properties.
- **pnpm 10** (the version is pinned in `package.json`).
- **Python 3.11 or newer**, available as `python`. The public-boundary check uses the
  standard-library `ast` and `tomllib` modules, and the Python release tooling has its own tests.
  This is a repository prerequisite, not a runtime dependency of the npm packages; the standalone
  Python integrations document their own requirements.
- **Foundry** (optional) for `forge build` and `forge fmt --check` on the contracts. Without it,
  `pnpm verify` reports the contract build checks as skipped.

## Local verification

There is no hosted CI and no GitHub Actions in this organization. Run the complete verification
locally before every pull request:

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs, in order: the public boundary, secret and file-policy check (including the
TypeScript-only and no-Actions rules), repository script typechecks, Python tooling tests,
dependency-security and script tests, production license policy, formatting, typecheck, lint,
tests and builds for every workspace package, generated docs output validation, the dependency
audit, and an inspection of every packed npm archive. Use `pnpm verify --offline` to skip the
network audit, and `pnpm verify --cloudflare` to also build the frontend Worker and dry-run both
Wrangler environments. Public UI changes additionally need real browser checks at 320px, 390px,
768px and desktop widths from the optimized production build.

## Pull requests

Open pull requests in the [public GitHub repository](https://github.com/OpenSignetOrg/opensignet/pulls).
Keep each pull request focused and explain the public behavior it changes. Add
or update tests and documentation when a public contract changes.

Before opening a pull request:

1. Run `pnpm verify` and fix every failure.
2. Confirm no credentials, private keys, customer data, populated environment
   files, or generated artifacts are included.
3. Confirm new dependencies are necessary, license-compatible, and represented
   in the lockfile.
4. Confirm browser-visible settings contain public values only.
5. Confirm documentation links and examples work as written.

Never put a secret in browser-delivered configuration or client-side code. Keep
environment files untracked and committed examples value-free.

## Dependency advisories

`pnpm audit --prod --audit-level high` must pass. Fix an advisory by upgrading
or overriding to the first patched version. An audit exception
(`pnpm.auditConfig.ignoreGhsas`) is allowed only when no patched release exists
for a locked major version. It must name one advisory and have a test that fails
once the exception is no longer needed.

There are two current exceptions. The first is `GHSA-mrhx-c7xc-m3w5`, a memory-exhaustion issue
in zod array validation, patched in 4.6.6. Every workspace package uses zod 4.6.7.
WalletConnect's Reown wallet code is overridden to zod 4.6.7, since it uses only
zod-4-compatible APIs. The exception covers zod 3 inside Coinbase's x402
packages, whose latest release (2.28.0) still requires zod ^3.24.2 and uses APIs
removed in zod 4. Here zod validates x402 payment payloads, not untrusted bulk
input. The AgentKit plugin imports `zod/v3` from the patched package because
AgentKit consumes zod 3 schemas. Remove the exception once x402 moves to zod 4.

The second is `GHSA-fc5q-39xc-vjpf`, a regular-expression denial of service in picomatch triggered
by attacker-supplied extglob patterns. It affects every release through 4.0.7 and no patched
version exists. In the production dependency graph it is reached only through the docs site's
Astro and Starlight toolchain, which compiles glob patterns from repository configuration at build
time. The docs site is a static build served as Worker assets with no Worker script, so picomatch
never runs in production or sees visitor input. Remove the exception once a patched picomatch is
locked; the dependency-security test fails as soon as a different picomatch version appears.

## Releases

Keep the six publishable npm package versions and both Python project versions aligned, add the
matching section to [CHANGELOG.md](CHANGELOG.md), and update installation examples in the same
pull request. Releases are prepared and checked locally and published manually by the maintainer;
nothing in this repository publishes automatically. Follow [RELEASING.md](RELEASING.md).

## Security reports

Do not disclose vulnerabilities in an issue or pull request. Follow
[SECURITY.md](SECURITY.md) for confidential reporting.

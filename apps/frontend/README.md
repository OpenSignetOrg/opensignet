# OpenSignet Web

OpenSignet is the agent-native identity and communications infrastructure.

The official OpenSignet web experience is available at
[opensignet.com](https://opensignet.com).

The application lets users register, discover, and manage agent identities and communication settings. It
uses the public [OpenSignet API](https://api.opensignet.com/api/v1); product and
integration guides are available in the
[OpenSignet documentation](https://docs.opensignet.com).

## Security

Values delivered to the browser are public by definition and must never contain
credentials, signing keys, session secrets, or customer data. Keep local
environment files untracked and committed examples value-free.

Report suspected vulnerabilities through the confidential process in the root
[security policy](../../SECURITY.md).

## Development

All source, configuration, scripts and tests are TypeScript. Tooling scripts and most tests run
with Node.js native type stripping; tests that import application source run with `tsx`.

| Task                         | Command                                                 |
| ---------------------------- | ------------------------------------------------------- |
| Type check (app and tooling) | `pnpm typecheck`                                        |
| Lint                         | `pnpm lint`                                             |
| Unit and source tests        | `pnpm test`                                             |
| Production build             | `pnpm build`                                            |
| Browser tests                | `node test/<name>.browser.ts <path-to-playwright-core>` |

Browser tests use the Chromium-based browser in `OPENSIGNET_TEST_BROWSER_EXECUTABLE`, falling back
to the installed Microsoft Edge channel.

## Brand assets

Every brand image lives in the repository's [`brand/`](../../brand/README.md)
directory. `public/brand/` and `public/favicon.ico` are generated, git-ignored
copies that the `dev`, `build`, `start`, `test`, `lint`, `typecheck` and `assets`
scripts refresh automatically (`pnpm sync:brand` does it by hand); never edit
them. OpenSignet names, logos, marks, and brand artwork are subject to the
repository's trademark notice and are excluded from the Apache-2.0 license.

Contribution requirements are documented in the root
[contributing guide](../../CONTRIBUTING.md).

# Releasing OpenSignet packages

OpenSignet is the agent-native identity and communications infrastructure. This repository
publishes eight public packages that always share one version:

| Registry | Packages                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm      | `@opensignet/shared`, `@opensignet/sdk`, `@opensignet/mcp-server`, `@opensignet/agentkit-plugin`, `@opensignet/eliza-plugin`, `@opensignet/langchain-plugin` |
| PyPI     | `opensignet-crewai`, `opensignet-autogen`                                                                                                                    |

There is no hosted CI and no automated publishing. Every step below runs on the maintainer's
machine; the repository scripts prepare and check artifacts but never publish them. Registry
versions are immutable, so a published version is never re-uploaded or reused.

## 1. Prepare the source

1. Set the same `MAJOR.MINOR.PATCH` version in the six `packages/*/package.json` files and both
   `packages/{crewai,autogen}-plugin/pyproject.toml` files. The private root workspace version is
   unrelated.
2. Add a `## <version>` section to [CHANGELOG.md](CHANGELOG.md) and update installation examples
   and the package availability notes in the docs and READMEs.
3. Confirm the coordinated version: `pnpm release:version` (npm and PyPI manifests) and
   `python scripts/python-release.py version`.
4. Run `pnpm verify` on a clean checkout of the reviewed commit on `main`. Every step must pass;
   a skipped step (for example the contract build without Foundry) must be run separately.

## 2. Build and inspect the artifacts

npm packages:

```bash
pnpm release:check-registry   # read-only: the version must not exist on npm yet
pnpm release:prepare          # build, pnpm pack and inspect into release/npm/
```

`release:prepare` refuses a non-empty `release/npm/`, packs the six packages in dependency order,
and inspects every archive: package name and version, Apache-2.0 `LICENSE` and `NOTICE`, built
`dist` entry points, no `workspace:` or other local dependency protocols, internal dependencies
on the coordinated version, and no environment files, keys or other forbidden paths. It writes
`SHA256SUMS` and `publish-order.txt` next to the archives.

Python packages, using the hash-locked build tools:

```bash
python -m pip install --require-hashes -r scripts/python-build-requirements.lock
python scripts/python-release.py build --output release/python
python scripts/python-release.py check-pypi --output release/python
```

`build` produces one wheel and one source distribution per project and records their SHA-256
digests and the source commit in `release/python/release.json`. `check-pypi` re-verifies the
artifacts and confirms the version is not on PyPI yet.

`release/` is ignored by Git and excluded from the public boundary.

## 3. Publish (maintainer only)

Publish from the inspected artifacts, never from a fresh build, using your own registry sessions
with two-factor authentication. Publish npm in the printed order so dependencies exist first:

```bash
npm publish release/npm/opensignet-shared-<version>.tgz --access public
npm publish release/npm/opensignet-sdk-<version>.tgz --access public
npm publish release/npm/opensignet-mcp-server-<version>.tgz --access public
npm publish release/npm/opensignet-agentkit-plugin-<version>.tgz --access public
npm publish release/npm/opensignet-eliza-plugin-<version>.tgz --access public
npm publish release/npm/opensignet-langchain-plugin-<version>.tgz --access public
python -m twine upload release/python/dist/*
```

`twine` is not part of the build lock; install it in a separate, isolated environment.

Local publishing does not produce npm provenance or PyPI attestations; those require a supported
CI identity, which this organization does not use. Do not describe a release as having signed
provenance.

If a publish fails or its outcome is uncertain, stop. Check the actual registry state
(`npm view @opensignet/<package>@<version>`, `https://pypi.org/project/<project>/<version>/`) before
any further upload, and never retry a version that already exists.

## 4. Record the release

1. Change the CHANGELOG heading from `(unreleased)` to the release date and replace the docs'
   package availability notes with the published state.
2. Create the matching `v<version>` Git tag on the released commit and a GitHub release that links
   the CHANGELOG section, the registry pages and the `SHA256SUMS` values. Sign the tag when a
   signing key is available; do not move or delete a published tag.
3. Read back the registry versions and archive checksums and confirm they match `SHA256SUMS` and
   `release.json`.

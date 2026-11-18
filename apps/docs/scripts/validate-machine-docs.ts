import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';

import {
  MACHINE_FILE_NAMES,
  createMachineDocuments,
  parsePythonPackage,
  type ApiIndex,
  type DiscoveryDocument,
  type MachineDocuments,
} from './machine-docs.ts';
import { DOCS_ORIGIN, API_ORIGIN, type OpenApiDocument } from './public-api-contract.ts';
import { EXPECTED_DOCS, findForbiddenMatches, routeForDoc } from './validate-content.ts';

const publicRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageMetadata: { name: string; ecosystem: 'npm' | 'pypi'; manifest: string }[] = [
  ...['shared', 'sdk', 'mcp-server', 'agentkit-plugin', 'eliza-plugin', 'langchain-plugin'].map(
    (directory) => ({
      name: `@opensignet/${directory}`,
      ecosystem: 'npm' as const,
      manifest: `packages/${directory}/package.json`,
    }),
  ),
  {
    name: 'opensignet-crewai',
    ecosystem: 'pypi' as const,
    manifest: 'packages/crewai-plugin/pyproject.toml',
  },
  {
    name: 'opensignet-autogen',
    ecosystem: 'pypi' as const,
    manifest: 'packages/autogen-plugin/pyproject.toml',
  },
];

type JsonObject = { [key: string]: unknown };

function walk(value: unknown, visit: (object: JsonObject) => void): void {
  if (!value || typeof value !== 'object') return;
  // Arrays are walked as objects too, exactly like the untyped original.
  const object = value as JsonObject;
  visit(object);
  for (const child of Object.values(object)) walk(child, visit);
}

export async function validateMachineDocuments(documents: Record<string, unknown>) {
  assert.deepEqual(Object.keys(documents).sort(), [...MACHINE_FILE_NAMES].sort());
  for (const [file, value] of Object.entries(documents)) {
    const content = value;
    if (typeof content !== 'string') assert.fail(`${file}: expected string content`);
    assert.ok(content.length > 0, file);
    assert.deepEqual(findForbiddenMatches(content), [], `${file}: public boundary violation`);
    assert.doesNotMatch(content, /C:\\\\Users\\\\|\/Users\/[^/]+\/|-----BEGIN [A-Z ]*KEY-----/);
  }
  // The loop above proved every machine file key is present with string content.
  const text = documents as MachineDocuments;
  // Boundary: generated JSON is typed by its builder and then checked field by field below.
  const openapi = JSON.parse(text['openapi.json']) as OpenApiDocument;
  const index = JSON.parse(text['api-index.json']) as ApiIndex;
  const discovery = JSON.parse(text['.well-known/opensignet.json']) as DiscoveryDocument;
  walk(openapi, (object) => {
    if ('$ref' in object)
      assert.ok(
        typeof object['$ref'] === 'string' && object['$ref'].startsWith('#/'),
        'Only internal OpenAPI references are permitted',
      );
  });
  // A fresh parse is the deep copy the parser may mutate, typed for its OpenAPI input.
  await SwaggerParser.validate(JSON.parse(text['openapi.json']) as OpenAPI.Document, {
    resolve: { external: false },
    dereference: { circular: false },
  });
  assert.equal(openapi.openapi, '3.0.3');
  assert.deepEqual(openapi.servers, [{ url: API_ORIGIN }]);
  assert.equal(openapi['x-coverage'], 'documented-http-surface-only');
  assert.equal(index.format, 'opensignet.api-index');
  assert.equal(discovery.format, 'opensignet.documentation-discovery');
  assert.deepEqual(index.source, discovery.source);
  assert.deepEqual(index.source, openapi['x-source']);
  assert.equal(index.source.packages.length, 8);
  assert.equal(index.source.packages.filter((pkg) => pkg.ecosystem === 'npm').length, 6);
  assert.deepEqual(
    index.source.packages
      .filter((pkg) => pkg.ecosystem === 'pypi')
      .map((pkg) => pkg.name)
      .sort(),
    ['opensignet-autogen', 'opensignet-crewai'],
  );
  assert.deepEqual(
    index.source.packages.map((pkg) => pkg.manifest).sort(),
    packageMetadata.map((pkg) => pkg.manifest).sort(),
  );
  for (const pkg of index.source.packages) {
    const expected = packageMetadata.find((entry) => entry.manifest === pkg.manifest);
    assert.ok(expected, `${pkg.manifest}: unexpected package manifest`);
    assert.equal(pkg.name, expected.name);
    assert.equal(pkg.ecosystem, expected.ecosystem);
    const content = await readFile(join(publicRoot, expected.manifest), 'utf8');
    const actual: { name: string; version: string } =
      expected.ecosystem === 'npm'
        ? (JSON.parse(content) as { name: string; version: string })
        : parsePythonPackage(content, expected.name);
    assert.equal(actual.name, expected.name);
    assert.equal(
      pkg.version,
      actual.version,
      `${pkg.manifest}: source version differs from workspace metadata`,
    );
    assert.equal(pkg.publication, 'workspace-version-not-registry-verification');
  }
  assert.match(index.source.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(text['llms-full.txt'], new RegExp(index.source.sourceSha256));
  assert.equal(index.documents.length, EXPECTED_DOCS.length);
  const validLinks = new Set([
    ...EXPECTED_DOCS.map((file) => `${DOCS_ORIGIN}${routeForDoc(file)}`),
    ...MACHINE_FILE_NAMES.map((file) => `${DOCS_ORIGIN}/${file}`),
    `${DOCS_ORIGIN}/llms.txt`,
    DOCS_ORIGIN,
  ]);
  for (const value of [openapi, index, discovery])
    walk(value, (object) => {
      for (const child of Object.values(object)) {
        if (typeof child === 'string' && child.startsWith(DOCS_ORIGIN)) {
          assert.ok(validLinks.has(child.split('#')[0] ?? ''), `Unknown machine link: ${child}`);
        }
      }
    });
  const operationIds = new Set<string>();
  let operationCount = 0;
  for (const [path, methods] of Object.entries(openapi.paths)) {
    assert.match(path, /^\/api\/v1(?:\/|$)/);
    assert.doesNotMatch(path, /inspect|prepare|auto.?renew|execute|\/admin|\/internal/i);
    for (const [method, operation] of Object.entries(methods)) {
      assert.ok(operation);
      operationCount++;
      assert.ok(!operationIds.has(operation.operationId), 'Duplicate operationId');
      operationIds.add(operation.operationId);
      assert.ok(Array.isArray(operation.security));
      assert.equal(operation['x-schema-coverage'], 'documented-projection');
      assert.equal(operation['x-idempotency'] === 'read-only', method === 'get');
      assert.ok(
        index.http.some(
          (item) =>
            item.path === path &&
            item.method === method.toUpperCase() &&
            item.operationId === operation.operationId,
        ),
      );
    }
  }
  assert.equal(index.http.length, operationCount);
  for (const path of [
    '/api/v1/registrations',
    '/api/v1/registrations/{registrationId}',
    '/api/v1/registration-notices',
  ]) {
    for (const operation of Object.values(openapi.paths[path] ?? {})) {
      assert.deepEqual(operation.security, [{ WalletSignature: [] }]);
      assert.ok(operation.responses['200']?.headers?.['X-Authenticated-Wallet']);
    }
  }
  assert.deepEqual(
    openapi.paths['/api/v1/agents/{id}/email/send']?.post?.parameters?.find(
      (parameter) => parameter.name === 'Idempotency-Key',
    )?.in,
    'header',
  );
  assert.match(
    openapi.paths['/api/v1/agents/register']?.post?.description ?? '',
    /Recover uncertain payment/,
  );
  assert.equal(index.mcp.remoteHttpEndpoint, null);
  assert.equal(
    discovery.interfaces.find((item) => item.type === 'mcp-stdio')?.remoteHttpEndpoint,
    null,
  );
  // Identity data is private: there is no public tool or export to read someone else's identity.
  for (const name of ['inspect_agent_identity', 'search_agents', 'set_registry_visibility'])
    assert.ok(!index.mcp.tools.some((tool) => tool.name === name), `Removed MCP tool: ${name}`);
  assert.ok(!index.sdk.exports.includes('inspectAgentIdentity'), 'Removed SDK export');
  for (const name of ['search', 'setRegistryVisibility'])
    assert.ok(!index.sdk.openSignetMethods.includes(name), `Removed SDK method: ${name}`);
  for (const name of [
    'inspectAgentRenewal',
    'prepareAutoRenewChange',
    'executeAutoRenewChange',
    'confirmAutoRenewChange',
  ])
    assert.ok(index.sdk.exports.includes(name), `Missing SDK source export: ${name}`);
  for (const name of ['inspect_agent_renewal', 'prepare_auto_renew_change'])
    assert.ok(
      index.mcp.tools.some((tool) => tool.name === name && tool.readOnly && tool.defaultEnabled),
      `Missing default read-only MCP tool: ${name}`,
    );
  return {
    files: Object.keys(documents).length,
    pages: index.documents.length,
    operations: operationCount,
    packages: index.source.packages.length,
  };
}

export async function validateBuiltMachineDocuments(
  directory: string,
  { compareSource = true }: { compareSource?: boolean } = {},
) {
  const documents = Object.fromEntries(
    await Promise.all(
      MACHINE_FILE_NAMES.map(async (file): Promise<[string, string]> => [
        file,
        await readFile(join(directory, file), 'utf8'),
      ]),
    ),
  );
  const result = await validateMachineDocuments(documents);
  if (compareSource)
    assert.deepEqual(
      documents,
      await createMachineDocuments(),
      'Built machine files do not match the current public source',
    );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBuiltMachineDocuments(fileURLToPath(new URL('../dist/', import.meta.url)))
    .then((result) => console.log(`Machine docs valid: ${JSON.stringify(result)}`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

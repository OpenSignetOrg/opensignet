import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import test from 'node:test';
import { registrationParamsSchema } from '@opensignet/shared';

import {
  createMachineDocuments,
  documentedHttpRoutes,
  extractPublicFeatures,
  MACHINE_FILES,
  parsePythonPackage,
  type ApiIndex,
  type DiscoveryDocument,
  type MachineFile,
} from '../scripts/machine-docs.ts';
import { validateMachineDocuments } from '../scripts/validate-machine-docs.ts';
import {
  publicSchemas,
  type OpenApiDocument,
  type SourceMetadata,
  type SourcePackage,
} from '../scripts/public-api-contract.ts';
import { DOCS_ROOT, validateInternalLinks } from '../scripts/validate-content.ts';
import { pick, pickArray } from './json-path.ts';

// Boundary: generated documents are typed by their builders; the tests assert their fields.
const parseIndex = (text: string): ApiIndex => JSON.parse(text) as ApiIndex;
const parseDiscovery = (text: string): DiscoveryDocument => JSON.parse(text) as DiscoveryDocument;
const parseOpenApi = (text: string): OpenApiDocument => JSON.parse(text) as OpenApiDocument;

function isMachineFile(file: string): file is MachineFile {
  return Object.hasOwn(MACHINE_FILES, file);
}

function firstPackage(source: SourceMetadata): SourcePackage {
  const pkg = source.packages[0];
  assert.ok(pkg, 'The source catalog has no packages');
  return pkg;
}

test('machine docs are deterministic, source-derived and valid OpenAPI without external resolution', async () => {
  const first = await createMachineDocuments();
  assert.deepEqual(await createMachineDocuments(), first);
  assert.ok(
    first['llms-full.txt'].includes(
      'OpenSignet is the agent-native identity and communications infrastructure.',
    ),
  );
  assert.match(
    first['llms-full.txt'].replace(/\s+/g, ' '),
    /Developers can integrate directly through APIs and SDKs, people can guide agents, and autonomous workflows can operate within configured permissions/,
  );
  assert.doesNotMatch(
    first['llms-full.txt'],
    /Build, register, and operate durable internet identities for autonomous agents/,
  );
  const result = await validateMachineDocuments(first);
  assert.equal(result.files, 4);
  assert.equal(result.pages, 20);
  assert.equal(result.packages, 8);
  assert.ok(result.operations >= 30);
  const source = parseIndex(first['api-index.json']).source;
  const tools = parseIndex(first['api-index.json']).mcp.tools;
  const prepare = tools.find((tool) => tool.name === 'prepare_auto_renew_change');
  assert.ok(prepare);
  assert.deepEqual(pick(prepare.inputSchema, 'required'), [
    'tokenId',
    'expectedOwner',
    'enabled',
    'builderCode',
  ]);
  assert.equal(pick(prepare.inputSchema, 'additionalProperties'), false);
  assert.equal(pick(prepare.inputSchema, 'properties', 'enabled', 'type'), 'boolean');
  const renewal = tools.find((tool) => tool.name === 'inspect_agent_renewal');
  assert.ok(renewal);
  assert.deepEqual(pick(renewal.inputSchema, 'oneOf'), [
    { required: ['domain'] },
    { required: ['tokenId'] },
  ]);
  for (const pkg of source.packages) {
    const manifest = await readFile(join(DOCS_ROOT, '..', '..', pkg.manifest), 'utf8');
    const actual: { version: string } =
      pkg.ecosystem === 'npm'
        ? (JSON.parse(manifest) as { version: string })
        : parsePythonPackage(manifest, pkg.name);
    assert.equal(pkg.version, actual.version);
    assert.equal(pkg.publication, 'workspace-version-not-registry-verification');
  }
});

test('Python package discovery parses TOML and rejects mismatched or dynamic release metadata', () => {
  const source = `[project]\nname = "opensignet-crewai"\nversion = "0.11.0"\ndescription = "Native CrewAI integration"\nrequires-python = ">=3.10"\nlicense = "Apache-2.0"\n`;
  assert.equal(parsePythonPackage(source, 'opensignet-crewai').version, '0.11.0');
  for (const version of ['0.12.0', '2.0.0']) {
    assert.equal(
      parsePythonPackage(source.replace('0.11.0', version), 'opensignet-crewai').version,
      version,
    );
  }
  assert.throws(() => parsePythonPackage(source, 'opensignet-autogen'), /Invalid public/);
  assert.throws(
    () => parsePythonPackage(source + 'dynamic = ["version"]\n', 'opensignet-crewai'),
    /Invalid public/,
  );
  assert.throws(
    () => parsePythonPackage(source.replace('Apache-2.0', 'UNLICENSED'), 'opensignet-crewai'),
    /Invalid public/,
  );
  assert.throws(
    () => parsePythonPackage(source.replace('version = "0.11.0"', ''), 'opensignet-crewai'),
    /Invalid public/,
  );
});

test('machine validation rejects stale versions, substituted manifests and invented publication status', async () => {
  const documents = await createMachineDocuments();
  const tampers: ((source: SourceMetadata) => void)[] = [
    (source) => {
      firstPackage(source).version = `${firstPackage(source).version}-stale`;
    },
    (source) => {
      firstPackage(source).manifest = 'package.json';
    },
    (source) => {
      firstPackage(source).publication = 'published';
    },
    (source) => {
      firstPackage(source).name = '@opensignet/unreviewed';
    },
  ];
  for (const tamper of tampers) {
    const changed = { ...documents };
    const index = parseIndex(documents['api-index.json']);
    tamper(index.source);
    const discovery = parseDiscovery(documents['.well-known/opensignet.json']);
    const openapi = parseOpenApi(documents['openapi.json']);
    discovery.source = index.source;
    openapi['x-source'] = index.source;
    changed['api-index.json'] = JSON.stringify(index);
    changed['.well-known/opensignet.json'] = JSON.stringify(discovery);
    changed['openapi.json'] = JSON.stringify(openapi);
    await assert.rejects(validateMachineDocuments(changed));
  }
});

test('documented route extraction canonicalizes only real HTTP paths', () => {
  const routes = documentedHttpRoutes([
    {
      file: 'api-reference/agents.mdx',
      body: 'GET /api/v1/agents/:id\nGET /api/v1/agents/quote?domain=one\ninspectAgentRenewal({ tokenId: "1" })',
    },
  ]);
  assert.deepEqual([...routes], ['get /api/v1/agents/{id}', 'get /api/v1/agents/quote']);
});

test('shared request schemas retain reviewed defaults, bounds and required fields', () => {
  const schemas = publicSchemas();
  assert.ok(pickArray(schemas, 'RegistrationRequest', 'required').includes('wallet'));
  assert.ok(pickArray(schemas, 'RegistrationRequest', 'required').includes('preferredName'));
  assert.equal(pick(schemas, 'RegistrationRequest', 'properties', 'years', 'maximum'), 10);
  assert.equal(pick(schemas, 'DnsBatchInput', 'properties', 'records', 'maxItems'), 200);
  const input = registrationParamsSchema.parse({
    wallet: '0x1111111111111111111111111111111111111111',
    preferredName: 'example',
    tld: 'xyz',
  });
  assert.equal(pick(schemas, 'RegistrationRequest', 'properties', 'years', 'default'), input.years);
  assert.equal(
    pick(schemas, 'RegistrationRequest', 'properties', 'registerBasename', 'default'),
    input.registerBasename,
  );
  assert.equal(
    pick(schemas, 'RegistrationResult', 'properties', 'renewalSnapshot', 'x-schema-coverage'),
    'partial',
  );
  assert.equal(pick(schemas, 'RegistrationResult', 'properties', 'basename', 'nullable'), true);
  assert.equal(pick(schemas, 'RegistrationResult', 'properties', 'ensName', 'nullable'), true);
  assert.equal(pick(schemas, 'RegistrationProgress', 'properties', 'agentId', 'nullable'), true);
  const progressProperties = pick(schemas, 'RegistrationProgress', 'properties');
  assert.ok(progressProperties && typeof progressProperties === 'object');
  assert.ok(Object.keys(progressProperties).length > 10);
  assert.equal(pick(schemas, 'DnsRecordInput', 'properties', 'data', 'type'), 'object');
  assert.equal(pick(schemas, 'DocumentedJson', 'x-schema-coverage'), 'unspecified');
});

test('machine validation rejects external references and undocumented routes', async () => {
  const documents = await createMachineDocuments();
  const api = parseOpenApi(documents['openapi.json']);
  api.components.schemas['Hostile'] = { $ref: 'https://untrusted.example/schema.json' };
  await assert.rejects(
    validateMachineDocuments({ ...documents, 'openapi.json': JSON.stringify(api) }),
    /Only internal/,
  );
  const changed = parseOpenApi(documents['openapi.json']);
  changed.paths['/api/v1/inspect'] = structuredClone(changed.paths['/api/v1/agents/{id}'] ?? {});
  await assert.rejects(
    validateMachineDocuments({ ...documents, 'openapi.json': JSON.stringify(changed) }),
  );
});

test('HTTP-style responses parse as JSON or text and link to current public resources', async () => {
  const documents = await createMachineDocuments();
  const headers = await readFile(join(DOCS_ROOT, 'public', '_headers'), 'utf8');
  const server = createServer((request, response) => {
    const file = (request.url ?? '').slice(1);
    if (!isMachineFile(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': MACHINE_FILES[file],
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(documents[file]);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const parsed: Record<string, string> = {};
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port: number = address.port;
    for (const [file, contentType] of Object.entries(MACHINE_FILES)) {
      const response: Response = await fetch(`http://127.0.0.1:${port}/${file}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), contentType);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      parsed[file] = await response.text();
      assert.ok(
        headers.includes(`/${file}\n  Content-Type: ${contentType}`) ||
          headers.includes(`/${file}\r\n  Content-Type: ${contentType}`),
      );
      assert.doesNotThrow(() =>
        validateInternalLinks(`[Machine](/${file})`, 'machine.mdx', new Set()),
      );
    }
    await validateMachineDocuments(parsed);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('source feature parsing is non-executing and fails closed if structure changes', () => {
  assert.throws(
    () => extractPublicFeatures('export const value = 1;', 'runEverything()'),
    /could not be derived/,
  );
});

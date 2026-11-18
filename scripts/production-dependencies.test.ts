import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const frontendRequire = createRequire(new URL('../apps/frontend/package.json', import.meta.url));
const docsRequire = createRequire(new URL('../apps/docs/package.json', import.meta.url));
const mcpRequire = createRequire(new URL('../packages/mcp-server/package.json', import.meta.url));
const nextRequire = createRequire(frontendRequire.resolve('next/package.json'));
const astroRequire = createRequire(docsRequire.resolve('astro/package.json'));
const tailwindRequire = createRequire(frontendRequire.resolve('tailwindcss/package.json'));
// Resolve an unconditional export without evaluating Starlight's Astro integration.
const starlightRequire = createRequire(
  docsRequire.resolve('@astrojs/starlight/style/markdown.css'),
);
const expressiveCodeRequire = [
  'astro-expressive-code',
  'rehype-expressive-code',
  'expressive-code',
  '@expressive-code/core',
].reduce((require, name) => createRequire(require.resolve(name)), starlightRequire);
const selectorParser = tailwindRequire('postcss-selector-parser');
const { parse: parseToml } = docsRequire('smol-toml') as SmolToml;
const sdkEntry = mcpRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
const sdkRequire = createRequire(sdkEntry);
const expressRequire = createRequire(sdkRequire.resolve('express'));
const proxyaddr = expressRequire('proxy-addr');
const docsPostcssRequire = createRequire(astroRequire.resolve('postcss'));
const nextPostcssRequire = createRequire(nextRequire.resolve('postcss'));
const { SourceMapConsumer, SourceMapGenerator } = docsPostcssRequire('source-map-js');
const { auth, fetchToken } = mcpRequire('@modelcontextprotocol/sdk/client/auth.js');
const { OAuthTokensSchema, OAuthClientInformationSchema } = mcpRequire(
  '@modelcontextprotocol/sdk/shared/auth.js',
);

interface SmolToml {
  parse(document: string): Record<string, unknown> & {
    project?: { name: string; version: string; license: string; urls: Record<string, string> };
    example?: { name: string }[];
  };
}

test('direct dependency manifests and installed consumers use official fixed releases', async () => {
  const docsManifest = JSON.parse(
    await readFile(new URL('../apps/docs/package.json', import.meta.url), 'utf8'),
  );
  const mcpManifest = JSON.parse(
    await readFile(new URL('../packages/mcp-server/package.json', import.meta.url), 'utf8'),
  );
  const sdkManifest = JSON.parse(
    await readFile(new URL('../../../package.json', pathToFileURL(sdkEntry)), 'utf8'),
  );
  assert.equal(docsManifest.dependencies.sharp, '0.35.5');
  assert.equal(docsManifest.dependencies['smol-toml'], '1.9.1');
  assert.equal(mcpManifest.dependencies['@modelcontextprotocol/sdk'], '1.32.1');
  assert.equal(sdkManifest.version, '1.32.1');
  assert.equal(expressRequire('proxy-addr/package.json').version, '2.0.8');
  assert.equal(docsPostcssRequire('source-map-js/package.json').version, '1.2.2');
  assert.equal(tailwindRequire('postcss-selector-parser/package.json').version, '7.1.6');
  assert.equal(
    docsPostcssRequire.resolve('source-map-js'),
    nextPostcssRequire.resolve('source-map-js'),
  );
});

test('smol-toml does not rescan the remaining document for every dot-free key', () => {
  const count = 2000;
  const document = Array.from({ length: count }, (_, i) => `key_${i} = ${i}\n`).join('');
  const indexOf = String.prototype.indexOf;
  let fullDocumentScans = 0;
  let parsed: ReturnType<typeof parseToml> | undefined;
  // Count the former quadratic operation instead of relying on CI wall-clock speed.
  String.prototype.indexOf = function (this: string, search: string, position?: number) {
    if (search === '.' && String(this) === document) fullDocumentScans++;
    return Reflect.apply(indexOf, this, [search, position]);
  };
  try {
    parsed = parseToml(document);
  } finally {
    String.prototype.indexOf = indexOf;
  }
  assert.equal(fullDocumentScans, 0);
  assert.ok(parsed);
  assert.equal(Object.keys(parsed).length, count);
  assert.equal(parsed['key_1999'], 1999);
});

test('smol-toml preserves the public Python metadata shape, dotted keys and table arrays', () => {
  const parsed = parseToml(
    '[project]\nname = "opensignet-crewai"\nversion = "0.1.0"\nlicense = "Apache-2.0"\n' +
      '[project.urls]\nDocumentation = "https://docs.opensignet.com"\n' +
      '[[example]]\nname = "first"\n[[example]]\nname = "second"\n',
  );
  assert.equal(parsed.project?.name, 'opensignet-crewai');
  assert.equal(parsed.project.version, '0.1.0');
  assert.equal(parsed.project.license, 'Apache-2.0');
  assert.equal(parsed.project.urls['Documentation'], 'https://docs.opensignet.com');
  assert.deepEqual(
    parsed.example?.map(({ name }) => name),
    ['first', 'second'],
  );
  assert.equal(
    parseToml('project.name = "opensignet-autogen"').project?.name,
    'opensignet-autogen',
  );
});

test('selector parsing does not repeatedly scan numeric index arrays for flat classes and IDs', () => {
  for (const atom of ['.a', '#a', '#{a}']) {
    const input = atom.repeat(2000);
    const indexOf = Array.prototype.indexOf;
    let numericIndexScans = 0;
    let tree;
    Array.prototype.indexOf = function (this: unknown[], search: unknown, position?: number) {
      if (typeof this[0] === 'number' && typeof search === 'number') numericIndexScans++;
      return Reflect.apply(indexOf, this, [search, position]);
    };
    try {
      tree = selectorParser().astSync(input);
    } finally {
      Array.prototype.indexOf = indexOf;
    }
    assert.equal(numericIndexScans, 0);
    assert.equal(tree.toString(), input);
    if (atom !== '#{a}') assert.equal(tree.first.nodes.length, 2000);
  }
});

for (const [name, consumerRequire] of [
  ['Tailwind', tailwindRequire],
  ['Expressive Code', expressiveCodeRequire],
] as const) {
  test(`${name} postcss-nested preserves reviewed nested CSS with selector parser 7`, () => {
    const nestedRequire = createRequire(consumerRequire.resolve('postcss-nested'));
    assert.equal(
      nestedRequire.resolve('postcss-selector-parser'),
      tailwindRequire.resolve('postcss-selector-parser'),
    );
    const css = consumerRequire('postcss')([consumerRequire('postcss-nested')]).process(
      '.card { color: red; &:hover, & > .icon { color: blue; } @media (min-width: 40rem) { & .label { display: block; } } }',
      { from: undefined },
    ).css;
    assert.equal(
      css,
      '.card { color: red; } .card:hover, .card > .icon { color: blue; } @media (min-width: 40rem) { .card .label { display: block; } }',
    );
  });
}

test('proxy-addr rejects spoofed IPv4 and mapped IPv4 in single and multiple IPv6 trust lists', () => {
  for (const subnets of [['::ffff:10.0.0.0/8'], ['::/1'], ['::ffff:10.0.0.0/8', '10.0.0.0/8']]) {
    const trust = proxyaddr.compile(subnets);
    assert.equal(trust('203.0.113.9'), false);
    assert.equal(trust('::ffff:203.0.113.9'), false);
  }
});

test('proxy-addr retains correct IPv4, mapped IPv4 and ordinary IPv6 trust behavior', () => {
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const trust = proxyaddr.compile([subnet]);
    assert.equal(trust('10.0.0.1'), true);
    assert.equal(trust('::ffff:10.0.0.1'), true);
    assert.equal(trust('203.0.113.9'), false);
    assert.equal(trust('::1'), false);
  }
  const trust = proxyaddr.compile(['2001:db8::/32']);
  assert.equal(trust('2001:db8::1'), true);
  assert.equal(trust('::1'), false);
});

test('the SDK Express consumer does not believe forwarded IPs from an untrusted peer', () => {
  const express = sdkRequire('express');
  const app = express();
  for (const peer of ['203.0.113.9', '::ffff:203.0.113.9']) {
    app.set('trust proxy', ['::ffff:10.0.0.0/8']);
    const request = Object.assign(Object.create(express.request), {
      app,
      socket: { remoteAddress: peer },
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    assert.equal(request.ip, peer);
    assert.deepEqual(request.ips, []);
    app.set('trust proxy', ['10.0.0.0/8']);
    request.socket.remoteAddress = '10.0.0.1';
    assert.equal(request.ip, '198.51.100.7');
    assert.deepEqual(request.ips, ['198.51.100.7']);
  }
});

interface IndexedSourceMap {
  version: number;
  sections: { offset: { line: unknown; column: unknown }; map: object }[];
}

function indexedMap(line: unknown, column: unknown = 0, map?: IndexedSourceMap): IndexedSourceMap {
  return {
    version: 3,
    sections: [
      {
        offset: { line, column },
        map: map ?? { version: 3, sources: ['input.css'], names: [], mappings: 'AAAA' },
      },
    ],
  };
}

test('source-map-js rejects invalid offsets before any source-node expansion', () => {
  for (const offset of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    assert.throws(() => new SourceMapConsumer(indexedMap(offset)), /non-negative integers/);
    assert.throws(() => new SourceMapConsumer(indexedMap(0, offset)), /non-negative integers/);
  }
  assert.throws(() => new SourceMapConsumer(indexedMap(10000001)), /must not exceed/);
});

test('source-map-js bounds cumulative nested offsets, not only individual sections', () => {
  const accepted = indexedMap(5000000, 0, indexedMap(5000000));
  assert.doesNotThrow(() => new SourceMapConsumer(accepted));
  assert.throws(
    () => new SourceMapConsumer(indexedMap(1, 0, accepted)),
    /including offsets of nested sections/,
  );
});

test('source-map-js retains ordinary CSS source mapping and source content', () => {
  const generator = new SourceMapGenerator({ file: 'output.css' });
  generator.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 3, column: 2 },
    source: 'input.css',
  });
  generator.setSourceContent('input.css', '\n\n  a { color: red; }');
  const consumer = new SourceMapConsumer(generator.toJSON());
  assert.deepEqual(consumer.originalPositionFor({ line: 1, column: 0 }), {
    source: 'input.css',
    line: 3,
    column: 2,
    name: null,
  });
  assert.equal(consumer.sourceContentFor('input.css'), '\n\n  a { color: red; }');
});

for (const [name, consumerRequire] of [
  ['Next', nextRequire],
  ['Astro', astroRequire],
] as const) {
  test(`${name} Sharp loads the fixed native librsvg and preserves SVG-to-PNG decoding`, async () => {
    const sharp = consumerRequire('sharp');
    const sharpRequire = createRequire(consumerRequire.resolve('sharp'));
    assert.equal(sharp.versions.sharp, '0.35.5');
    assert.ok(sharpRequire('semver').gte(sharp.versions.rsvg, '2.63.2'));
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
    );
    const png = await sharp(svg).resize(1, 1).png().toBuffer();
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1);
    assert.equal(info.height, 1);
    assert.deepEqual([...data], [255, 0, 0, 255]);
  });
}

const trustedIssuer = 'https://auth.example.invalid';
const otherIssuer = 'https://other-auth.example.invalid';
const serverUrl = 'https://mcp.example.invalid';

interface OAuthProviderFixture {
  redirectUrl: string | undefined;
  clientMetadata: { redirect_uris: string[] };
  clientInformation: () => Record<string, string>;
  tokens: () => Record<string, string>;
  saveTokens: (tokens: unknown) => void;
  prepareTokenRequest: () => URLSearchParams;
  addClientAuthentication?: () => void;
  saveCodeVerifier: () => void;
  redirectToAuthorization: (url: URL) => void;
  discoveryState: () => Record<string, unknown>;
}

function oauthFixture({
  issuer = trustedIssuer,
  clientIssuer = trustedIssuer,
  interactive = false,
}: { issuer?: string; clientIssuer?: string; interactive?: boolean } = {}) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const saved: unknown[] = [];
  const redirects: URL[] = [];
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  };
  const provider: OAuthProviderFixture = {
    redirectUrl: interactive ? 'http://127.0.0.1/callback' : undefined,
    clientMetadata: { redirect_uris: ['http://127.0.0.1/callback'] },
    clientInformation: () => ({
      client_id: 'fixture-client',
      client_secret: 'synthetic-client-secret',
      issuer: clientIssuer,
    }),
    tokens: () => ({
      access_token: 'synthetic-access-token',
      refresh_token: 'synthetic-refresh-token',
      token_type: 'Bearer',
      issuer: trustedIssuer,
    }),
    saveTokens: (tokens) => {
      saved.push(tokens);
    },
    prepareTokenRequest: () => new URLSearchParams({ grant_type: 'client_credentials' }),
    saveCodeVerifier: () => {},
    redirectToAuthorization: (url) => {
      redirects.push(url);
    },
    discoveryState: () => ({
      authorizationServerUrl: issuer,
      authorizationServerMetadata: metadata,
      resourceMetadata: { resource: serverUrl, authorization_servers: [issuer] },
    }),
  };
  const fetchFn = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(url), init });
    return Response.json({
      access_token: 'synthetic-new-token',
      token_type: 'Bearer',
      issuer: otherIssuer,
    });
  };
  return { provider, metadata, fetchFn, requests, saved, redirects };
}

test('MCP fetchToken refuses credentials bound elsewhere before preparing or sending a request', async () => {
  const fixture = oauthFixture();
  fixture.provider.prepareTokenRequest = () => assert.fail('must not prepare foreign credentials');
  fixture.provider.addClientAuthentication = () => assert.fail('must not authenticate elsewhere');
  await assert.rejects(
    fetchToken(fixture.provider, otherIssuer, {
      metadata: fixture.metadata,
      fetchFn: fixture.fetchFn,
    }),
    /bound to authorization server/,
  );
  assert.deepEqual(fixture.requests, []);
});

test('MCP auth refuses statically registered credentials when discovery changes issuer', async () => {
  const fixture = oauthFixture({ issuer: otherIssuer });
  await assert.rejects(
    auth(fixture.provider, { serverUrl, fetchFn: fixture.fetchFn }),
    /bound to authorization server/,
  );
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.saved, []);
});

test('MCP auth does not send a saved refresh token to a different authorization server', async () => {
  const fixture = oauthFixture({
    issuer: otherIssuer,
    clientIssuer: otherIssuer,
    interactive: true,
  });
  const result = await auth(fixture.provider, { serverUrl, fetchFn: fixture.fetchFn });
  assert.equal(result, 'REDIRECT');
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.saved, []);
  assert.equal(fixture.redirects.length, 1);
  assert.equal(fixture.redirects[0]?.origin, otherIssuer);
});

test('MCP auth preserves same-issuer token requests and stamps the actual issuer on saved tokens', async () => {
  const fixture = oauthFixture({ clientIssuer: 'https://AUTH.example.invalid:443/' });
  const result = await auth(fixture.provider, { serverUrl, fetchFn: fixture.fetchFn });
  assert.equal(result, 'AUTHORIZED');
  assert.equal(fixture.requests.length, 1);
  const [tokenRequest] = fixture.requests;
  assert.equal(tokenRequest?.url, `${trustedIssuer}/token`);
  const body = tokenRequest?.init?.body;
  assert.ok(body instanceof URLSearchParams);
  assert.equal(body.get('client_secret'), 'synthetic-client-secret');
  assert.deepEqual(fixture.saved, [
    { access_token: 'synthetic-new-token', token_type: 'Bearer', issuer: trustedIssuer },
  ]);
});

test('MCP credential schemas retain the issuer when reading persisted credentials', () => {
  assert.equal(
    OAuthTokensSchema.parse({
      access_token: 'synthetic',
      token_type: 'Bearer',
      issuer: trustedIssuer,
    }).issuer,
    trustedIssuer,
  );
  assert.equal(
    OAuthClientInformationSchema.parse({ client_id: 'fixture', issuer: trustedIssuer }).issuer,
    trustedIssuer,
  );
});

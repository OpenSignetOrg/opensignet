import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import {
  frontendRoot,
  readAssetManifest,
  readBrandConfig,
  repositoryRoot,
} from '../scripts/verify-assets.ts';

const brand = readBrandConfig();
const assetManifest = readAssetManifest();

function asset(name: string): string {
  const path = brand.assets[name];
  assert.ok(path, `Missing brand asset mapping: ${name}`);
  return path;
}

// Run explicitly against a locally started production build of the frontend.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3108');
if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:')
  throw new Error('Smoke tests are loopback-only.');
const id = '00000000-0000-4000-8000-000000000001';

function requestWithHost(path: string, host: string): Promise<IncomingMessage> {
  return new Promise((resolveResponse, reject) => {
    const request = httpRequest(
      {
        hostname: origin.hostname,
        port: origin.port,
        path,
        method: 'GET',
        headers: { Host: host },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolveResponse(response));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('unknown pages return 404 and the API origin cannot execute business handlers', async () => {
  const missing = await fetch(new URL('/not-a-real-page', origin));
  assert.equal(missing.status, 404);
  for (const removed of ['/registry', '/verify', '/sitemap-agents.xml', `/agents/${id}`])
    assert.equal((await fetch(new URL(removed, origin))).status, 404, removed);
  for (const method of ['GET', 'POST', 'OPTIONS']) {
    const response = await fetch(new URL('/api/v1/agents/register', origin), { method });
    assert.equal(response.status, 404);
  }
});

test('all public page families publish the new share image and correctly typed icons', async () => {
  for (const path of ['/', '/register', '/ai-agent-identity', '/privacy', '/terms', '/dashboard']) {
    const response = await fetch(new URL(path, origin), {
      headers: { 'user-agent': 'facebookexternalhit/1.1' },
    });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(
      head.includes(
        `property="og:image" content="https://opensignet.com${brand.assets.socialCard}"`,
      ),
      path,
    );
    assert.ok(
      head.includes(
        `name="twitter:image" content="https://opensignet.com${brand.assets.socialCard}"`,
      ),
      path,
    );
    assert.ok(
      head.includes(`property="og:image:width" content="${brand.socialImage.width}"`),
      path,
    );
    assert.ok(
      head.includes(`property="og:image:height" content="${brand.socialImage.height}"`),
      path,
    );
    assert.ok(head.includes(`href="${brand.assets.favicon}"`), path);
    assert.ok(head.includes(`href="${brand.assets.faviconIco}"`), path);
    assert.ok(head.includes('type="image/x-icon"'), path);
    assert.ok(head.includes('property="og:image:type" content="image/jpeg"'), path);
    assert.ok(head.includes('sizes="96x96"'), path);
    assert.ok(head.includes(`href="${brand.assets.appleTouchIcon}"`), path);
    assert.doesNotMatch(
      head,
      /\/brand\/(?:brand-mark|social-card|app-icon-256|apple-touch-icon)\.png/,
    );
  }
});

test('favicon serves an actual ICO directly and the share image stays below its delivery budget', async () => {
  for (const [path, type] of [
    [asset('faviconIco'), 'image/x-icon'],
    [asset('socialCard'), 'image/jpeg'],
  ] as const) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type')?.split(';')[0], type);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, readFileSync(resolve(frontendRoot, `public${path}`)));
    if (type === 'image/jpeg') assert.ok(bytes.length < 600_000);
    else assert.equal(bytes.subarray(0, 4).toString('hex'), '00000100');
  }
});

test('docs redirects preserve paths on the canonical docs origin', async () => {
  for (const [path, destination] of [
    ['/docs', 'https://docs.opensignet.com/'],
    ['/docs/guides/email', 'https://docs.opensignet.com/guides/email'],
  ]) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get('location'), destination, path);
  }
});

test('redirect-only routes reject unsafe methods without redirects or body forwarding', async () => {
  for (const path of ['/docs/guides/email', '/api']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await fetch(new URL(path, origin), {
        method,
        body: method === 'OPTIONS' ? undefined : 'credential=must-not-move',
        redirect: 'manual',
      });
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    }
  }
});

test('unversioned API routes canonicalize and unknown frontend API routes use JSON errors', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(new URL('/api?format=json', origin), {
      method,
      redirect: 'manual',
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://api.opensignet.com/api/v1?format=json');
  }

  const unknown = await fetch(new URL('/api/v2/private', origin));
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type') ?? '', /application\/json/);
  assert.match(unknown.headers.get('cache-control') ?? '', /no-store/);
  assert.deepEqual(await unknown.json(), {
    error: 'NOT_FOUND',
    message: 'This API route does not exist.',
  });
});

test('www redirects preserve the canonical root, paths and queries', async () => {
  for (const [path, destination] of [
    ['/', 'https://opensignet.com/'],
    ['/?ref=test', 'https://opensignet.com/?ref=test'],
    ['/pricing?period=yearly', 'https://opensignet.com/pricing?period=yearly'],
  ]) {
    const response = await requestWithHost(path, 'www.opensignet.com');
    assert.equal(response.statusCode, 308, path);
    assert.equal(response.headers.location, destination, path);
  }
});

test('all 55 brand kit files are served byte-for-byte and conventional icon aliases redirect to the brand kit', async () => {
  const images = Object.keys(assetManifest.files).filter((file) => file.startsWith('brand/'));
  assert.equal(images.length, 55);
  const contentTypes: Record<string, RegExp> = {
    svg: /image\/svg\+xml/,
    png: /image\/png/,
    jpg: /image\/jpeg/,
    ico: /image\/(?:x-icon|vnd\.microsoft\.icon)/,
  };
  for (const file of images) {
    // brand/<group>/<file> is served at /brand/<group>/<file>.
    const response = await fetch(new URL(`/${file}`, origin));
    assert.equal(response.status, 200, file);
    const contentType = contentTypes[file.slice(file.lastIndexOf('.') + 1)];
    assert.ok(contentType, file);
    assert.match(response.headers.get('content-type') ?? '', contentType, file);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      readFileSync(resolve(repositoryRoot, file)),
      file,
    );
  }
  for (const [path, target] of Object.entries(brand.aliases)) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    assert.equal(response.status, 308, path);
    assert.equal(
      new URL(response.headers.get('location') ?? '', origin).pathname,
      asset(target),
      path,
    );
  }
});

const PREVIEW_ROUTES = [
  '/',
  '/register',
  '/support',
  '/dashboard',
  '/privacy',
  '/terms',
  '/ai-agent-identity',
  '/integrations/mcp',
  '/not-a-real-page',
];
const REPEATABLE = new Set(['og:image:alt', 'twitter:image:alt']);

function metaTags(head: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  for (const [, attributes = ''] of head.matchAll(/<meta\s+([^>]*?)\/?>/g)) {
    const key = /(?:name|property)="([^"]+)"/.exec(attributes)?.[1];
    if (!key) continue;
    const content = /content="([^"]*)"/.exec(attributes)?.[1] ?? '';
    tags.set(key, [...(tags.get(key) ?? []), content]);
  }
  return tags;
}

test('every page family publishes one title, description and image per preview card', async () => {
  for (const path of PREVIEW_ROUTES) {
    const response = await fetch(new URL(path, origin));
    const html = await response.text();
    const head = html.slice(0, html.indexOf('</head>'));
    const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1] ?? '');
    assert.equal(titles.length, 1, path);
    assert.ok((titles[0]?.match(/OpenSignet/g) ?? []).length <= 1, `${path}: ${titles[0]}`);
    assert.doesNotMatch(titles[0] ?? '', /OpenSignet:/, `${path}: the brand separator is a pipe`);
    const tags = metaTags(head);
    for (const [key, values] of tags) {
      if (!REPEATABLE.has(key)) assert.equal(values.length, 1, `${path}: duplicate ${key}`);
    }
    for (const key of ['description', 'og:title', 'og:description', 'og:image', 'twitter:title']) {
      assert.equal(tags.get(key)?.length, 1, `${path}: ${key}`);
    }
    assert.equal(tags.get('twitter:image')?.length, 1, path);
    assert.deepEqual(tags.get('og:site_name'), ['OpenSignet'], path);
    const shareTitle = tags.get('og:title')?.[0] ?? '';
    assert.doesNotMatch(
      shareTitle,
      /^OpenSignet\b|OpenSignet:/,
      `${path}: share title repeats the site name`,
    );
    assert.notEqual(shareTitle, tags.get('description')?.[0], path);
    assert.equal(tags.get('twitter:title')?.[0], shareTitle, path);
    const canonicals = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(
      (match) => match[1] ?? '',
    );
    if (response.status === 404) {
      assert.deepEqual(canonicals, [], path);
      assert.deepEqual(tags.get('robots'), ['noindex'], path);
    } else {
      assert.equal(canonicals.length, 1, path);
      assert.ok(canonicals[0]?.startsWith('https://opensignet.com'), `${path}: ${canonicals[0]}`);
      assert.equal(tags.get('og:url')?.[0], canonicals[0], path);
    }
  }
});

test('support page publishes its own metadata exactly once', async () => {
  const html = await (await fetch(new URL('/support', origin))).text();
  const head = html.slice(0, html.indexOf('</head>'));
  assert.deepEqual(
    [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]),
    ['Support | OpenSignet'],
  );
  assert.equal(
    (head.match(/<link rel="canonical" href="https:\/\/opensignet\.com\/support"/g) ?? []).length,
    1,
  );
  assert.equal((head.match(/<meta name="description"/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>How can we help\?<\/h1>/);
  const sitemap = await (await fetch(new URL('/sitemap.xml', origin))).text();
  assert.match(sitemap, /<loc>https:\/\/opensignet\.com\/support<\/loc>/);
  const llms = await (await fetch(new URL('/llms.txt', origin))).text();
  assert.match(llms, /https:\/\/opensignet\.com\/support/);
});

test('discovery files describe the site without blocking rendering assets', async () => {
  const robots = await (await fetch(new URL('/robots.txt', origin))).text();
  assert.match(robots, /Sitemap: https:\/\/opensignet\.com\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow: \/_next/);
  const manifestResponse = await fetch(new URL('/manifest.webmanifest', origin));
  assert.equal(manifestResponse.status, 200);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    icons: Array<{ src: string }>;
  };
  assert.equal(manifest.name, 'OpenSignet');
  for (const icon of manifest.icons) {
    assert.equal((await fetch(new URL(icon.src, origin))).status, 200, icon.src);
  }
  const llms = await fetch(new URL('/llms.txt', origin));
  assert.equal(llms.status, 200);
  assert.match(
    await llms.text(),
    /^# OpenSignet\n\n> OpenSignet is the agent-native identity and communications infrastructure\./,
  );
  const security = await (await fetch(new URL('/.well-known/security.txt', origin))).text();
  assert.match(security, /^Contact: /m);
  const expires = /^Expires: (.+)$/m.exec(security)?.[1] ?? '';
  assert.ok(Date.parse(expires) > Date.now(), 'security.txt must not be expired');
});

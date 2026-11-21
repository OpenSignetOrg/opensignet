import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
const primary = 'OpenSignet is the agent-native identity and communications infrastructure.';
const descriptor = 'Programmable identity and communication infrastructure for AI agents.';
const title = 'Agent-Native Identity and Communications Infrastructure';
const retired =
  /identity infrastructure for the|agent economy|autonomous identity stack|no human required|zero human intervention/i;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

async function sourceTree(path: string): Promise<ts.SourceFile> {
  const source = await read(path);
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findNodes<T extends ts.Node>(
  tree: ts.SourceFile,
  predicate: (node: ts.Node) => node is T,
): T[] {
  const nodes: T[] = [];
  function visit(node: ts.Node): void {
    if (predicate(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return nodes;
}

function isElement(tree: ts.SourceFile, tag: string) {
  return (node: ts.Node): node is ts.JsxElement =>
    ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === tag;
}

function jsxText(node: ts.Node): string {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxElement(node)) return node.children.map(jsxText).join('');
  if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
    return node.expression.text;
  }
  return '';
}

test('homepage leads with both pillars and includes direct, guided, and permissioned use', async () => {
  const tree = await sourceTree('apps/frontend/src/components/landing/hero.tsx');
  const headings = findNodes(tree, isElement(tree, 'h1'));
  assert.equal(headings.length, 1);
  const [heading] = headings;
  assert.ok(heading);
  assert.equal(
    normalize(jsxText(heading)),
    'Agent-native identity and communications infrastructure',
  );
  const copy = normalize(tree.getFullText());
  assert.ok(copy.includes(descriptor));
  assert.ok(
    copy.includes(
      'developers using APIs and SDKs, people guiding agents, and permissioned autonomous workflows',
    ),
  );
  assert.doesNotMatch(copy, retired);
  const className = heading.openingElement.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((node) => node.name.getText(tree) === 'className')?.initializer;
  assert.ok(className && ts.isStringLiteral(className));
  const classes = className.text;
  for (const name of [
    'wrap-anywhere',
    'text-balance',
    'text-3xl',
    'sm:text-5xl',
    'md:text-7xl',
    'tracking-normal',
  ]) {
    assert.ok(classes.split(/\s+/).includes(name), name);
  }
  assert.doesNotMatch(classes, /nowrap|overflow-|truncate|tracking-tight|\b(?:vw|cqw)\b|clamp\(/);
});

function stringConstant(tree: ts.SourceFile, name: string): string {
  const [declaration] = findNodes(
    tree,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && node.name.getText(tree) === name,
  );
  const value = declaration?.initializer;
  assert.ok(value && ts.isStringLiteralLike(value), `${name} must be a string literal`);
  return value.text;
}

test('site, page, wallet, and social definitions stay aligned without repeating in previews', async () => {
  const seo = await sourceTree('apps/frontend/src/lib/seo.ts');
  assert.equal(stringConstant(seo, 'PRODUCT_DEFINITION'), primary);
  const homeTitle = stringConstant(seo, 'HOME_TITLE');
  assert.equal(homeTitle, `OpenSignet | ${title}`);
  assert.doesNotMatch(homeTitle, /OpenSignet:/);
  assert.equal(stringConstant(seo, 'HOME_SOCIAL_TITLE').toLowerCase(), title.toLowerCase());
  const description = stringConstant(seo, 'DEFAULT_DESCRIPTION');
  // The share card already shows the name and the definition; the description adds the parts.
  assert.doesNotMatch(description, /OpenSignet/);
  assert.ok(!description.toLowerCase().includes('communications infrastructure'));
  assert.match(description, /^Domains, DNS, email, onchain identity and payments/);
  assert.match(
    description,
    /developers, people guiding agents and permissioned autonomous workflows/,
  );
  assert.ok(description.length <= 160, 'Search snippets keep the full description');
  assert.match(seo.getFullText(), /description: PRODUCT_SUMMARY/);
  assert.match(seo.getFullText(), /description: options\.description/);
  for (const path of ['apps/frontend/src/app/layout.tsx', 'apps/frontend/src/app/page.tsx']) {
    const source = await read(path);
    assert.match(source, /HOME_TITLE/, path);
    assert.match(source, /HOME_SOCIAL_TITLE/, path);
  }
  const wallet = await sourceTree('apps/frontend/src/lib/wagmi.ts');
  assert.ok(findNodes(wallet, ts.isStringLiteral).some((node) => node.text === descriptor));
  const brand = JSON.parse(await read('apps/frontend/src/lib/brand-assets.json')) as {
    socialImage: { alt: string };
    assets: Record<string, string>;
  };
  assert.equal(
    brand.socialImage.alt,
    'OpenSignet logo and wordmark with the line: The agent-native identity and communications infrastructure.',
  );
  assert.equal(brand.assets.socialCard, '/brand/social/opensignet-social-card.jpg');
  assert.equal(brand.assets.socialCardOriginal, '/brand/social/opensignet-social-card.png');
});

test('product introductions no longer restrict the product to autonomous agents', async () => {
  for (const path of [
    'apps/frontend/src/app/terms/page.tsx',
    'packages/sdk/README.md',
    'packages/agentkit-plugin/README.md',
    'packages/eliza-plugin/README.md',
  ]) {
    const copy = normalize(await read(path));
    assert.doesNotMatch(copy, retired, path);
    assert.doesNotMatch(
      copy,
      /provide autonomous AI agents|intended for autonomous agent|Autonomous identity registered/,
      path,
    );
  }
  const solutions = await sourceTree('apps/frontend/src/lib/solution-pages.ts');
  const strings = findNodes(solutions, ts.isStringLiteral).map((node) => node.text);
  assert.ok(strings.includes(primary));
  assert.ok(strings.includes('AI Agent Identity: Persistent Internet Identity for AI Agents'));
  assert.ok(
    strings.some((text) =>
      /Developers integrate through the REST API.*People guide agents.*within the permissions they set/.test(
        text,
      ),
    ),
  );
  assert.ok(strings.includes('Onchain Identity with the OpenSignet Pass, Basename, and ENS'));
  assert.ok(strings.includes('Autonomous Agent Renewals for Persistent Domains and Identities'));
  assert.ok(
    strings.includes('Email is currently text-only. Rich HTML and attachments are not supported.'),
  );
});

test('full-workflow package metadata names identity and communications; read-only tools remain scoped', async () => {
  for (const name of ['sdk', 'mcp-server', 'agentkit-plugin', 'eliza-plugin']) {
    const manifest = JSON.parse(await read(`packages/${name}/package.json`));
    assert.match(manifest.description, /agent-native identity and communications/);
  }
  const eliza = await sourceTree('packages/eliza-plugin/src/index.ts');
  assert.ok(findNodes(eliza, ts.isStringLiteral).some((node) => node.text === descriptor));
  const langchain = JSON.parse(await read('packages/langchain-plugin/package.json'));
  assert.equal(
    langchain.description,
    'Read-only LangChain tools for OpenSignet identity and renewal observations',
  );
});

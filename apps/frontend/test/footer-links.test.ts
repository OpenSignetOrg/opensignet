import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const expectedMcpLink = 'https://docs.opensignet.com/sdk/mcp/';
const footerUrl = new URL('../src/components/landing/footer.tsx', import.meta.url);

interface FooterLink {
  label: string;
  href: string;
}

function footerLinks(source: string): FooterLink[] {
  const tree = ts.createSourceFile(
    'footer.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const scopes = tree.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'Footer',
  );
  assert.equal(scopes.length, 1);
  const links: FooterLink[] = [];
  function collect(node: ts.Node): void {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'a') {
      const label = node.children
        .filter(ts.isJsxText)
        .map((child) => child.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (label) {
        const href = node.openingElement.attributes.properties
          .filter(ts.isJsxAttribute)
          .find((attribute) => attribute.name.getText(tree) === 'href');
        assert.ok(href?.initializer && ts.isStringLiteral(href.initializer));
        links.push({ label, href: href.initializer.text });
      }
    }
    ts.forEachChild(node, collect);
  }
  const [footer] = scopes;
  assert.ok(footer);
  collect(footer);
  return links;
}

function mcpFooterLinks(source: string): string[] {
  return footerLinks(source)
    .filter((link) => link.label === 'MCP integration')
    .map((link) => link.href);
}

test('footer publishes the exact product, identity, infrastructure, developer and company destinations', async () => {
  const source = await readFile(footerUrl, 'utf8');
  assert.deepEqual(footerLinks(source), [
    { label: 'Register', href: '/register' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'AI agent identity', href: '/ai-agent-identity' },
    { label: 'Domains for agents', href: '/domains-for-ai-agents' },
    { label: 'Onchain identity', href: '/onchain-agent-identity' },
    { label: 'Autonomous renewals', href: '/autonomous-agent-renewals' },
    { label: 'Agent email', href: '/email-for-ai-agents' },
    { label: 'Programmable DNS', href: '/dns-for-ai-agents' },
    { label: 'Registration API', href: '/domain-registration-api' },
    { label: 'x402 payments', href: '/x402-agent-payments' },
    { label: 'Documentation', href: 'https://docs.opensignet.com' },
    { label: 'MCP integration', href: expectedMcpLink },
    { label: 'Coinbase AgentKit', href: 'https://docs.opensignet.com/frameworks/agentkit/' },
    { label: 'GitHub', href: 'https://github.com/OpenSignetOrg/opensignet' },
    { label: 'Home', href: '/' },
    { label: 'Support', href: '/support' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'X (Twitter)', href: 'https://x.com/OpenSignetHQ' },
  ]);
  assert.match(source, /OpenSignet\. All rights reserved\./);
  assert.doesNotMatch(source, /Built on Base\./);
});

test('shared responsive footer links MCP integration to the exact published docs target', async () => {
  const source = await readFile(footerUrl, 'utf8');
  assert.deepEqual(mcpFooterLinks(source), [expectedMcpLink]);
});

test('homepage organization metadata points to the current public GitHub source', async () => {
  const source = await readFile(new URL('../src/lib/seo.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('seo.ts', source, ts.ScriptTarget.Latest, true);
  const homepage = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'homepageJsonLd',
  );
  assert.ok(homepage);
  const links: string[] = [];
  function collect(node: ts.Node): void {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'sameAs') {
      assert.ok(ts.isArrayLiteralExpression(node.initializer));
      for (const element of node.initializer.elements) {
        assert.ok(ts.isStringLiteral(element));
        links.push(element.text);
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(homepage);
  assert.deepEqual(links, ['https://github.com/OpenSignetOrg/opensignet']);
});

test('footer link regression rejects the old route and URL lookalikes', async () => {
  const source = await readFile(footerUrl, 'utf8');
  for (const href of [
    '/integrations/mcp',
    'https://docs.opensignet.com.invalid/sdk/mcp/',
    'https://example.invalid/?next=https://docs.opensignet.com/sdk/mcp/',
    'https://docs.opensignet.com/sdk/mcp/extra',
    'https://docs.opensignet.com/sdk/mcp/?redirect=1',
  ]) {
    const changedSource = source.replace(`href="${expectedMcpLink}"`, `href="${href}"`);
    assert.deepEqual(mcpFooterLinks(changedSource), [href]);
    assert.notDeepEqual(mcpFooterLinks(changedSource), [expectedMcpLink]);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

interface JsxNode {
  tag: string;
  classes: string[];
  attributes: Map<string, ts.JsxAttributeValue | undefined>;
  children: ts.NodeArray<ts.JsxChild>;
}

async function elements(path: string): Promise<JsxNode[]> {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result: JsxNode[] = [];
  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node)) {
      const attributes = new Map(
        node.openingElement.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attribute) => [attribute.name.getText(tree), attribute.initializer] as const),
      );
      const className = attributes.get('className');
      result.push({
        tag: node.openingElement.tagName.getText(tree),
        classes: className && ts.isStringLiteral(className) ? className.text.split(/\s+/) : [],
        attributes,
        children: node.children,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

function find(nodes: JsxNode[], predicate: (node: JsxNode) => boolean): JsxNode {
  const node = nodes.find(predicate);
  assert.ok(node, 'Expected JSX element was not found');
  return node;
}

function expressionText(value: ts.JsxAttributeValue | undefined): string | undefined {
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression && ts.isNumericLiteral(value.expression)) {
    return value.expression.text;
  }
  return undefined;
}

test('solution content and code can shrink inside mobile and desktop grid tracks', async () => {
  const nodes = await elements('../src/components/seo/solution-page.tsx');
  const grid = find(nodes, (node) => node.tag === 'section' && node.classes.includes('grid'));
  assert.ok(grid.classes.includes('grid-cols-1'));
  assert.ok(grid.classes.includes('lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]'));
  const aside = find(nodes, (node) => node.tag === 'aside');
  assert.ok(aside.classes.includes('min-w-0'));
  // The code example uses the shared code card, whose code area shrinks and scrolls on its own.
  const pageSource = await readFile(
    new URL('../src/components/seo/solution-page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(pageSource, /<CodeCard title=\{page\.codeTitle\} code=\{page\.code\}/);
  const cardPath = '../src/components/ui/code-card.tsx';
  const cardSource = await readFile(new URL(cardPath, import.meta.url), 'utf8');
  assert.match(cardSource, /'max-w-full /);
  assert.match(cardSource, /'mobile-scroll overflow-x-auto'/);
  const pre = find(await elements(cardPath), (node) => node.tag === 'pre');
  assert.equal(expressionText(pre.attributes.get('tabIndex')), '0');
  assert.equal(expressionText(pre.attributes.get('role')), 'region');
  assert.ok(pre.attributes.has('aria-label'));
  assert.ok(find(nodes, (node) => node.tag === 'h1').classes.includes('wrap-anywhere'));
});

test('the pricing page uses the shared page-header style without a text highlight', async () => {
  const page = await elements('../src/app/pricing/page.tsx');
  const support = await elements('../src/app/support/page.tsx');
  const heading = find(page, (node) => node.tag === 'h1');
  const supportHeading = find(support, (node) => node.tag === 'h1');
  assert.deepEqual(heading.classes, supportHeading.classes);
  const pricing = await elements('../src/components/landing/pricing.tsx');
  for (const nodes of [page, pricing])
    assert.equal(nodes.filter((node) => node.classes.includes('gradient-text')).length, 0);
  assert.equal(pricing.filter((node) => node.tag === 'h1').length, 0, 'the page owns the only h1');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path: string) =>
  readFile(new URL(`../src/components/landing/${path}`, import.meta.url), 'utf8');

const expectedLinks = ['/pricing', '/register', '/support', 'https://docs.opensignet.com'];
const expectedIcons = ['CircleDollarSign', 'UserRoundPlus', 'Headset', 'BookOpen'];

function primaryLinks(source: string): Array<{ href: string; icon: string }> {
  const tree = ts.createSourceFile('nav-links.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => item.name.getText(tree) === 'PRIMARY_NAV_LINKS');
  assert.ok(declaration?.initializer && ts.isArrayLiteralExpression(declaration.initializer));
  return declaration.initializer.elements.map((element) => {
    assert.ok(ts.isObjectLiteralExpression(element));
    const value = (name: string) => {
      const property = element.properties
        .filter(ts.isPropertyAssignment)
        .find((item) => item.name.getText(tree) === name);
      assert.ok(property, name);
      return property.initializer;
    };
    const href = value('href');
    const icon = value('icon');
    assert.ok(ts.isStringLiteral(href) && ts.isIdentifier(icon));
    return { href: href.text, icon: icon.text };
  });
}

test('one shared primary navigation: Register replaces Registry; How it works and Identity Check are retired', async () => {
  const links = primaryLinks(await read('nav-links.ts'));
  assert.deepEqual(
    links.map((link) => link.href),
    expectedLinks,
  );
  assert.deepEqual(
    links.map((link) => link.icon),
    expectedIcons,
  );
  for (const file of ['nav.tsx', 'public-nav.tsx']) {
    const source = await read(file);
    assert.match(source, /PRIMARY_NAV_LINKS\.map/, file);
    assert.doesNotMatch(source, /\/#how-it-works|href="\/verify"|mailto:/, file);
    assert.match(source, /aria-current=\{isCurrentNavLink\(/, file);
    // Mobile rows always show icons; the desktop bar shows them from 1024px (labels only below).
    assert.match(source, /navIconClass/, file);
    assert.match(source, /desktopNavIconClass/, file);
    assert.match(source, /<ChevronRight className=\{navChevronClass\}/, file);
    // Register lives only in the navigation; the account control is the auth-aware sign-in button
    // (desktop bar and mobile menu), which opens the sign-in page.
    assert.equal((source.match(/<HeaderSignInButton\b/g) ?? []).length, 2, file);
    assert.doesNotMatch(
      source,
      /href="\/register"|href="\/dashboard"|<UserRoundPlus\b|<LayoutDashboard\b/,
      file,
    );
    assert.match(source, /<Menu\b/);
    assert.match(source, /<X\b/);
  }
});

test('navigation rows read as controls: real hit areas, tints, focus rings and a current mark', async () => {
  const source = await read('nav-links.ts');
  for (const token of [
    'min-h-11',
    'hover:bg-accent/80',
    'active:bg-accent',
    'focus-visible:ring-2',
    'aria-[current=page]:before:bg-[hsl(var(--brand-orange))]',
    'h-9',
    'aria-[current=page]:after:bg-[hsl(var(--brand-orange))]',
    'motion-reduce:transition-none',
  ])
    assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /blue|sky-|indigo/);
});

for (const filename of ['nav.tsx', 'public-nav.tsx']) {
  test(`${filename} keeps the mobile menu toggle square without the taller touch-target override`, async () => {
    const source = await read(filename);
    const tree = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const toggles: string[][] = [];
    function collect(node: ts.Node): void {
      if (
        ts.isJsxOpeningElement(node) &&
        ['summary', 'button'].includes(node.tagName.getText(tree))
      ) {
        const attributes = new Map(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attribute) => [attribute.name.getText(tree), attribute.initializer] as const),
        );
        const label = attributes.get('aria-label');
        if (
          node.tagName.getText(tree) === 'summary' ||
          (label && ts.isStringLiteral(label) && label.text === 'Toggle navigation')
        ) {
          const className = attributes.get('className');
          assert.ok(className && ts.isStringLiteral(className));
          toggles.push(className.text.split(/\s+/));
        }
      }
      ts.forEachChild(node, collect);
    }
    collect(tree);
    assert.equal(toggles.length, 1);
    const [toggle] = toggles;
    assert.ok(toggle);
    for (const token of ['h-10', 'w-10', 'shrink-0']) assert.ok(toggle.includes(token));
    assert.ok(!toggle.includes('touch-target'));
  });
}

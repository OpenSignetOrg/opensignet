import ts from 'typescript';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = resolve(root, 'src');
const workspace = resolve(root, '../..');
const publicPackages = new Map(
  ['sdk', 'shared'].map((name) => [
    `@opensignet/${name}`,
    resolve(workspace, 'packages', name, 'src'),
  ]),
);
const frontendEnv = new Set([
  'NODE_ENV',
  'FRONTEND_PUBLIC_API_URL',
  'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_WALLET_FRAME_ORIGIN',
]);

export interface SourceInspection {
  imports: string[];
  errors: string[];
  client: boolean;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
}

function isDirective(node: ts.Node, directive: string): boolean {
  return (
    ts.isExpressionStatement(node) &&
    ts.isStringLiteral(node.expression) &&
    node.expression.text === directive
  );
}

function importsServerCookies(node: ts.ImportDeclaration): boolean {
  if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'next/headers') {
    return false;
  }
  const bindings = node.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.some(
    (item) => item.name.text === 'cookies' || item.propertyName?.text === 'cookies',
  );
}

export function inspectSource(text: string, filename = 'fixture.ts'): SourceInspection {
  const file = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const errors: string[] = [];
  const client = file.statements.some((node) => isDirective(node, 'use client'));

  function addImport(node: ts.Node | undefined | null): void {
    if (!node || !ts.isStringLiteralLike(node)) errors.push('Nonliteral module reference');
    else imports.push(node.text);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) addImport(node.moduleSpecifier);
    }
    if (ts.isImportTypeNode(node)) {
      addImport(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      addImport(node.arguments[0]);
    }
    if (isDirective(node, 'use server')) errors.push('Server action');
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(file) === 'process.env' &&
      !frontendEnv.has(node.name.text)
    ) {
      errors.push(`Backend environment dependency: ${node.name.text}`);
    }
    if (ts.isElementAccessExpression(node) && node.expression.getText(file) === 'process.env') {
      errors.push('Computed environment access');
    }
    if (ts.isImportDeclaration(node) && importsServerCookies(node)) {
      errors.push('Server cookie/session access');
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  for (const specifier of imports) {
    if (
      /^(node:|@aws-sdk\/|@google-cloud\/|@upstash\/|@opensignet\/storage)|(^|\/)(db|services|storage)(\/|$)/.test(
        specifier,
      )
    ) {
      errors.push(`Private module: ${specifier}`);
    }
  }
  return { imports, errors, client };
}

/** Application source is TypeScript only; any JavaScript file in the tree is reported. */
export function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Source symlinks are not allowed');
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (/\.(?:[cm]?js|jsx)$/.test(entry.name)) {
      throw new Error(`JavaScript source is not allowed: ${relative(root, path)}`);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function resolveModule(candidate: string): string {
  const base = candidate.replace(/\.js$/, '');
  const target = [
    candidate,
    `${base}.ts`,
    `${base}.tsx`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
  ].find((path) => existsSync(path) && extname(path));
  if (!target) throw new Error(`Unresolved source import: ${relative(root, candidate)}`);
  return target;
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

export function auditSourceGraph(): { files: string[]; errors: string[] } {
  const manifest = readManifest(resolve(root, 'package.json'));
  const dependencySets = new Map<string, Set<string>>([
    [sourceRoot, new Set(Object.keys(manifest.dependencies ?? {}))],
  ]);
  for (const packageRoot of publicPackages.values()) {
    const packageManifest = readManifest(resolve(packageRoot, '../package.json'));
    dependencySets.set(packageRoot, new Set(Object.keys(packageManifest.dependencies ?? {})));
  }
  const pending = sourceFiles(sourceRoot);
  const visited = new Set<string>();
  const errors: string[] = [];
  const edges = new Map<string, string[]>();
  const clients: string[] = [];
  while (pending.length) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    const allowedBare = [...dependencySets].find(([base]) => file.startsWith(base + sep))?.[1];
    if (!allowedBare) {
      errors.push(`${relative(root, file)}: Source outside reviewed roots`);
      continue;
    }
    const { imports, errors: found, client } = inspectSource(readFileSync(file, 'utf8'), file);
    const fileEdges: string[] = [];
    edges.set(file, fileEdges);
    if (client) clients.push(file);
    errors.push(...found.map((error) => `${relative(root, file)}: ${error}`));
    for (const specifier of imports) {
      if (specifier.endsWith('.css')) continue;
      let candidate: string | undefined;
      if (specifier.startsWith('@/')) candidate = resolve(sourceRoot, specifier.slice(2));
      else if (specifier.startsWith('.')) candidate = resolve(dirname(file), specifier);
      else {
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] ?? specifier);
        if (!allowedBare.has(name)) {
          errors.push(`${relative(root, file)}: Undeclared dependency ${name}`);
        }
        const packageRoot = publicPackages.get(name);
        if (packageRoot) {
          candidate = resolve(packageRoot, specifier.slice(name.length + 1) || 'index');
        }
      }
      if (!candidate) continue;
      const target = candidate;
      const allowed = [sourceRoot, ...publicPackages.values()].some((base) =>
        target.startsWith(base + sep),
      );
      if (!allowed) {
        errors.push(`${relative(root, file)}: Import escapes frontend/public package source`);
        continue;
      }
      try {
        const resolved = resolveModule(target);
        pending.push(resolved);
        fileEdges.push(resolved);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return { files: [...visited], errors };
}

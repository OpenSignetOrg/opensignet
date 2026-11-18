/**
 * Renders the OpenSignet share cards and wordmark lockups from approved sources only:
 * the vector mark in `brand/logo/opensignet-logo.svg` (geometry, ink and shadow unchanged), the
 * Geist typeface that Next.js ships, and the dotted-globe land mask in
 * `brand-art/globe-land-mask.json`.
 *
 * Usage: node scripts/render-brand-cards.ts
 * The browser is taken from OPENSIGNET_BROWSER_EXECUTABLE (or OPENSIGNET_TEST_BROWSER_EXECUTABLE),
 * falling back to a locally installed Chrome or Edge. Output is written into the canonical `brand/`
 * directory and synced to the app mirrors. After reviewing it, re-pin the approved hashes with
 * `pnpm assets:generate --refresh-rendered`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBrand } from '../../../scripts/sync-brand.ts';
import { loadSharp } from './sharp.ts';
import { frontendRoot, repositoryRoot } from './verify-assets.ts';

const BRAND = resolve(repositoryRoot, 'brand');
const LOGO_SVG = resolve(BRAND, 'logo/opensignet-logo.svg');
const WORDMARK = 'OpenSignet';
const TAGLINE = ['The agent-native identity and', 'communications infrastructure.'] as const;

// Warm neutrals with the site's brand orange (--brand-orange: hsl(22 95% 52%)); no blue tints.
const COLORS = {
  paper: '#f8f6f2',
  paperEdge: '#f0ece5',
  // Matches the ink of the approved mark in opensignet-logo.svg.
  ink: '#131413',
  text: '#1f201d',
  muted: '#6b665d',
  accent: '#f96610',
  orbit: '#f96610',
  globeDot: '#b3a698',
  band: '#efe7dd',
  shadow: '#2b2117',
} as const;

interface GlobeMask {
  size: number;
  cellPixels: number;
  radiusPixels: number;
  globeRadiusPixels: number;
  badgeRadiusPixels: number;
  bits: string;
}

interface CardSpec {
  kind: 'card';
  output: string;
  width: number;
  height: number;
  globe: { x: number; y: number; radius: number };
  /** Left edge, vertical centre and width of the lockup + tagline column. */
  column: { x: number; centerY: number; width: number };
  footnote?: string;
  decorations: Array<{ x: number; y: number; type: 'ring' | 'dot' }>;
  bands: Array<{ x: number; y: number; width: number; height: number; angle: number }>;
}

interface LockupSpec {
  kind: 'lockup';
  output: string;
  width: number;
  height: number;
  layout: 'stacked' | 'horizontal';
  /** Mark height and wordmark width in pixels; the composition is centred on the canvas. */
  markHeight: number;
  wordmarkWidth: number;
  gap: number;
}

type Spec = CardSpec | LockupSpec;

const SPECS: readonly Spec[] = [
  {
    kind: 'card',
    output: resolve(BRAND, 'social/opensignet-social-card.png'),
    width: 1731,
    height: 908,
    globe: { x: 438, y: 430, radius: 212 },
    column: { x: 838, centerY: 448, width: 790 },
    decorations: [
      { x: 167, y: 341, type: 'ring' },
      { x: 671, y: 247, type: 'ring' },
      { x: 518, y: 685, type: 'ring' },
      { x: 100, y: 734, type: 'ring' },
      { x: 1673, y: 190, type: 'ring' },
      { x: 563, y: 209, type: 'dot' },
      { x: 164, y: 513, type: 'dot' },
      { x: 234, y: 616, type: 'dot' },
      { x: 676, y: 561, type: 'dot' },
    ],
    bands: [
      { x: 1560, y: -120, width: 120, height: 560, angle: 28 },
      { x: 1640, y: 560, width: 150, height: 520, angle: 28 },
      { x: -40, y: 640, width: 140, height: 420, angle: 28 },
    ],
  },
  {
    kind: 'card',
    output: resolve(BRAND, 'social/opensignet-docs-social-card.png'),
    width: 1731,
    height: 908,
    globe: { x: 438, y: 430, radius: 212 },
    column: { x: 838, centerY: 448, width: 790 },
    footnote: 'docs.opensignet.com',
    decorations: [
      { x: 167, y: 341, type: 'ring' },
      { x: 671, y: 247, type: 'ring' },
      { x: 518, y: 685, type: 'ring' },
      { x: 100, y: 734, type: 'ring' },
      { x: 1673, y: 190, type: 'ring' },
      { x: 563, y: 209, type: 'dot' },
      { x: 164, y: 513, type: 'dot' },
      { x: 234, y: 616, type: 'dot' },
      { x: 676, y: 561, type: 'dot' },
    ],
    bands: [
      { x: 1560, y: -120, width: 120, height: 560, angle: 28 },
      { x: 1640, y: 560, width: 150, height: 520, angle: 28 },
      { x: -40, y: 640, width: 140, height: 420, angle: 28 },
    ],
  },
  {
    kind: 'card',
    output: resolve(BRAND, 'social/opensignet-x-banner.png'),
    width: 2172,
    height: 724,
    globe: { x: 486, y: 352, radius: 198 },
    column: { x: 940, centerY: 362, width: 860 },
    decorations: [
      { x: 114, y: 343, type: 'ring' },
      { x: 590, y: 551, type: 'ring' },
      { x: 2010, y: 150, type: 'ring' },
      { x: 601, y: 156, type: 'dot' },
      { x: 248, y: 389, type: 'dot' },
      { x: 312, y: 511, type: 'dot' },
      { x: 742, y: 250, type: 'dot' },
    ],
    bands: [
      { x: 1960, y: 120, width: 150, height: 760, angle: 30 },
      { x: 60, y: 520, width: 130, height: 480, angle: 30 },
    ],
  },
  {
    kind: 'lockup',
    output: resolve(BRAND, 'wordmark/opensignet-wordmark-stacked.png'),
    width: 1254,
    height: 1254,
    layout: 'stacked',
    markHeight: 465,
    wordmarkWidth: 1000,
    gap: 70,
  },
  {
    kind: 'lockup',
    output: resolve(BRAND, 'wordmark/opensignet-wordmark-horizontal.png'),
    width: 2172,
    height: 724,
    layout: 'horizontal',
    markHeight: 325,
    wordmarkWidth: 1380,
    gap: 100,
  },
];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The approved mark exactly as published: defs, ink, shadow and geometry. */
function markSource(): { defs: string; group: string } {
  const svg = readFileSync(LOGO_SVG, 'utf8');
  const defs = /<defs>([\s\S]*?)<\/defs>/.exec(svg)?.[1];
  const group = /<g id="logo"[\s\S]*<\/g>\s*(?=<\/svg>)/.exec(svg)?.[0];
  if (!defs || !group)
    throw new Error('opensignet-logo.svg no longer contains the approved mark group.');
  return { defs, group };
}

function markSvg(id: string, height: number): string {
  const { defs, group } = markSource();
  // Unique ids keep several copies of the mark independent on one page.
  const scoped = (text: string) =>
    text.replaceAll('id="', `id="${id}-`).replaceAll('url(#', `url(#${id}-`);
  return `<svg class="mark" data-mark="${id}" style="height:${height}px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" overflow="visible"><defs>${scoped(defs)}</defs>${scoped(group)}</svg>`;
}

function loadMask(): { mask: GlobeMask; land: (x: number, y: number) => boolean } {
  const mask = JSON.parse(
    readFileSync(resolve(frontendRoot, 'scripts/brand-art/globe-land-mask.json'), 'utf8'),
  ) as GlobeMask;
  const bits = Buffer.from(mask.bits, 'base64');
  const land = (x: number, y: number) => {
    const i = Math.floor((x + mask.radiusPixels) / mask.cellPixels);
    const j = Math.floor((y + mask.radiusPixels) / mask.cellPixels);
    if (i < 0 || j < 0 || i >= mask.size || j >= mask.size) return false;
    const index = j * mask.size + i;
    return ((bits[index >> 3] ?? 0) & (128 >> (index & 7))) !== 0;
  };
  return { mask, land };
}

function globeSvg(spec: CardSpec): string {
  const { mask, land } = loadMask();
  const { x: cx, y: cy, radius } = spec.globe;
  const scale = radius / mask.globeRadiusPixels;
  const badge = mask.badgeRadiusPixels * scale;
  const pitch = 4.6;
  const dots: string[] = [];
  for (let gy = -mask.globeRadiusPixels; gy <= mask.globeRadiusPixels; gy += pitch) {
    for (let gx = -mask.globeRadiusPixels; gx <= mask.globeRadiusPixels; gx += pitch) {
      const distance = Math.hypot(gx, gy) / mask.globeRadiusPixels;
      if (distance > 0.985 || distance * mask.globeRadiusPixels < mask.badgeRadiusPixels + 6) {
        continue;
      }
      if (!land(gx, gy)) continue;
      const opacity = 0.8 - 0.4 * distance ** 3;
      const size = (1.5 - 0.4 * distance ** 2) * scale;
      dots.push(
        `<circle cx="${(cx + gx * scale).toFixed(1)}" cy="${(cy + gy * scale).toFixed(1)}" r="${size.toFixed(2)}" opacity="${opacity.toFixed(2)}"/>`,
      );
    }
  }
  const orbit = (r: number, opacity: number, width = 1.4) =>
    `<circle cx="${cx}" cy="${cy}" r="${(r * scale).toFixed(1)}" fill="none" stroke="${COLORS.orbit}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;
  const decorations = spec.decorations
    .map(({ x, y, type }) =>
      type === 'ring'
        ? `<circle cx="${x}" cy="${y}" r="${(9.5 * scale).toFixed(1)}" fill="${COLORS.paper}" stroke="${COLORS.accent}" stroke-width="${(2.6 * scale).toFixed(2)}"/>`
        : `<circle cx="${x}" cy="${y}" r="${(3.2 * scale).toFixed(1)}" fill="${COLORS.accent}"/>`,
    )
    .join('');
  const bands = spec.bands
    .map(
      ({ x, y, width, height, angle }) =>
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="url(#band)" transform="rotate(${angle} ${x + width / 2} ${y + height / 2})"/>`,
    )
    .join('');
  return `<svg class="art" xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLORS.band}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${COLORS.band}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${COLORS.band}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${(14 * scale).toFixed(1)}" stdDeviation="${(16 * scale).toFixed(1)}" flood-color="${COLORS.shadow}" flood-opacity="0.16"/>
      <feDropShadow dx="0" dy="${(2 * scale).toFixed(1)}" stdDeviation="${(2.5 * scale).toFixed(1)}" flood-color="${COLORS.shadow}" flood-opacity="0.08"/>
    </filter>
  </defs>
  ${bands}
  <circle cx="${cx}" cy="${cy}" r="${(300 * scale).toFixed(1)}" fill="url(#halo)"/>
  ${orbit(300, 0.42, 1.3)}
  ${orbit(271, 0.3, 1.1)}
  ${orbit(232, 0.18, 1)}
  <g fill="${COLORS.globeDot}">${dots.join('')}</g>
  <circle cx="${cx}" cy="${cy}" r="${badge.toFixed(1)}" fill="#ffffff" filter="url(#badge-shadow)"/>
  ${decorations}
</svg>`;
}

function fontFace(): string {
  const require = createRequire(import.meta.url);
  const nextRoot = dirname(require.resolve('next/package.json'));
  const font = resolve(nextRoot, 'dist/next-devtools/server/font/geist-latin.woff2');
  const data = readFileSync(font).toString('base64');
  return `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900;font-display:block}`;
}

function cardHtml(spec: CardSpec): string {
  const markHeight = Math.round(spec.column.width * 0.183);
  const tagline = `<span class="dark">${escapeXml(TAGLINE[0])}</span><br><span class="accent">${escapeXml(TAGLINE[1])}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace()}
html,body{margin:0;width:${spec.width}px;height:${spec.height}px;overflow:hidden}
body{background:radial-gradient(120% 140% at 30% 40%,${COLORS.paper} 55%,${COLORS.paperEdge} 100%);font-family:"Geist",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.art{position:absolute;inset:0}
.badge-mark{position:absolute}
.column{position:absolute;left:${spec.column.x}px;top:0;width:${spec.column.width}px}
.lockup{display:flex;align-items:center;gap:${Math.round(markHeight * 0.36)}px}
.word{font-weight:600;color:${COLORS.ink};letter-spacing:-0.025em;line-height:1;white-space:nowrap}
.rule{width:${Math.round(spec.column.width * 0.098)}px;height:${Math.max(4, Math.round(spec.column.width * 0.0055))}px;border-radius:999px;background:${COLORS.accent};margin:${Math.round(markHeight * 0.3)}px 0 ${Math.round(markHeight * 0.24)}px}
.tagline{font-weight:450;font-size:${Math.round(spec.column.width * 0.0455)}px;line-height:1.36;letter-spacing:-0.01em;color:${COLORS.text}}
.accent{color:${COLORS.accent}}
.footnote{margin-top:${Math.round(markHeight * 0.2)}px;font-size:${Math.round(spec.column.width * 0.031)}px;font-weight:500;color:${COLORS.muted};letter-spacing:0.01em}
body:not(.ready) .column,body:not(.ready) .badge-mark{visibility:hidden}
</style></head><body>
${globeSvg(spec)}
<div class="badge-mark" id="badge-mark">${markSvg('badge', Math.round((spec.globe.radius * 122) / 212) * 1.02)}</div>
<div class="column" id="column">
  <div class="lockup">${markSvg('lockup', markHeight)}<span class="word" id="word">${WORDMARK}</span></div>
  <div class="rule"></div>
  <div class="tagline">${tagline}</div>
  ${spec.footnote ? `<div class="footnote">${escapeXml(spec.footnote)}</div>` : ''}
</div>
<script>${layoutScript({
    kind: 'card',
    badge: { x: spec.globe.x, y: spec.globe.y, radius: (spec.globe.radius * 122) / 212 },
    column: spec.column,
    markHeight,
  })}</script>
</body></html>`;
}

function lockupHtml(spec: LockupSpec): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace()}
html,body{margin:0;width:${spec.width}px;height:${spec.height}px;overflow:hidden;background:transparent}
body{font-family:"Geist",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;display:flex;align-items:center;justify-content:center}
.lockup{display:flex;align-items:center;flex-direction:${spec.layout === 'stacked' ? 'column' : 'row'};gap:${spec.gap}px}
.word{font-weight:600;color:${COLORS.ink};letter-spacing:-0.025em;line-height:1;white-space:nowrap}
body:not(.ready) .lockup{visibility:hidden}
</style></head><body>
<div class="lockup" id="column">${markSvg('lockup', spec.markHeight)}<span class="word" id="word">${WORDMARK}</span></div>
<script>${layoutScript({ kind: 'lockup', wordmarkWidth: spec.wordmarkWidth })}</script>
</body></html>`;
}

type LayoutInput =
  | {
      kind: 'card';
      badge: { x: number; y: number; radius: number };
      column: { x: number; centerY: number; width: number };
      markHeight: number;
    }
  | { kind: 'lockup'; wordmarkWidth: number };

/** In-page layout: fits marks to their exact vector bounds and the wordmark to its width. */
function layoutScript(input: LayoutInput): string {
  return `(async () => {
  const input = ${JSON.stringify(input)};
  await document.fonts.load('600 100px "Geist"');
  await document.fonts.ready;
  for (const svg of document.querySelectorAll('svg.mark')) {
    const group = svg.querySelector('g');
    const box = group.getBBox();
    svg.setAttribute('viewBox', [box.x, box.y, box.width, box.height].join(' '));
    svg.style.width = (parseFloat(svg.style.height) * box.width / box.height) + 'px';
  }
  const word = document.getElementById('word');
  const fit = (width) => {
    word.style.fontSize = '100px';
    word.style.fontSize = (100 * width / word.getBoundingClientRect().width) + 'px';
  };
  if (input.kind === 'lockup') {
    fit(input.wordmarkWidth);
  } else {
    const lockup = document.querySelector('.lockup');
    const mark = lockup.querySelector('svg');
    const gap = parseFloat(getComputedStyle(lockup).columnGap);
    fit(input.column.width - mark.getBoundingClientRect().width - gap);
    // Optical cap height: the wordmark's capitals match 62% of the mark height.
    const column = document.getElementById('column');
    column.style.top = (input.column.centerY - column.getBoundingClientRect().height / 2) + 'px';
    const badge = document.getElementById('badge-mark');
    const badgeSvg = badge.querySelector('svg');
    const height = input.badge.radius * 1.08;
    badgeSvg.style.height = height + 'px';
    const box = badgeSvg.querySelector('g').getBBox();
    badgeSvg.style.width = (height * box.width / box.height) + 'px';
    badge.style.left = (input.badge.x - parseFloat(badgeSvg.style.width) / 2) + 'px';
    badge.style.top = (input.badge.y - height / 2) + 'px';
  }
  document.body.classList.add('ready');
})();`;
}

function browserExecutable(): string {
  const configured =
    process.env.OPENSIGNET_BROWSER_EXECUTABLE ?? process.env.OPENSIGNET_TEST_BROWSER_EXECUTABLE;
  const candidates = [
    configured,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Set OPENSIGNET_BROWSER_EXECUTABLE to a Chromium-based browser.');
  return found;
}

function screenshot(html: string, width: number, height: number, workspace: string): Buffer {
  const page = join(workspace, 'card.html');
  const target = join(workspace, 'card.png');
  writeFileSync(page, html);
  rmSync(target, { force: true });
  const result = spawnSync(
    browserExecutable(),
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-device-scale-factor=1',
      '--force-color-profile=srgb',
      '--default-background-color=00000000',
      `--user-data-dir=${join(workspace, 'profile')}`,
      `--window-size=${width},${height}`,
      '--virtual-time-budget=15000',
      `--screenshot=${target}`,
      pathToFileURL(page).href,
    ],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true },
  );
  if (!existsSync(target)) {
    throw new Error(`Browser did not produce a screenshot: ${result.stderr || result.error}`);
  }
  return readFileSync(target);
}

export async function renderBrandCards(): Promise<Array<{ file: string; bytes: number }>> {
  const sharp = loadSharp();
  const workspace = mkdtempSync(join(tmpdir(), 'opensignet-brand-'));
  const results: Array<{ file: string; bytes: number }> = [];
  try {
    for (const spec of SPECS) {
      const html = spec.kind === 'card' ? cardHtml(spec) : lockupHtml(spec);
      const raw = screenshot(html, spec.width, spec.height, workspace);
      const metadata = await sharp(raw).metadata();
      if (metadata.width !== spec.width || metadata.height !== spec.height) {
        throw new Error(`Unexpected render size for ${spec.output}`);
      }
      const image =
        spec.kind === 'card'
          ? sharp(raw).flatten({ background: COLORS.paper }).removeAlpha()
          : sharp(raw).ensureAlpha();
      const png = await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
      writeFileSync(spec.output, png);
      results.push({ file: spec.output, bytes: png.length });
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  syncBrand();
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await renderBrandCards());
}

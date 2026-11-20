/**
 * The OpenSignet Pass artwork: the square image of the pass minted for every identity into the
 * account's OpenSignet wallet. It carries little on purpose, only the identity's name and the
 * three forms it links: the domain, the Basename and the ENS name.
 *
 * Pure and deterministic: the same pass always draws the same SVG, so any service can render
 * it (the NFT image, the dashboard, a share card) and get identical bytes.
 */

export interface PassArtInput {
  /** The pass number (token id), shown as "No. 000042". */
  number: number;
  /** The registered domain, for example "northwind.ai". */
  domain: string;
  /** The linked Basename, for example "northwind.base.eth", when there is one. */
  basename?: string | null;
  /** The linked ENS name, for example "northwind.eth", when there is one. */
  ens?: string | null;
}

export const PASS_ART_SIZE = 1200;

const IVORY = '#F3F1EC';
const MUTED = '#9C9A90';
const FAINT = '#5E5D57';
const SANS = "Geist, 'Inter', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Geist Mono', 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

/** The OpenSignet mark (the brand kit's tight mark), in its own 354 × 425 box at the origin. */
const MARK_PATHS = [
  'M 0.16 -18.14 A 6.78 6.78 0 0 1 10.55 -23.88 L 122.66 46.48 A 5.29 5.29 0 0 1 125.14 50.96 L 125.14 319.28 A 3.77 3.77 0 0 1 123.49 322.40 L 9.62 399.55 A 6.06 6.06 0 0 1 0.16 394.53 Z',
  'M 353.84 -18.14 A 6.78 6.78 0 0 0 343.45 -23.88 L 231.34 46.48 A 5.29 5.29 0 0 0 228.86 50.96 L 228.86 319.28 A 3.77 3.77 0 0 0 230.51 322.40 L 344.38 399.55 A 6.06 6.06 0 0 0 353.84 394.53 Z',
  'M 160.35 136.35 H 193.65 Q 194 136.35 194 136.7 V 158.3 Q 194 158.95 193.28 159.52 L 184.86 166.02 Q 183.9 166.7 183.9 167.72 V 365 H 170.1 V 167.72 Q 170.1 166.7 169.14 166.02 L 160.72 159.52 Q 160 158.95 160 158.3 V 136.7 Q 160 136.35 160.35 136.35 Z',
];
// The dot sits below the paths, which the group shifts down by 24.66 units (as in the brand kit).
const MARK_DOT = { cx: 177, cy: 364.84, r: 24.25 };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Shortens a long value in the middle, keeping both ends readable. */
export function middleTruncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - (keep - head))}`;
}

function mark(x: number, y: number, height: number, fill: string): string {
  const scale = height / 425;
  return `<g transform="translate(${x} ${y + 24.66 * scale}) scale(${scale.toFixed(5)})" fill="${fill}">${MARK_PATHS.map(
    (d) => `<path d="${d}"/>`,
  ).join('')}<circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}"/></g>`;
}

/** An engraved rosette: many thin ellipses turned around one centre, like banknote guilloche. */
function rosette(cx: number, cy: number, rx: number, ry: number, count: number): string {
  let d = '';
  for (let index = 0; index < count; index++) {
    const angle = (Math.PI * index) / count;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // An ellipse as two arcs, rotated by `angle` around the centre.
    const x1 = cx + rx * cos;
    const y1 = cy + rx * sin;
    const x2 = cx - rx * cos;
    const y2 = cy - rx * sin;
    const degrees = ((angle * 180) / Math.PI).toFixed(3);
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}A${rx} ${ry} ${degrees} 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}A${rx} ${ry} ${degrees} 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return d;
}

/** The hero size for the identity's name: as large as fits the card, never below 56px. */
function heroSize(text: string): number {
  const width = 960;
  return Math.max(56, Math.min(168, Math.floor(width / (0.58 * Math.max(text.length, 1)))));
}

interface LinkedForm {
  label: string;
  value: string | null;
}

function column(x: number, form: LinkedForm): string {
  const linked = Boolean(form.value);
  const value = linked ? middleTruncate(form.value!, 22) : 'Not linked';
  return [
    `<g transform="translate(${x} 0)">`,
    linked
      ? `<circle cx="7" cy="866" r="6" fill="url(#foil)"/>`
      : `<circle cx="7" cy="866" r="5.25" fill="none" stroke="${FAINT}" stroke-width="1.5"/>`,
    `<text x="24" y="872" font-family="${SANS}" font-size="17" font-weight="500" letter-spacing="3.4" fill="${MUTED}">${escapeXml(form.label)}</text>`,
    `<text x="0" y="918" font-family="${SANS}" font-size="26" font-weight="500" fill="${linked ? IVORY : FAINT}">${escapeXml(value)}</text>`,
    `</g>`,
  ].join('');
}

/** Draws the pass as a square SVG (1200 × 1200). */
export function renderPassSvg(input: PassArtInput): string {
  const domain = input.domain.trim().toLowerCase();
  const name = domain.split('.')[0] || domain;
  const hero = middleTruncate(name, 30);
  const size = heroSize(hero);
  const number = `No. ${String(Math.max(0, Math.floor(input.number))).padStart(6, '0')}`;
  const micro = 'OPENSIGNET PASS · DOMAIN · BASENAME · ENS · ON BASE · ';
  const frame =
    'M 108 72 H 1092 A 36 36 0 0 1 1128 108 V 1092 A 36 36 0 0 1 1092 1128 H 108 A 36 36 0 0 1 72 1092 V 108 A 36 36 0 0 1 108 72 Z';
  const forms: LinkedForm[] = [
    { label: 'DOMAIN', value: domain },
    { label: 'BASENAME', value: input.basename?.trim().toLowerCase() || null },
    { label: 'ENS', value: input.ens?.trim().toLowerCase() || null },
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PASS_ART_SIZE} ${PASS_ART_SIZE}" width="${PASS_ART_SIZE}" height="${PASS_ART_SIZE}" role="img" aria-label="${escapeXml(`OpenSignet Pass ${number} for ${domain}`)}">`,
    '<defs>',
    '<radialGradient id="bg" cx="0.78" cy="0.2" r="1.05">',
    '<stop offset="0" stop-color="#2B2721"/><stop offset="0.45" stop-color="#151613"/><stop offset="1" stop-color="#0A0B09"/>',
    '</radialGradient>',
    '<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="#F6EBD3"/><stop offset="0.28" stop-color="#C9A66B"/><stop offset="0.52" stop-color="#FFF4DD"/><stop offset="0.76" stop-color="#B98D52"/><stop offset="1" stop-color="#EBD7B0"/>',
    '</linearGradient>',
    '<linearGradient id="ember" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0" stop-color="#F7701D" stop-opacity="0"/><stop offset="0.5" stop-color="#F7701D" stop-opacity="0.9"/><stop offset="1" stop-color="#F7701D" stop-opacity="0"/>',
    '</linearGradient>',
    '<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">',
    '<stop offset="0" stop-color="#F7701D" stop-opacity="0.16"/><stop offset="1" stop-color="#F7701D" stop-opacity="0"/>',
    '</radialGradient>',
    // The name: ivory with a soft warm sheen, like pressed paper under light.
    '<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#FFFDF8"/><stop offset="0.55" stop-color="#F3F1EC"/><stop offset="1" stop-color="#D9CDB6"/>',
    '</linearGradient>',
    '<radialGradient id="vignette" cx="0.5" cy="0.48" r="0.75">',
    '<stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/>',
    '</radialGradient>',
    // Fine film grain: gives the dark ground a printed, tactile finish.
    '<filter id="grain" x="0" y="0" width="100%" height="100%">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>',
    '<feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.92  0 0 0 0 0.86  0 0 0 0.07 0"/>',
    '</filter>',
    `<path id="frame" d="${frame}"/>`,
    '<clipPath id="card"><rect x="48" y="48" width="1104" height="1104" rx="56"/></clipPath>',
    '</defs>',
    // Ground, warm light and engraving.
    `<rect width="${PASS_ART_SIZE}" height="${PASS_ART_SIZE}" fill="#0A0B09"/>`,
    '<g clip-path="url(#card)">',
    '<rect x="48" y="48" width="1104" height="1104" fill="url(#bg)"/>',
    '<circle cx="905" cy="300" r="420" fill="url(#glow)"/>',
    `<path d="${rosette(905, 300, 360, 128, 72)}" fill="none" stroke="url(#foil)" stroke-width="0.7" opacity="0.13"/>`,
    `<path d="${rosette(905, 300, 230, 84, 48)}" fill="none" stroke="url(#foil)" stroke-width="0.7" opacity="0.1"/>`,
    `<path d="${rosette(905, 300, 150, 150 * 0.62, 36)}" fill="none" stroke="url(#foil)" stroke-width="0.5" opacity="0.08"/>`,
    '<circle cx="905" cy="300" r="372" fill="none" stroke="url(#foil)" stroke-width="0.8" opacity="0.18"/>',
    '<circle cx="905" cy="300" r="380" fill="none" stroke="url(#foil)" stroke-width="0.5" opacity="0.1" stroke-dasharray="1 5"/>',
    mark(830, 196, 210, 'url(#foil)').replace('<g ', '<g opacity="0.2" '),
    Array.from(
      { length: 9 },
      (_, index) =>
        `<path d="M48 ${1000 + index * 16} C 360 ${972 + index * 16}, 840 ${1028 + index * 16}, 1152 ${996 + index * 16}" fill="none" stroke="${IVORY}" stroke-width="0.6" opacity="${(0.05 - index * 0.004).toFixed(3)}"/>`,
    ).join(''),
    '<rect x="48" y="48" width="1104" height="1104" fill="url(#vignette)"/>',
    '<rect x="48" y="48" width="1104" height="1104" filter="url(#grain)"/>',
    '</g>',
    // Double foil frame with a microprinted edge.
    '<rect x="48" y="48" width="1104" height="1104" rx="56" fill="none" stroke="url(#foil)" stroke-width="2.25"/>',
    // The microprint runs in a band between the outer foil and a fine inner foil line.
    '<rect x="84" y="84" width="1032" height="1032" rx="22" fill="none" stroke="url(#foil)" stroke-width="0.75" opacity="0.6"/>',
    // Exactly nine runs spread over the whole edge (length 4162), so the seam never overlaps.
    `<text font-family="${MONO}" font-size="10.5" fill="${IVORY}" opacity="0.32"><textPath href="#frame" startOffset="6" textLength="4150" lengthAdjust="spacing">${micro.repeat(9).trimEnd()}</textPath></text>`,
    // Header: mark and name, pass number.
    mark(120, 128, 58, IVORY),
    `<text x="186" y="164" font-family="${SANS}" font-size="25" font-weight="600" letter-spacing="7.5" fill="${IVORY}">OPENSIGNET</text>`,
    `<text x="186" y="194" font-family="${SANS}" font-size="15" font-weight="500" letter-spacing="9" fill="url(#foil)">PASS</text>`,
    `<text x="1080" y="164" text-anchor="end" font-family="${MONO}" font-size="24" font-weight="500" letter-spacing="1.5" fill="url(#foil)">${escapeXml(number)}</text>`,
    `<text x="1080" y="194" text-anchor="end" font-family="${SANS}" font-size="14" font-weight="500" letter-spacing="4" fill="${MUTED}">IDENTITY</text>`,
    // The name, large.
    `<text x="120" y="680" font-family="${SANS}" font-size="${size}" font-weight="600" letter-spacing="${(-size * 0.035).toFixed(2)}" fill="url(#sheen)">${escapeXml(hero)}</text>`,
    `<rect x="120" y="716" width="360" height="2" fill="url(#ember)"/>`,
    // What the pass links.
    `<rect x="120" y="808" width="960" height="1" fill="${IVORY}" opacity="0.1"/>`,
    // Hairlines between the three linked forms.
    `<rect x="430" y="846" width="1" height="84" fill="${IVORY}" opacity="0.08"/>`,
    `<rect x="760" y="846" width="1" height="84" fill="${IVORY}" opacity="0.08"/>`,
    column(120, forms[0]!),
    column(450, forms[1]!),
    column(780, forms[2]!),
    // Footer.
    `<path d="M 128 1052 l 8 -8 l 8 8 l -8 8 Z" fill="url(#foil)"/>`,
    `<text x="156" y="1058" font-family="${SANS}" font-size="16" font-weight="500" letter-spacing="3.2" fill="${MUTED}">ON BASE</text>`,
    `<text x="1080" y="1058" text-anchor="end" font-family="${SANS}" font-size="16" font-weight="500" letter-spacing="3.2" fill="${MUTED}">OPENSIGNET.COM</text>`,
    '</svg>',
  ].join('');
}

/**
 * Vector geometry of the approved OpenSignet mark, copied verbatim from
 * brand/logo/opensignet-logo.svg (a test keeps them identical). Rendering these paths with
 * a solid ink and no tile is the transparent mark; the geometry itself is never edited.
 */
export const MARK_INK = '#131413';
export const MARK_INK_ON_DARK = '#f3f1ec';
/** Exact bounds of the mark in opensignet-logo.svg user units (measured with SVG getBBox). */
export const MARK_VIEWBOX = '450 414.5 354 425';
export const MARK_ASPECT = 354 / 425;
export const MARK_GROUP_TRANSFORM =
  'translate(627 627) scale(1.000926517572 0.998800644575) translate(-627 -602.338911840095)';
export const MARK_SIDE_PATH =
  'M 450.16384180791 396.363742773954 A 6.78 6.78 0 0 1 460.547746871741 390.620897809053 L 572.664098263722 460.979176500074 A 5.29 5.29 0 0 1 575.142201834862 465.459950816346 L 575.142201834862 733.777563408654 A 3.77 3.77 0 0 1 573.486951829772 736.898578060819 L 459.623148165775 814.050884299371 A 6.06 6.06 0 0 1 450.16384180791 809.034080906235 Z';
export const MARK_MIRROR_TRANSFORM = 'translate(1254 0) scale(-1 1)';
export const MARK_STEM_PATH =
  'M 610.35 550.85 H 643.65 Q 644 550.85 644 551.2 V 572.8 Q 644 573.45 643.28 574.02 L 634.86 580.52 Q 633.9 581.2 633.9 582.22 V 779.5 H 620.1 V 582.22 Q 620.1 581.2 619.14 580.52 L 610.72 574.02 Q 610 573.45 610 572.8 V 551.2 Q 610 550.85 610.35 550.85 Z';
export const MARK_ENDPOINT = { cx: 627, cy: 804, r: 24.25 } as const;

/** Standalone SVG markup of the mark, for generated favicons. */
export function markSvgBody(fill: string): string {
  return [
    `<g fill="${fill}">`,
    `<g transform="${MARK_GROUP_TRANSFORM}">`,
    `<path d="${MARK_SIDE_PATH}"/>`,
    `<path d="${MARK_SIDE_PATH}" transform="${MARK_MIRROR_TRANSFORM}"/>`,
    `<path d="${MARK_STEM_PATH}"/>`,
    '</g>',
    `<circle cx="${MARK_ENDPOINT.cx}" cy="${MARK_ENDPOINT.cy}" r="${MARK_ENDPOINT.r}"/>`,
    '</g>',
  ].join('');
}

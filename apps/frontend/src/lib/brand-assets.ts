import brand from './brand-assets.json';

export const BRAND_ASSETS = brand.assets;

export const BRAND_SOCIAL_IMAGE = {
  url: BRAND_ASSETS.socialCard,
  ...brand.socialImage,
} as const;

export const BRAND_ICONS = {
  // Same set as the docs: the vector SVG (adapts its ink to light and dark tabs) and one 96px PNG
  // for browsers without SVG favicons. Tiny 16/32px frames are not offered, because some browsers
  // (notably embedded Chromium views) pick them on high-density screens and upscale them blurry;
  // a 96px source always downsamples sharply. /favicon.ico stays served for legacy requests.
  icon: [
    { url: BRAND_ASSETS.favicon, type: 'image/png', sizes: '96x96' },
    { url: BRAND_ASSETS.faviconSvg, type: 'image/svg+xml', sizes: 'any' },
  ],
  shortcut: [{ url: BRAND_ASSETS.faviconSvg, type: 'image/svg+xml' }],
  // iOS fills transparency with black, so the touch icon keeps the opaque light tile.
  apple: [{ url: BRAND_ASSETS.appleTouchIcon, type: 'image/png', sizes: '180x180' }],
};

import type { MetadataRoute } from 'next';
import { BRAND_ASSETS } from '@/lib/brand-assets';
import { HOME_SOCIAL_TITLE, SITE_NAME, THEME_COLOR } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: `${HOME_SOCIAL_TITLE}.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    lang: 'en',
    categories: ['developer', 'productivity', 'utilities'],
    icons: [
      { src: BRAND_ASSETS.faviconSvg, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: BRAND_ASSETS.appIcon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: BRAND_ASSETS.appIcon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable icons are cropped by the launcher, so this one is opaque with a safe zone.
      { src: BRAND_ASSETS.maskableIcon, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

import type { Metadata } from 'next';
import { BRAND_ASSETS, BRAND_SOCIAL_IMAGE } from '@/lib/brand-assets';

export const SITE_URL = 'https://opensignet.com';
export const SITE_NAME = 'OpenSignet';
/** Matches the light application background (hsl(48 16% 92%)). */
export const THEME_COLOR = '#eeede7';
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

/** The approved product definition, introduced first wherever the whole product is described. */
export const PRODUCT_DEFINITION =
  'OpenSignet is the agent-native identity and communications infrastructure.';
/** Full product summary for structured data and agent-discovery files. */
export const PRODUCT_SUMMARY = `${PRODUCT_DEFINITION} Built for developers, people guiding agents, and permissioned autonomous workflows.`;

/** Homepage search title: the product name once, then the approved definition. */
export const HOME_TITLE = 'OpenSignet | Agent-Native Identity and Communications Infrastructure';
/** Share-card title: the card image and og:site_name already carry the name. */
export const HOME_SOCIAL_TITLE = 'Agent-native identity and communications infrastructure';
/**
 * Default page description. It lists the parts that support the definition instead of repeating
 * the title or the share image, so link previews never show the same sentence twice.
 */
export const DEFAULT_DESCRIPTION =
  'Domains, DNS, email, onchain identity and payments for AI agents. One API for developers, people guiding agents and permissioned autonomous workflows.';

export const SOCIAL_IMAGE = BRAND_SOCIAL_IMAGE;

export const STATIC_INDEXABLE_ROUTES = [
  '/',
  '/ai-agent-identity',
  '/domains-for-ai-agents',
  '/email-for-ai-agents',
  '/dns-for-ai-agents',
  '/domain-registration-api',
  '/x402-agent-payments',
  '/onchain-agent-identity',
  '/autonomous-agent-renewals',
  '/integrations/mcp',
  '/integrations/coinbase-agentkit',
  '/pricing',
  '/register',
  '/support',
  '/privacy',
  '/terms',
] as const;

export function absoluteUrl(path = '/'): string {
  return new URL(path, SITE_URL).toString();
}

const NAMED_TITLE = new RegExp(String.raw`\b${SITE_NAME}\b`);
const LEADING_NAME = new RegExp(String.raw`^${SITE_NAME}(?::\s*|\s+)`);

/** Search title: the page title followed by the name, never naming the product twice. */
export function brandedTitle(title: string): string {
  return NAMED_TITLE.test(title) ? title : TITLE_TEMPLATE.replace('%s', title);
}

/** Share-card title: no leading product name, because og:site_name and the image carry it. */
export function socialTitle(title: string): string {
  if (!LEADING_NAME.test(title)) return title;
  const stripped = title.replace(LEADING_NAME, '');
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : title;
}

export function createSitemapXml(
  entries: ReadonlyArray<{ loc: string; lastmod?: string }>,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(({ loc, lastmod }) => {
      const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
      return `  <url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
    }),
    '</urlset>',
  ].join('\n');
}

export function createPageMetadata(options: {
  title: string;
  /** Overrides the search title (defaults to the page title followed by the name). */
  searchTitle?: string;
  /** Overrides the share-card title (defaults to the page title without the name). */
  shareTitle?: string;
  description: string;
  path: string;
  canonical?: string;
  index?: boolean;
  /**
   * Error pages publish no canonical URL or robots tag of their own: Next.js already marks
   * not-found responses noindex, and a second robots tag would conflict.
   */
  notFound?: boolean;
  image?: typeof SOCIAL_IMAGE;
}): Metadata {
  const canonical = options.canonical ?? absoluteUrl(options.path);
  const image = options.image ?? SOCIAL_IMAGE;
  const index = options.index ?? true;
  const searchTitle = options.searchTitle ?? brandedTitle(options.title);
  const shareTitle = options.shareTitle ?? socialTitle(options.title);

  const shared = {
    title: shareTitle,
    description: options.description,
  };
  if (options.notFound) {
    return {
      title: { absolute: searchTitle },
      description: options.description,
      openGraph: {
        ...shared,
        siteName: SITE_NAME,
        locale: 'en_US',
        type: 'website',
        images: [image],
      },
      twitter: {
        card: 'summary_large_image',
        ...shared,
        images: [{ url: image.url, alt: image.alt }],
      },
    };
  }

  return {
    title: { absolute: searchTitle },
    description: options.description,
    alternates: { canonical },
    robots: index
      ? { index: true, follow: true }
      : {
          index: false,
          follow: true,
          googleBot: { index: false, follow: true },
        },
    openGraph: {
      title: shareTitle,
      description: options.description,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      url: canonical,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description: options.description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function homepageJsonLd() {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const applicationId = `${SITE_URL}/#software`;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl(BRAND_ASSETS.markPng),
      sameAs: ['https://github.com/OpenSignetOrg/opensignet'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': websiteId,
      url: SITE_URL,
      name: SITE_NAME,
      description: PRODUCT_SUMMARY,
      inLanguage: 'en',
      publisher: { '@id': organizationId },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': applicationId,
      name: SITE_NAME,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description: PRODUCT_SUMMARY,
      publisher: { '@id': organizationId },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description:
          'The Free plan costs nothing; the domain and optional names are charged separately.',
      },
    },
  ];
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

import { buildSiteSearchIndex } from '@/lib/site-search-index';

/**
 * The public site search index: static page text built once at deploy time. It holds no account or
 * customer data, and searching happens in the visitor's browser.
 */
export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    { version: 1, entries: buildSiteSearchIndex() },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}

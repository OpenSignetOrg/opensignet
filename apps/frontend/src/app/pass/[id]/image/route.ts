import { renderPassSvg } from '@opensignet/shared/pass-art';
import { PASS_HEADERS, parseTokenId, readPass } from '@/lib/pass';

/** The OpenSignet Pass artwork (the approved design), drawn for this token. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = parseTokenId(id);
  if (tokenId === null) return new Response('Not found', { status: 404 });
  let pass;
  try {
    pass = await readPass(tokenId);
  } catch {
    return new Response('Unavailable', {
      status: 503,
      headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' },
    });
  }
  if (!pass) return new Response('Not found', { status: 404 });
  const svg = renderPassSvg({
    number: pass.tokenId,
    domain: pass.domain,
    basename: pass.basename,
    ens: pass.ensName,
  });
  return new Response(svg, {
    headers: {
      ...PASS_HEADERS,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // The image can never run anything.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

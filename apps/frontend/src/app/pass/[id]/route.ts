import { PASS_HEADERS, parseTokenId, readPass } from '@/lib/pass';

/** ERC-721 metadata of an OpenSignet Pass (the contract's tokenURI). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = parseTokenId(id);
  if (tokenId === null) return Response.json({ error: 'not_found' }, { status: 404 });
  const origin = new URL(request.url).origin;
  let pass;
  try {
    pass = await readPass(tokenId);
  } catch {
    return Response.json(
      { error: 'unavailable' },
      { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' } },
    );
  }
  if (!pass) return Response.json({ error: 'not_found' }, { status: 404 });
  const number = String(pass.tokenId).padStart(6, '0');
  return Response.json(
    {
      name: `OpenSignet Pass No. ${number}`,
      description: `The OpenSignet Pass of ${pass.domain}: proof that this identity is held by its OpenSignet wallet, linking its domain, Basename and ENS name. Non-transferable.`,
      image: `${origin}/pass/${pass.tokenId}/image`,
      external_url: 'https://opensignet.com',
      attributes: [
        { trait_type: 'Domain', value: pass.domain },
        { trait_type: 'Basename', value: pass.basename ?? 'Not linked' },
        { trait_type: 'ENS', value: pass.ensName ?? 'Not linked' },
        {
          display_type: 'date',
          trait_type: 'Minted',
          value: Math.floor(Date.parse(pass.mintedAt) / 1000),
        },
      ],
    },
    { headers: PASS_HEADERS },
  );
}

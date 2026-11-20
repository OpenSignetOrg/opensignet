import { redirect } from 'next/navigation';

/** The Details tab was removed; old links open the identity instead. */
export default async function IdentityDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/identities/${encodeURIComponent(id)}`);
}

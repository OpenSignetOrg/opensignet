import type { ReactNode } from 'react';
import { IdentityShell } from '@/components/console/identity-shell';

/** One identity: heading and tabs. Private: shown only to the account that owns it. */
export default async function IdentityLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  return <IdentityShell identityId={decodeURIComponent(id)}>{children}</IdentityShell>;
}

'use client';

import { useSearchParams } from 'next/navigation';
import { AccountTab } from './account-tab';

/** Reads the Google linking result (?google=...) that the backend redirect reports. */
export function AccountTabPage() {
  const params = useSearchParams();
  return <AccountTab google={params.get('google')} />;
}

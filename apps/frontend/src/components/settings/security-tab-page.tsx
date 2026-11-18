'use client';

import { useSearchParams } from 'next/navigation';
import { SecurityTab } from './security-tab';

/** Reads the Google linking result (?google=...) that the backend redirect reports. */
export function SecurityTabPage() {
  const params = useSearchParams();
  return <SecurityTab google={params.get('google')} />;
}

'use client';

import { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useSiwe } from '@/hooks/use-siwe';

/**
 * Ends the OpenSignet session and disconnects every wallet connection in one action. It lives in
 * the dashboard's account row, never in the header.
 */
export function SignOutButton() {
  const { signOut, loading, error } = useSiwe();
  // Only a sign-out the person started here can show an error.
  const [tried, setTried] = useState(false);
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => {
          setTried(true);
          void signOut();
        }}
        className="h-9 w-full sm:w-auto"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        )}
        {loading ? 'Signing out...' : 'Sign out'}
      </Button>
      {tried && error && !loading ? (
        <InlineNotice className="sm:max-w-xs">{error}</InlineNotice>
      ) : null}
    </div>
  );
}

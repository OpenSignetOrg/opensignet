'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { SESSION_CHANGED_EVENT } from '@/hooks/use-account-session';

/**
 * Identity management runs on the account session: whoever is signed in (Google, an email code or
 * a wallet) and owns the identity can manage it. Every management request sends that session
 * cookie, and the API decides ownership. This context lets each panel ask for a sign-in when the
 * session has ended, in one consistent way.
 */
interface ManagementSession {
  /** The account is signed in and the API confirmed it owns this identity. */
  signedIn: boolean;
  /** Where "Sign in" goes; it returns to this page afterwards. */
  signInHref: string;
  /**
   * Returns true when a management request may go ahead. Otherwise it explains, once, that the
   * person needs to sign in again, and returns false.
   */
  requireSignIn: () => boolean;
  /** Call when a management request answers 401: the session ended while the page was open. */
  sessionEnded: () => void;
}

const ManagementSessionContext = createContext<ManagementSession | null>(null);

function currentSignInHref() {
  if (typeof window === 'undefined') return '/sign-in';
  return `/sign-in?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
}

export function ManagementSessionProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const [signInHref, setSignInHref] = useState('/sign-in');
  useEffect(() => setSignInHref(currentSignInHref()), []);

  const promptSignIn = useCallback(() => {
    toast.error('Sign in to continue', {
      id: 'management-sign-in',
      description: 'Your session has ended. Sign in again to keep managing this identity.',
      action: { label: 'Sign in', onClick: () => window.location.assign(currentSignInHref()) },
    });
  }, []);

  const requireSignIn = useCallback(() => {
    if (signedIn) return true;
    promptSignIn();
    return false;
  }, [promptSignIn, signedIn]);

  const sessionEnded = useCallback(() => {
    promptSignIn();
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }, [promptSignIn]);

  const value = useMemo(
    () => ({ signedIn, signInHref, requireSignIn, sessionEnded }),
    [requireSignIn, sessionEnded, signInHref, signedIn],
  );
  return (
    <ManagementSessionContext.Provider value={value}>{children}</ManagementSessionContext.Provider>
  );
}

export function useManagementSession(): ManagementSession {
  const value = useContext(ManagementSessionContext);
  if (!value) throw new Error('useManagementSession must be used inside ManagementSessionProvider');
  return value;
}

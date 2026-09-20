import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';

/**
 * Authentication facade for the account journey.
 *
 * Production always uses the Clerk session. In development builds a Playwright
 * run can opt in with `?e2eAccountAuth=1` and drive the signed-in state through
 * `window.__setAccountTestAuth`, mirroring the saved-events test hook, so the
 * account pages can be exercised without a live identity provider.
 */
export type AccountTestAuth = { userId: string | null; emailVerified?: boolean };

declare global {
  interface Window {
    __accountTestAuth?: AccountTestAuth;
    __setAccountTestAuth?: (auth: AccountTestAuth) => void;
  }
}

const TEST_AUTH_EVENT = 'buurtplaza:account-test-auth';
export const ACCOUNT_TEST_AUTH_PARAM = 'e2eAccountAuth';

// Once a development document opts in, client-side navigation must keep the
// test session even though the opt-in query parameter is not carried along.
let testAuthOptedIn = false;

export function isAccountTestAuthEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get(ACCOUNT_TEST_AUTH_PARAM) === '1') {
    testAuthOptedIn = true;
  }
  return testAuthOptedIn;
}

export type AccountAuth = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  isTestAuth: boolean;
};

export function useAccountAuth(): AccountAuth {
  const clerkAuth = useAuth();
  const [testEnabled] = useState(isAccountTestAuthEnabled);
  const [testAuth, setTestAuth] = useState<AccountTestAuth | null>(() =>
    testEnabled ? (window.__accountTestAuth ?? { userId: null }) : null,
  );

  useEffect(() => {
    if (!testEnabled) return;
    const update = () => setTestAuth(window.__accountTestAuth ?? { userId: null });
    window.__setAccountTestAuth = (auth) => {
      window.__accountTestAuth = auth;
      window.dispatchEvent(new Event(TEST_AUTH_EVENT));
    };
    window.addEventListener(TEST_AUTH_EVENT, update);
    return () => {
      window.removeEventListener(TEST_AUTH_EVENT, update);
      delete window.__setAccountTestAuth;
    };
  }, [testEnabled]);

  const testUserId = testAuth?.userId ?? null;
  const testGetToken = useCallback(async () => (testUserId ? `e2e-token:${testUserId}` : null), [testUserId]);

  if (testEnabled) {
    return {
      isLoaded: true,
      isSignedIn: Boolean(testUserId),
      userId: testUserId,
      getToken: testGetToken,
      isTestAuth: true,
    };
  }

  return {
    isLoaded: clerkAuth.isLoaded,
    isSignedIn: Boolean(clerkAuth.isSignedIn),
    userId: clerkAuth.userId ?? null,
    getToken: clerkAuth.getToken,
    isTestAuth: false,
  };
}

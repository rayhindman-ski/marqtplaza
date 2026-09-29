import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAccountLastSearchQueryKey, getGetAccountMeQueryKey } from '@workspace/api-client-react';
import { useAccountAuth } from '@/lib/accountAuth';

/** Clears private account queries on every Clerk sign-out or account switch. */
export function AccountCacheGuard() {
  const auth = useAccountAuth();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!auth.isLoaded) return;
    if (previousUser.current !== undefined && previousUser.current !== auth.userId) {
      client.removeQueries({ queryKey: getGetAccountLastSearchQueryKey() });
      client.removeQueries({ queryKey: getGetAccountMeQueryKey() });
      window.sessionStorage.removeItem('buurtplaza-last-search-restore');
    }
    previousUser.current = auth.userId;
  }, [auth.isLoaded, auth.userId, client]);
  return null;
}
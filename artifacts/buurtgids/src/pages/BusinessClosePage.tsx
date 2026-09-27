import { useState } from 'react';
import { Link, Redirect, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

import {
  getGetAccountMeQueryKey,
  getListBusinessMembersQueryKey,
  useCloseBusiness,
  useGetAccountMe,
  type ApiError,
} from '@workspace/api-client-react';

import { AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy } from '@/lib/i18n';
import { withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

/** Owner-only close confirmation (BMEM-006). One explicit tick, one request; the server decides. */
export default function BusinessClosePage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const close = copy.close;
  const params = useParams<{ id: string }>();
  const businessId = Number(params.id);
  const auth = useAccountAuth();
  const queryClient = useQueryClient();
  const enabled = featureFlags.businessOnboarding && auth.isLoaded && auth.isSignedIn && Number.isInteger(businessId) && businessId > 0;
  const meQuery = useGetAccountMe({ query: { enabled, queryKey: getGetAccountMeQueryKey(), retry: false } });
  const mutation = useCloseBusiness();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!auth.isLoaded) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={close.eyebrow} title={close.eyebrow} testId="page-business-close" headingTestId="heading-business-close">
        <p role="status" className="text-sm text-muted-foreground">{copy.account.loading}</p>
      </AccountShell>
    );
  }
  if (!auth.isSignedIn) return <Redirect to={withReturnPath('/sign-in', `/account/bedrijf/${params.id}/sluiten`)} />;

  const business = meQuery.data?.businesses.find((entry) => entry.id === businessId) ?? null;
  const name = business?.name ?? '';
  const title = business ? formatCopy(close.title, { business: name }) : close.eyebrow;

  async function onClose() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: businessId, data: { confirm: true } });
      setDone(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAccountMeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListBusinessMembersQueryKey(businessId) }),
      ]);
    } catch (failure) {
      const api = (failure as { data?: ApiError } | null)?.data;
      setError(api?.code === 'FORBIDDEN' ? close.onlyOwner : api?.code === 'NOT_FOUND' ? copy.members.notFound : accountErrorMessage(failure, language));
    }
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={close.eyebrow}
      title={title}
      intro={done ? undefined : close.intro}
      backHref={`/account/bedrijf/${params.id}/team`}
      testId="page-business-close"
      headingTestId="heading-business-close"
    >
      {!featureFlags.businessOnboarding ? (
        <AccountUnavailable language={language} />
      ) : done ? (
        <section role="status" data-testid="status-business-closed-done" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-bold text-emerald-900">{formatCopy(close.done, { business: name })}</p>
          <p className="mt-2 text-sm leading-6 text-emerald-900/80">{close.doneBody}</p>
          <Link href="/account" data-testid="link-close-back" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            {copy.members.back}
          </Link>
        </section>
      ) : (
        <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          {meQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{copy.account.loading}</p> : null}
          {business && business.role !== 'owner' ? (
            <p role="alert" data-testid="status-close-not-owner" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm font-bold text-amber-900">{close.onlyOwner}</p>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-foreground">
            <li>{close.what1}</li>
            <li>{close.what2}</li>
            <li>{close.what3}</li>
          </ul>
          <label className="mt-6 flex items-start gap-3 text-sm font-bold text-foreground">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              data-testid="checkbox-close-confirm"
              className="mt-1 h-4 w-4"
            />
            {close.confirmLabel}
          </label>
          {error ? (
            <p role="alert" data-testid="status-close-error" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              data-testid="button-close-business"
              disabled={!confirmed || mutation.isPending || (business !== null && business.role !== 'owner')}
              onClick={() => void onClose()}
            >
              {mutation.isPending ? close.busy : close.action}
            </Button>
            <Link href={`/account/bedrijf/${params.id}/team`} data-testid="link-close-cancel" className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50">
              {close.cancel}
            </Link>
          </div>
        </section>
      )}
    </AccountShell>
  );
}

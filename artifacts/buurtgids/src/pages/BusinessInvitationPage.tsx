import { useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';

import {
  getGetAccountMeQueryKey,
  useAcceptBusinessInvitation,
  type ApiError,
  type BusinessInvitationAccepted,
  type BusinessInvitationRejected,
} from '@workspace/api-client-react';

import { AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy } from '@/lib/i18n';
import { withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { roleLabel } from './BusinessMembersPage';

export const BUSINESS_INVITATION_PATH = '/account/uitnodiging';

/**
 * Invitation landing page (BMEM-002). The token stays in the URL until the
 * signed-in person presses accept, so a mail scanner or a preview fetch can
 * never consume it. Unauthenticated visitors are sent to sign-in or
 * registration with this page (token included) as the return path.
 */
export default function BusinessInvitationPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const text = copy.invitation;
  const search = useSearch();
  const token = new URLSearchParams(search).get('token') ?? '';
  const auth = useAccountAuth();
  const queryClient = useQueryClient();
  const accept = useAcceptBusinessInvitation();
  const [result, setResult] = useState<BusinessInvitationAccepted | null>(null);
  const [error, setError] = useState<string | null>(null);

  const returnPath = `${BUSINESS_INVITATION_PATH}?token=${encodeURIComponent(token)}`;

  async function onAccept() {
    setError(null);
    try {
      const accepted = await accept.mutateAsync({ data: { token } });
      setResult(accepted);
      await queryClient.invalidateQueries({ queryKey: getGetAccountMeQueryKey() });
    } catch (failure) {
      const data = (failure as { data?: ApiError | BusinessInvitationRejected } | null)?.data;
      if (data && 'reason' in data) {
        setError(text[data.reason]);
        return;
      }
      if (data && 'code' in data && data.code === 'EMAIL_UNVERIFIED') {
        setError(text.verifyFirst);
        return;
      }
      setError(accountErrorMessage(failure, language));
    }
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={text.eyebrow}
      title={text.title}
      intro={result ? undefined : text.intro}
      backHref="/account"
      testId="page-business-invitation"
      headingTestId="heading-business-invitation"
    >
      {!featureFlags.businessOnboarding ? (
        <AccountUnavailable language={language} />
      ) : !token ? (
        <p role="alert" data-testid="status-invitation-missing" className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-900">{text.missing}</p>
      ) : !auth.isLoaded ? (
        <p role="status" className="text-sm text-muted-foreground">{text.checking}</p>
      ) : !auth.isSignedIn ? (
        <section data-testid="invitation-sign-in" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          <p className="text-sm leading-6 text-foreground">{text.signInFirst}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={withReturnPath('/sign-in', returnPath)} data-testid="link-invitation-sign-in" className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              {text.signIn}
            </Link>
            <Link href={withReturnPath('/account/register', returnPath)} data-testid="link-invitation-register" className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50">
              {text.register}
            </Link>
          </div>
        </section>
      ) : result ? (
        <section role="status" data-testid="status-invitation-accepted" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <MailCheck className="h-4 w-4" aria-hidden="true" />
            {formatCopy(text.accepted, { role: roleLabel(result.role, language).toLowerCase(), business: result.businessName })}
          </p>
          <Link href={`/account/bedrijf/${result.businessId}/team`} data-testid="link-invitation-team" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            {text.goToTeam}
          </Link>
        </section>
      ) : (
        <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          {error ? (
            <p role="alert" data-testid="status-invitation-error" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</p>
          ) : null}
          <Button type="button" data-testid="button-invitation-accept" disabled={accept.isPending} onClick={() => void onAccept()}>
            {accept.isPending ? text.accepting : text.accept}
          </Button>
        </section>
      )}
    </AccountShell>
  );
}

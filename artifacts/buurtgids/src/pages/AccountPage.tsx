import { useState } from 'react';
import { Link, Redirect } from 'wouter';
import { useClerk, UserProfile } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, ClipboardList, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';

import {
  getGetAccountConsentsQueryKey,
  getGetAccountMeQueryKey,
  getGetAccountOptionsQueryKey,
  getGetRegistrationQueryKey,
  useGetAccountConsents,
  useGetAccountMe,
  useGetAccountOptions,
  useGetRegistration,
  useRecordAccountConsent,
  type AccountConsents,
  type ApiError,
  type ConsentPurpose,
} from '@workspace/api-client-react';

import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy, type Language } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { PreferenceSummary } from './AccountPreferencesPage';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

export default function AccountPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const auth = useAccountAuth();
  const { signOut } = useClerk();
  const signedIn = auth.isLoaded && auth.isSignedIn;
  const accountsOn = featureFlags.accounts && signedIn;

  const registrationQuery = useGetRegistration({
    query: { enabled: signedIn, queryKey: getGetRegistrationQueryKey() },
  });
  const meQuery = useGetAccountMe({
    query: { enabled: accountsOn, queryKey: getGetAccountMeQueryKey(), retry: false },
  });
  const optionsQuery = useGetAccountOptions({
    query: { enabled: accountsOn, queryKey: getGetAccountOptionsQueryKey(), staleTime: 5 * 60_000 },
  });

  if (!auth.isLoaded) return <AccountLoading label={copy.account.loading} />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;

  const me = meQuery.data;
  const meError = apiErrorFrom(meQuery.error);
  const featureDisabled = !featureFlags.accounts || meError?.code === 'FEATURE_DISABLED';

  const signOutButton = (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      data-testid="button-sign-out"
      onClick={() => void signOut({ redirectUrl: basePath || '/' })}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {copy.account.signOut}
    </Button>
  );

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={copy.account.eyebrow}
      title={copy.account.title}
      intro={copy.account.intro}
      actions={signOutButton}
      testId="page-account"
      headingTestId="heading-account"
    >
      {featureDisabled ? (
        <div className="mb-6"><AccountUnavailable language={language} /></div>
      ) : (
        <>
          {meQuery.isLoading ? (
            <p data-testid="status-account-summary-loading" role="status" className="mb-6 text-sm text-muted-foreground">{copy.account.loading}</p>
          ) : null}
          {meQuery.isError ? (
            <div role="alert" data-testid="status-account-error" className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-bold text-red-900">{accountErrorMessage(meQuery.error, language)}</p>
              {meError?.code !== 'ACCOUNT_SUSPENDED' && meError?.code !== 'ACCOUNT_DELETED' ? (
                <Button type="button" variant="outline" className="mt-3" data-testid="button-account-retry" onClick={() => void meQuery.refetch()}>
                  {copy.preferences.retry}
                </Button>
              ) : null}
            </div>
          ) : null}
          {me ? (
            <section data-testid="account-preferences-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    {copy.account.summaryTitle}
                  </p>
                  <p data-testid="status-onboarding" className="mt-2 text-sm font-bold text-foreground">
                    {me.onboardingCompleted ? copy.account.summaryOnboardingDone : copy.account.summaryOnboardingOpen}
                  </p>
                </div>
                <Link
                  href="/account/voorkeuren"
                  data-testid="link-edit-preferences"
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  {me.onboardingCompleted ? copy.account.editPreferences : copy.account.startPreferences}
                </Link>
              </div>
              <PreferenceSummary me={me} options={optionsQuery.data ?? null} language={language} />
              {!me.capabilities.isVerified ? (
                <div data-testid="status-account-unverified" role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-sm font-bold text-amber-900">{copy.account.unverifiedTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900/80">{copy.account.unverifiedBody}</p>
                </div>
              ) : null}
            </section>
          ) : null}
          {me ? <ConsentPanel language={language} enabled={accountsOn} verified={me.capabilities.isVerified} /> : null}
        </>
      )}

      <section data-testid="account-scopes-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="font-serif text-2xl font-semibold text-foreground">{copy.account.scopesTitle}</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <ScopeItem icon={<UserRound className="h-4 w-4" aria-hidden="true" />} title={copy.account.scopeAccountTitle} body={copy.account.scopeAccountBody} testId="scope-account" />
          <ScopeItem icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} title={copy.account.scopeRegistrationTitle} body={copy.account.scopeRegistrationBody} testId="scope-registration" />
          <ScopeItem icon={<BookmarkCheck className="h-4 w-4" aria-hidden="true" />} title={copy.account.scopeSavedTitle} body={copy.account.scopeSavedBody} testId="scope-saved" />
          <ScopeItem icon={<Mail className="h-4 w-4" aria-hidden="true" />} title={copy.account.scopeConsentTitle} body={copy.account.scopeConsentBody} testId="scope-consent" />
        </dl>
      </section>

      <section data-testid="account-community-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{copy.account.scopeRegistrationTitle}</p>
            <h2 data-testid="heading-registration" className="mt-2 text-2xl font-extrabold text-foreground">{copy.account.registrationHeading}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.account.registrationBody}
              <span className="ml-1">{copy.account.registrationExplain}</span>
            </p>
          </div>
          {registrationQuery.data?.registered ? (
            <span data-testid="status-registration-complete" className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700">
              {copy.account.registrationComplete}
            </span>
          ) : (
            <Link href="/onboarding" data-testid="link-registration" className="inline-flex shrink-0 items-center justify-center rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10">
              {copy.account.registrationOpen}
            </Link>
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-border/70 pt-5">
          <Link href="/" className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary">
            {copy.account.savedEventsLink}
          </Link>
          <Link href="/buurt" className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary">
            {copy.account.community}
          </Link>
          <Link href="/bedrijf-aanmelden" className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary">
            {copy.account.business}
          </Link>
        </div>
      </section>

      <section data-testid="account-profile-panel" className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-xl shadow-secondary/5">
        <div className="border-b border-border/70 px-6 py-5 sm:px-8">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {copy.account.securityTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.account.securityBody}</p>
        </div>
        {auth.isTestAuth ? (
          <p data-testid="status-profile-test-mode" className="px-6 py-5 text-sm text-muted-foreground">Clerk profile is not loaded in test mode.</p>
        ) : (
          <UserProfile routing="path" path={`${basePath}/account`} />
        )}
      </section>
    </AccountShell>
  );
}

function ScopeItem({ icon, title, body, testId }: { icon: React.ReactNode; title: string; body: string; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <dt className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </dt>
      <dd className="mt-1 text-sm leading-6 text-muted-foreground">{body}</dd>
    </div>
  );
}

const PURPOSE_COPY_KEY: Record<ConsentPurpose, 'consentPurposeMarketing' | 'consentPurposeResearch'> = {
  marketing_updates: 'consentPurposeMarketing',
  research_contact: 'consentPurposeResearch',
};

function ConsentPanel({ language, enabled, verified }: { language: Language; enabled: boolean; verified: boolean }) {
  const copy = accountTranslations[language].account;
  const queryClient = useQueryClient();
  const consentsQuery = useGetAccountConsents({
    query: { enabled, queryKey: getGetAccountConsentsQueryKey(), retry: false },
  });
  const record = useRecordAccountConsent();
  const [pendingPurpose, setPendingPurpose] = useState<ConsentPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consents = consentsQuery.data;

  const choose = async (purpose: ConsentPurpose, granted: boolean) => {
    if (!consents) return;
    setError(null);
    setPendingPurpose(purpose);
    try {
      const next = await record.mutateAsync({
        data: { consentType: purpose, noticeVersion: consents.currentNoticeVersion, granted, source: 'account_settings' },
      });
      queryClient.setQueryData<AccountConsents>(getGetAccountConsentsQueryKey(), next);
    } catch (failure) {
      setError(accountErrorMessage(failure, language));
    } finally {
      setPendingPurpose(null);
    }
  };

  return (
    <section data-testid="account-consents-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
        <Mail className="h-4 w-4" aria-hidden="true" />
        {copy.consentsTitle}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.consentIntro}</p>
      {consentsQuery.isError ? (
        <p role="alert" data-testid="status-consents-error" className="mt-4 text-sm font-bold text-red-800">{accountErrorMessage(consentsQuery.error, language)}</p>
      ) : null}
      {error ? <p role="alert" data-testid="status-consent-save-error" className="mt-4 text-sm font-bold text-red-800">{error}</p> : null}
      {consents ? (
        <>
          <ul className="mt-5 divide-y divide-border/70">
            {consents.purposes.map((purpose) => {
              const state = consents.current.find((item) => item.consentType === purpose);
              const busy = pendingPurpose === purpose;
              return (
                <li key={purpose} data-testid={`consent-${purpose}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{copy[PURPOSE_COPY_KEY[purpose]]}</p>
                    <p data-testid={`consent-state-${purpose}`} className="mt-1 text-xs text-muted-foreground">
                      {busy ? copy.consentSaving : state ? (state.granted ? copy.consentGranted : copy.consentWithdrawn) : copy.consentNeverAsked}
                      {state ? ` · ${new Date(state.recordedAt).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')}` : ''}
                    </p>
                  </div>
                  <div role="group" aria-label={copy[PURPOSE_COPY_KEY[purpose]]} className="inline-flex rounded-full border border-border p-1 text-xs font-bold">
                    <button
                      type="button"
                      data-testid={`button-consent-${purpose}-on`}
                      aria-pressed={state?.granted === true}
                      disabled={busy || !verified || state?.granted === true}
                      onClick={() => void choose(purpose, true)}
                      className={`rounded-full px-3 py-1.5 disabled:cursor-not-allowed ${state?.granted === true ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {copy.consentGranted}
                    </button>
                    <button
                      type="button"
                      data-testid={`button-consent-${purpose}-off`}
                      aria-pressed={state?.granted === false}
                      disabled={busy || !verified || state?.granted === false}
                      onClick={() => void choose(purpose, false)}
                      className={`rounded-full px-3 py-1.5 disabled:cursor-not-allowed ${state?.granted === false ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {copy.consentWithdrawn}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p data-testid="consent-notice-version" className="mt-3 text-xs text-muted-foreground">
            {formatCopy(copy.consentNotice, { version: consents.currentNoticeVersion })}
          </p>
        </>
      ) : null}
    </section>
  );
}

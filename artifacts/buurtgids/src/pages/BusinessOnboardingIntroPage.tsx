import { useEffect, useMemo, useState } from 'react';
import { Link, Redirect, useSearch } from 'wouter';
import { Building2, Eye, ShieldCheck, Store } from 'lucide-react';

import { useRecordBusinessOnboardingIntent, type ApiError, type BusinessOnboardingContext } from '@workspace/api-client-react';

import { AccountLoading, AccountShell } from '@/components/account/AccountShell';
import { useAccountAuth } from '@/lib/accountAuth';
import { BUSINESS_ONBOARDING_PATH, type BusinessIntentListing } from '@/lib/businessIntent';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, type Language } from '@/lib/i18n';
import { withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

/**
 * Business step entry (v0.5.2, BENT-004/BENT-005). Reached from every entry
 * point via the allow-listed return path; requires a session; explains what a
 * business profile is, who sees what, and that the personal account stays
 * separate before anything is asked. The server confirms the carried intent
 * (context + optional listing reference) before the wizard starts; nothing is
 * written here, so arriving twice is harmless (BENT-003).
 */

const CONTEXTS: ReadonlySet<string> = new Set(['registration', 'account_home', 'listing']);

type ParsedIntent = { context: BusinessOnboardingContext; listing: BusinessIntentListing | null };

export function parseIntentSearch(search: string): ParsedIntent {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawContext = params.get('context');
  const context = (rawContext && CONTEXTS.has(rawContext) ? rawContext : 'account_home') as BusinessOnboardingContext;
  const cityId = params.get('cityId');
  const source = params.get('listingSource');
  const id = params.get('listingId');
  return { context, listing: cityId && source && id ? { cityId, source, id } : null };
}

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

export function BusinessOnboardingUnavailable({ language }: { language: Language }) {
  const copy = accountTranslations[language].business;
  return (
    <section data-testid="status-business-onboarding-unavailable" role="status" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      <h2 className="font-serif text-2xl font-semibold text-foreground">{copy.unavailableTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.unavailableBody}</p>
      <Link href="/account" data-testid="link-business-back-account" className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
        {copy.backToAccount}
      </Link>
    </section>
  );
}

export default function BusinessOnboardingIntroPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const business = copy.business;
  const auth = useAccountAuth();
  const search = useSearch();
  const intent = useMemo(() => parseIntentSearch(search), [search]);
  const selfPath = `${BUSINESS_ONBOARDING_PATH}${search ? `?${search}` : ''}`;

  const confirm = useRecordBusinessOnboardingIntent();
  const [confirmed, setConfirmed] = useState<{ context: BusinessOnboardingContext; returnRef: string; listingDropped: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(!featureFlags.businessOnboarding);
  const [failure, setFailure] = useState<string | null>(null);
  const signedIn = auth.isLoaded && auth.isSignedIn;

  useEffect(() => {
    if (!signedIn || unavailable) return;
    let cancelled = false;
    // A new intent (URL change) invalidates the previous confirmation; Start waits for this one.
    setConfirmed(null);
    setFailure(null);
    const payload = {
      context: intent.context,
      ...(intent.listing ? { cityId: intent.listing.cityId, listingSource: intent.listing.source, listingId: intent.listing.id } : {}),
    };
    const run = async (body: typeof payload, listingDropped: boolean) => {
      try {
        const result = await confirm.mutateAsync({ data: body });
        if (!cancelled) setConfirmed({ context: result.context, returnRef: result.returnRef, listingDropped });
      } catch (error) {
        if (cancelled) return;
        const apiError = apiErrorFrom(error);
        if (apiError?.code === 'FEATURE_DISABLED') {
          setUnavailable(true);
        } else if (apiError?.code === 'VALIDATION_FAILED' && !listingDropped && 'listingSource' in body) {
          // A malformed listing reference is not worth a dead end: keep the context, drop the listing.
          await run({ context: body.context }, true);
        } else {
          setFailure(accountErrorMessage(error, language));
        }
      }
    };
    void run(payload, false);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, unavailable, intent]);

  if (!auth.isLoaded) return <AccountLoading label={copy.account.loading} />;
  if (!auth.isSignedIn) return <Redirect to={withReturnPath('/sign-in', selfPath)} />;

  const shell = (children: React.ReactNode) => (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={business.eyebrow}
      title={business.title}
      intro={business.intro}
      backHref="/account"
      testId="page-business-onboarding"
      headingTestId="heading-business-onboarding"
    >
      {children}
    </AccountShell>
  );

  if (unavailable) return shell(<BusinessOnboardingUnavailable language={language} />);

  const listingKept = Boolean(confirmed && intent.listing && !confirmed.listingDropped);
  // Interim hand-over until the Phase 3 wizard: a confirmed listing goes straight
  // to the existing-listing intake step; anything else starts at the lookup.
  const startHref = (() => {
    const back = confirmed?.returnRef ?? BUSINESS_ONBOARDING_PATH;
    if (listingKept && intent.listing) {
      const params = new URLSearchParams({ kind: 'existing_listing', cityId: intent.listing.cityId, listingSource: intent.listing.source, listingId: intent.listing.id });
      return withReturnPath(`/bedrijf-nieuw?${params.toString()}`, back);
    }
    return withReturnPath('/bedrijf-zoeken', back);
  })();

  return shell(
    <div className="space-y-6">
      {confirmed?.context === 'registration' ? (
        <p data-testid="status-business-resume" role="status" className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {business.resumeNotice}
        </p>
      ) : null}
      {listingKept ? (
        <p data-testid="status-business-listing" role="status" className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground">
          {business.listingNotice}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" data-testid="error-business-intent" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {failure}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <ExplainCard icon={<Store className="h-5 w-5" aria-hidden="true" />} title={business.whatTitle} body={business.whatBody} testId="explain-what" />
        <ExplainCard icon={<Eye className="h-5 w-5" aria-hidden="true" />} title={business.whoTitle} body={business.whoBody} testId="explain-who" />
        <ExplainCard icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title={business.separateTitle} body={business.separateBody} testId="explain-separate" />
      </div>

      <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-foreground">
          <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          {business.stepsTitle}
        </h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
          {[business.step1, business.step2, business.step3].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={startHref}
            data-testid="button-business-start"
            aria-disabled={!confirmed || undefined}
            className={`inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 ${confirmed ? '' : 'pointer-events-none opacity-60'}`}
          >
            {business.start}
          </Link>
          <Link href="/account" data-testid="link-business-back-account" className="text-sm font-bold text-primary underline-offset-2 hover:underline">
            {business.backToAccount}
          </Link>
        </div>
      </section>
    </div>,
  );
}

function ExplainCard({ icon, title, body, testId }: { icon: React.ReactNode; title: string; body: string; testId: string }) {
  return (
    <section data-testid={testId} className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}

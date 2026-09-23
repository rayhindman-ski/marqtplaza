import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, Clock, LinkIcon } from 'lucide-react';

import {
  getInspectConsumerRegistrationLinkQueryKey,
  useConsumeConsumerRegistrationLink,
  useInspectConsumerRegistrationLink,
  type ConsumerRegistrationLinkState,
  type ConsumerRegistrationLinkStatus,
} from '@workspace/api-client-react';

import { AccountShell } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy, type Language } from '@/lib/i18n';
import { hasStoredLanguage, useAppLanguage } from '@/lib/useAppLanguage';
import { RegistrationUnavailable, apiErrorFrom } from './ConsumerRegisterPage';

/**
 * Link handoff (REG-014, REG-015). Opening the page only *inspects* the link,
 * so a mail scanner that prefetches it cannot consume it; the consumer's
 * explicit "Continue" consumes it. Every state has its own explicit copy.
 */

type Phase = 'checking' | 'ready' | 'done' | ConsumerRegistrationLinkStatus | 'unavailable';

/** The token is read once and removed from the address bar so it does not linger in history or referrers. */
function takeTokenFromLocation(): string {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token') ?? '';
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return token;
}

function stateCopy(register: (typeof accountTranslations)[Language]['register'], state: Exclude<Phase, 'checking' | 'ready' | 'done' | 'valid'>) {
  return {
    title: register[`state_${state}_title`],
    body: register[`state_${state}_body`],
  };
}

export default function ConsumerRegisterCompletePage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const register = copy.register;
  const token = useMemo(() => takeTokenFromLocation(), []);
  const enabled = featureFlags.consumerRegistration && token.length > 0;

  const inspect = useInspectConsumerRegistrationLink(
    { token },
    { query: { enabled, retry: false, staleTime: Infinity, queryKey: getInspectConsumerRegistrationLinkQueryKey({ token }) } },
  );
  const consume = useConsumeConsumerRegistrationLink();
  const [result, setResult] = useState<ConsumerRegistrationLinkState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The link's locale is only a fallback for a browser that has not chosen a
  // language yet (e.g. the email was opened on another device). A language the
  // visitor already picked in this browser always wins, as on every other page.
  useEffect(() => {
    const locale = inspect.data?.locale;
    if (locale && locale !== language && !hasStoredLanguage()) setLanguage(locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspect.data?.locale]);

  if (!featureFlags.consumerRegistration) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={register.completeEyebrow} title={register.completeTitle} testId="page-register-complete" headingTestId="heading-register-complete">
        <RegistrationUnavailable language={language} />
      </AccountShell>
    );
  }

  let phase: Phase;
  if (!token) phase = 'invalid';
  else if (result) phase = result.state === 'valid' ? 'done' : result.state;
  else if (inspect.isPending) phase = 'checking';
  else if (inspect.isError) phase = apiErrorFrom(inspect.error)?.code === 'FEATURE_DISABLED' ? 'invalid' : 'unavailable';
  else if (inspect.data?.state === 'valid') phase = 'ready';
  else phase = inspect.data?.state ?? 'invalid';

  // Each outcome (ready, done, expired, …) is a route-level state change without navigation; move focus to it.
  const outcomeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (phase !== 'checking') outcomeRef.current?.focus();
  }, [phase]);

  async function onContinue() {
    setActionError(null);
    try {
      setResult(await consume.mutateAsync({ data: { token } }));
    } catch (error) {
      setActionError(accountErrorMessage(error, language));
    }
  }

  const canResend = result?.canResend ?? inspect.data?.canResend ?? phase === 'invalid';

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={register.completeEyebrow}
      title={register.completeTitle}
      testId="page-register-complete"
      headingTestId="heading-register-complete"
    >
      <section ref={outcomeRef} tabIndex={-1} data-testid={`status-register-link-${phase}`} aria-live="polite" className="rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border/80 bg-card p-6 shadow-sm">
        {phase === 'checking' ? (
          <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{register.completeChecking}</p>
        ) : null}

        {phase === 'ready' && inspect.data ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <LinkIcon className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                <p>{register.completeValidBody}</p>
                {inspect.data.expiresAt ? (
                  <p className="inline-flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatCopy(register.completeValidUntil, {
                      time: new Date(inspect.data.expiresAt).toLocaleTimeString(language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
                    })}
                  </p>
                ) : null}
              </div>
            </div>
            {actionError ? <p role="alert" data-testid="error-register-continue" className="text-sm font-semibold text-destructive">{actionError}</p> : null}
            <Button type="button" data-testid="button-register-continue" onClick={onContinue} disabled={consume.isPending} className="rounded-full">
              {consume.isPending ? register.continuing : register.continueAction}
            </Button>
          </div>
        ) : null}

        {phase === 'done' ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-2xl font-semibold text-foreground">{register.doneTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{register.doneBody}</p>
              <Link href="/" className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                {copy.back}
              </Link>
            </div>
          </div>
        ) : null}

        {phase === 'expired' || phase === 'used' || phase === 'superseded' || phase === 'invalid' || phase === 'unavailable' ? (
          <div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">{stateCopy(register, phase).title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{stateCopy(register, phase).body}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {phase === 'unavailable' ? (
                <Button type="button" variant="outline" data-testid="button-register-retry" onClick={() => inspect.refetch()} className="rounded-full">
                  {register.retry}
                </Button>
              ) : null}
              {canResend && phase !== 'unavailable' ? (
                <Link href="/account/register/check-email" data-testid="link-register-request-new" className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  {register.requestNewLink}
                </Link>
              ) : null}
              <Link href="/" className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
                {copy.back}
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </AccountShell>
  );
}

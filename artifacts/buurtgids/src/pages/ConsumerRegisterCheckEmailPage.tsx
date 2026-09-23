import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { MailCheck } from 'lucide-react';

import { useResendConsumerRegistration } from '@workspace/api-client-react';

import { AccountShell } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import {
  REGISTRATION_EMAIL_STORAGE_KEY,
  REGISTRATION_LIFETIME_STORAGE_KEY,
  RegistrationUnavailable,
  apiErrorFrom,
} from './ConsumerRegisterPage';

/** Neutral "check your email" step with the resend journey (REG-009, REG-016). */

function readStored(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function ConsumerRegisterCheckEmailPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const register = copy.register;
  const [email, setEmail] = useState(() => readStored(REGISTRATION_EMAIL_STORAGE_KEY) ?? '');
  const minutes = Number(readStored(REGISTRATION_LIFETIME_STORAGE_KEY) ?? '60') || 60;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resend = useResendConsumerRegistration();
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [feedback, setFeedback] = useState(0);

  // A failed resend returns focus to the field it describes; a successful one lands on the confirmation.
  useEffect(() => {
    if (feedback === 0) return;
    if (error) inputRef.current?.focus();
    else noticeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  if (!featureFlags.consumerRegistration) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={register.checkEyebrow} title={register.checkTitle} testId="page-register-check-email" headingTestId="heading-register-check-email">
        <RegistrationUnavailable language={language} />
      </AccountShell>
    );
  }

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    if (!email.trim()) {
      setError(register.field_required);
      setFeedback((n) => n + 1);
      return;
    }
    try {
      await resend.mutateAsync({ data: { email: email.trim(), locale: language } });
      setNotice(register.resent);
    } catch (caught) {
      const apiError = apiErrorFrom(caught);
      setError(apiError?.code === 'VALIDATION_FAILED' ? register.field_invalid : accountErrorMessage(caught, language));
    }
    setFeedback((n) => n + 1);
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={register.checkEyebrow}
      title={register.checkTitle}
      intro={register.checkIntro}
      backHref="/account/register"
      testId="page-register-check-email"
      headingTestId="heading-register-check-email"
    >
      <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <MailCheck className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p data-testid="text-register-lifetime">{formatCopy(register.checkLifetime, { minutes })}</p>
            <p>{register.checkSpam}</p>
            <p>
              {register.checkExisting}{' '}
              <Link href="/sign-in" data-testid="link-check-email-sign-in" className="font-bold text-primary underline-offset-2 hover:underline">
                {register.signInLink}
              </Link>
            </p>
          </div>
        </div>

        <form onSubmit={onResend} noValidate data-testid="form-register-resend" className="mt-6 space-y-3 border-t border-border/70 pt-6">
          <Label htmlFor="resend-email">{register.resendEmailLabel}</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="resend-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              ref={inputRef}
              data-testid="input-resend-email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'resend-email-error' : undefined}
              value={email}
              maxLength={254}
              disabled={resend.isPending}
              onChange={(event) => setEmail(event.target.value)}
              className="sm:max-w-sm"
            />
            <Button type="submit" variant="outline" data-testid="button-register-resend" disabled={resend.isPending} className="rounded-full">
              {resend.isPending ? register.resending : register.resend}
            </Button>
          </div>
          {notice ? <p ref={noticeRef} tabIndex={-1} role="status" data-testid="status-register-resent" className="text-sm font-semibold text-foreground">{notice}</p> : null}
          {error ? <p id="resend-email-error" role="alert" data-testid="error-register-resend" className="text-sm font-semibold text-destructive">{error}</p> : null}
        </form>
      </section>
    </AccountShell>
  );
}

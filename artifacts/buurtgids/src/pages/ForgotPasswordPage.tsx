import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Redirect, useLocation, useSearch } from 'wouter';
import { useClerk, useSignIn } from '@clerk/react';
import { CheckCircle2, MailCheck } from 'lucide-react';

import { AccountShell } from '@/components/account/AccountShell';
import { PasswordField } from '@/components/account/PasswordField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccountAuth } from '@/lib/accountAuth';
import { clerkErrorCode, clerkErrorField, securityErrorMessage } from '@/lib/clerkErrors';
import { accountTranslations } from '@/lib/i18n';
import { resolveReturnPath, withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

export const FORGOT_PASSWORD_PATH = '/account/wachtwoord-vergeten';
export const RESET_PASSWORD_PATH = '/account/wachtwoord-herstellen';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Password recovery (REC-001 – REC-009) as an identity-provider custom flow
 * framed by the app: the address step answers the same way whether or not an
 * account exists; the code step applies the same password rules as sign-up;
 * a completed reset signs the person in once and can end other sessions. The
 * password only ever travels to the identity provider.
 */
export default function ForgotPasswordPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const security = copy.security;
  const [location, navigate] = useLocation();
  const search = useSearch();
  const returnPath = resolveReturnPath(search, '');
  const auth = useAccountAuth();
  const { loaded: isLoaded } = useClerk();
  const { signIn } = useSignIn();

  const step: 'email' | 'code' = location === RESET_PASSWORD_PATH ? 'code' : 'email';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});

  const outcomeRef = useRef<HTMLElement>(null);
  // Finalizing the reset creates the session before `done` is set; without
  // this flag the signed-in redirect below would win over the success state.
  const completingRef = useRef(false);
  useEffect(() => {
    if (sent || done) outcomeRef.current?.focus();
  }, [sent, done]);

  if (!auth.isLoaded || !isLoaded) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={security.forgotEyebrow} title={security.forgotTitle} testId="page-forgot-password" headingTestId="heading-forgot-password">
        <p role="status" className="text-sm text-muted-foreground">{copy.account.loading}</p>
      </AccountShell>
    );
  }
  // A signed-in person changes the password from the security page instead (AUTH-014).
  if (auth.isSignedIn && !done && !completingRef.current) return <Redirect to={withReturnPath('/account/security', returnPath)} />;

  const signInHref = withReturnPath('/sign-in', returnPath);

  async function onRequestCode(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldErrors({ email: security.error_required });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const created = await signIn.create({ identifier: trimmed });
      if (created.error) {
        const errorCode = clerkErrorCode(created.error);
        // Unknown address: answer exactly like a known one (REC-002). Nothing was sent.
        if (errorCode === 'form_identifier_not_found' || errorCode === 'form_param_format_invalid') setSent(true);
        else setFormError(securityErrorMessage(created.error, language));
        return;
      }
      const sending = await signIn.resetPasswordEmailCode.sendCode();
      if (sending.error) {
        setFormError(securityErrorMessage(sending.error, language));
        return;
      }
      setSent(true);
    } catch (error) {
      setFormError(securityErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const issues: typeof fieldErrors = {};
    if (!code.trim()) issues.code = security.error_required;
    if (!password) issues.password = security.error_required;
    else if (password.length < MIN_PASSWORD_LENGTH) issues.password = security.error_form_password_length_too_short;
    if (password && confirm !== password) issues.confirm = security.error_mismatch;
    setFieldErrors(issues);
    if (Object.keys(issues).length > 0) return;
    setBusy(true);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verified.error) {
        const message = securityErrorMessage(verified.error, language);
        if (clerkErrorField(verified.error) === 'code' || /code|verification/.test(clerkErrorCode(verified.error) ?? '')) setFieldErrors({ code: message });
        else setFormError(message);
        return;
      }
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: signOutOthers });
      if (submitted.error) {
        const message = securityErrorMessage(submitted.error, language);
        if (clerkErrorField(submitted.error) === 'password' || /password/.test(clerkErrorCode(submitted.error) ?? '')) setFieldErrors({ password: message });
        else setFormError(message);
        return;
      }
      completingRef.current = true;
      const finalized = await signIn.finalize();
      if (finalized.error) {
        completingRef.current = false;
        setFormError(securityErrorMessage(finalized.error, language));
        return;
      }
      setPassword('');
      setConfirm('');
      setCode('');
      setDone(true);
    } catch (error) {
      setFormError(securityErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  const resetInProgress = signIn.status === 'needs_first_factor' || signIn.status === 'needs_new_password';

  if (done) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={security.resetEyebrow} title={security.resetTitle} testId="page-reset-password" headingTestId="heading-reset-password">
        <section ref={outcomeRef} tabIndex={-1} data-testid="status-reset-password-done" aria-live="polite" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-2xl font-semibold text-foreground">{security.resetDoneTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{security.resetDoneBody}</p>
              <Button type="button" data-testid="button-reset-password-continue" className="mt-5 rounded-full" onClick={() => navigate(returnPath || '/account')}>
                {security.resetDoneContinue}
              </Button>
            </div>
          </div>
        </section>
      </AccountShell>
    );
  }

  if (step === 'code') {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={security.resetEyebrow} title={security.resetTitle} intro={security.resetIntro} testId="page-reset-password" headingTestId="heading-reset-password" backHref={signInHref}>
        {!resetInProgress ? (
          <section data-testid="status-reset-password-no-flow" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{security.resetNoFlowTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{security.resetNoFlowBody}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={withReturnPath(FORGOT_PASSWORD_PATH, returnPath)} data-testid="link-reset-password-restart" className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                {security.forgotAgain}
              </Link>
              <Link href={signInHref} className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
                {security.backToSignIn}
              </Link>
            </div>
          </section>
        ) : (
          <form onSubmit={onResetPassword} noValidate data-testid="form-reset-password" className="max-w-xl rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-code">{security.codeLabel}</Label>
                <p id="reset-code-hint" className="text-xs leading-5 text-muted-foreground">{security.codeHint}</p>
                <Input
                  id="reset-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  data-testid="input-reset-code"
                  value={code}
                  disabled={busy}
                  aria-invalid={fieldErrors.code ? true : undefined}
                  aria-describedby={fieldErrors.code ? 'reset-code-error reset-code-hint' : 'reset-code-hint'}
                  onChange={(event) => setCode(event.target.value)}
                />
                {fieldErrors.code ? <p id="reset-code-error" role="alert" data-testid="error-reset-code" className="text-sm font-semibold text-destructive">{fieldErrors.code}</p> : null}
              </div>
              <PasswordField id="reset-password" testId="input-reset-password" label={security.newPasswordLabel} hint={security.passwordRules} value={password} onChange={setPassword} language={language} autoComplete="new-password" error={fieldErrors.password} disabled={busy} />
              <PasswordField id="reset-password-confirm" testId="input-reset-password-confirm" label={security.confirmPasswordLabel} value={confirm} onChange={setConfirm} language={language} autoComplete="new-password" error={fieldErrors.confirm} disabled={busy} />
              <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
                <input type="checkbox" data-testid="checkbox-reset-sign-out-others" className="mt-1.5 h-4 w-4" checked={signOutOthers} disabled={busy} onChange={(event) => setSignOutOthers(event.target.checked)} />
                {security.signOutOthersLabel}
              </label>
              {formError ? <p role="alert" data-testid="error-reset-password" className="text-sm font-semibold text-destructive">{formError}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" data-testid="button-reset-password-submit" disabled={busy} className="rounded-full">
                  {busy ? security.resetSubmitting : security.resetSubmit}
                </Button>
                <Link href={withReturnPath(FORGOT_PASSWORD_PATH, returnPath)} data-testid="link-reset-password-again" className="text-sm font-bold text-primary hover:underline">
                  {security.forgotAgain}
                </Link>
              </div>
            </div>
          </form>
        )}
      </AccountShell>
    );
  }

  return (
    <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={security.forgotEyebrow} title={security.forgotTitle} intro={security.forgotIntro} testId="page-forgot-password" headingTestId="heading-forgot-password" backHref={signInHref}>
      {sent ? (
        <section ref={outcomeRef} tabIndex={-1} data-testid="status-forgot-password-sent" aria-live="polite" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-2xl font-semibold text-foreground">{security.forgotSentTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{security.forgotSentBody}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{security.forgotSentSpam}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" data-testid="button-forgot-password-enter-code" className="rounded-full" onClick={() => navigate(withReturnPath(RESET_PASSWORD_PATH, returnPath))}>
                  {security.resetTitle}
                </Button>
                <Button type="button" variant="outline" data-testid="button-forgot-password-again" className="rounded-full" onClick={() => setSent(false)}>
                  {security.forgotAgain}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={onRequestCode} noValidate data-testid="form-forgot-password" className="max-w-xl rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">{security.forgotEmailLabel}</Label>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                data-testid="input-forgot-email"
                value={email}
                maxLength={254}
                disabled={busy}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'forgot-email-error' : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
              {fieldErrors.email ? <p id="forgot-email-error" role="alert" data-testid="error-forgot-email" className="text-sm font-semibold text-destructive">{fieldErrors.email}</p> : null}
            </div>
            {formError ? <p role="alert" data-testid="error-forgot-password" className="text-sm font-semibold text-destructive">{formError}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" data-testid="button-forgot-password-submit" disabled={busy} className="rounded-full">
                {busy ? security.forgotSubmitting : security.forgotSubmit}
              </Button>
              <Link href={signInHref} data-testid="link-forgot-password-sign-in" className="text-sm font-bold text-primary hover:underline">
                {security.backToSignIn}
              </Link>
            </div>
          </div>
        </form>
      )}
    </AccountShell>
  );
}

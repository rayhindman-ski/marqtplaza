import { useEffect, useState, type FormEvent } from 'react';
import { Link, Redirect, useSearch } from 'wouter';
import { useSession, useUser } from '@clerk/react';
import { KeyRound, MonitorSmartphone } from 'lucide-react';

import { AccountShell } from '@/components/account/AccountShell';
import { PasswordField } from '@/components/account/PasswordField';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { clerkErrorField, securityErrorMessage } from '@/lib/clerkErrors';
import { accountTranslations, formatCopy } from '@/lib/i18n';
import { resolveReturnPath, withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Account security (AUTH-013, AUTH-014, REC-010): change or set the password
 * and end other sessions. Changing requires the current password, which is
 * the identity provider's recent-authentication proof; the provider also
 * sends its own "password changed" notification. Nothing here touches the
 * application API — no password ever reaches it.
 */
export default function AccountSecurityPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const security = copy.security;
  const search = useSearch();
  const returnPath = resolveReturnPath(search, '');
  const auth = useAccountAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const { session } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; password?: string; confirm?: string }>({});

  const [otherSessions, setOtherSessions] = useState<number | null>(null);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsDone, setSessionsDone] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !session) return;
    let cancelled = false;
    user
      .getSessions()
      .then((sessions) => {
        if (!cancelled) setOtherSessions(sessions.filter((entry) => entry.id !== session.id && entry.status === 'active').length);
      })
      .catch(() => {
        if (!cancelled) setOtherSessions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, session, sessionsDone]);

  if (!auth.isLoaded || !userLoaded) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={security.eyebrow} title={security.title} testId="page-account-security" headingTestId="heading-account-security">
        <p role="status" className="text-sm text-muted-foreground">{copy.account.loading}</p>
      </AccountShell>
    );
  }
  if (!auth.isSignedIn || !user) return <Redirect to={withReturnPath('/sign-in', '/account/beveiliging')} />;

  const hasPassword = user.passwordEnabled;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setChanged(false);
    const issues: typeof fieldErrors = {};
    if (hasPassword && !currentPassword) issues.current = security.error_required;
    if (!password) issues.password = security.error_required;
    else if (password.length < MIN_PASSWORD_LENGTH) issues.password = security.error_form_password_length_too_short;
    if (password && confirm !== password) issues.confirm = security.error_mismatch;
    setFieldErrors(issues);
    if (Object.keys(issues).length > 0) return;
    setBusy(true);
    try {
      await user!.updatePassword({
        newPassword: password,
        ...(hasPassword ? { currentPassword } : {}),
        signOutOfOtherSessions: signOutOthers,
      });
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      setChanged(true);
      if (signOutOthers) setSessionsDone((value) => !value);
    } catch (error) {
      const message = securityErrorMessage(error, language);
      const field = clerkErrorField(error);
      if (field === 'current_password') setFieldErrors({ current: message });
      else if (field === 'new_password' || field === 'password') setFieldErrors({ password: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  async function onSignOutOthers() {
    setSessionsError(null);
    setSessionsBusy(true);
    try {
      const sessions = await user!.getSessions();
      await Promise.all(sessions.filter((entry) => entry.id !== session?.id).map((entry) => entry.revoke()));
      setSessionsDone((value) => !value);
    } catch (error) {
      setSessionsError(securityErrorMessage(error, language));
    } finally {
      setSessionsBusy(false);
    }
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={security.eyebrow}
      title={security.title}
      intro={security.intro}
      testId="page-account-security"
      headingTestId="heading-account-security"
      backHref={returnPath || '/account'}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <form onSubmit={onSubmit} noValidate data-testid="form-change-password" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-foreground">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
            {hasPassword ? security.changeTitle : security.setTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{hasPassword ? security.changeIntro : security.setIntro}</p>
          <div className="mt-6 space-y-5">
            {hasPassword ? (
              <PasswordField id="security-current-password" testId="input-current-password" label={security.currentPasswordLabel} value={currentPassword} onChange={setCurrentPassword} language={language} autoComplete="current-password" error={fieldErrors.current} disabled={busy} />
            ) : null}
            <PasswordField id="security-new-password" testId="input-new-password" label={security.newPasswordLabel} hint={security.passwordRules} value={password} onChange={setPassword} language={language} autoComplete="new-password" error={fieldErrors.password} disabled={busy} />
            <PasswordField id="security-confirm-password" testId="input-confirm-password" label={security.confirmPasswordLabel} value={confirm} onChange={setConfirm} language={language} autoComplete="new-password" error={fieldErrors.confirm} disabled={busy} />
            <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
              <input type="checkbox" data-testid="checkbox-change-sign-out-others" className="mt-1.5 h-4 w-4" checked={signOutOthers} disabled={busy} onChange={(event) => setSignOutOthers(event.target.checked)} />
              {security.signOutOthersLabel}
            </label>
            {formError ? <p role="alert" data-testid="error-change-password" className="text-sm font-semibold text-destructive">{formError}</p> : null}
            {changed ? <p role="status" data-testid="status-change-password-done" className="text-sm font-semibold text-foreground">{security.changeDone}</p> : null}
            <Button type="submit" data-testid="button-change-password-submit" disabled={busy} className="rounded-full">
              {busy ? security.resetSubmitting : hasPassword ? security.changeSubmit : security.setTitle}
            </Button>
          </div>
        </form>

        <section data-testid="panel-sessions" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-foreground">
            <MonitorSmartphone className="h-5 w-5 text-primary" aria-hidden="true" />
            {security.sessionsTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{security.sessionsIntro}</p>
          {otherSessions !== null ? (
            <p data-testid="status-sessions-count" className="mt-3 text-sm text-foreground">
              {otherSessions === 0 ? security.sessionsNone : formatCopy(security.sessionsCount, { count: String(otherSessions) })}
            </p>
          ) : null}
          {sessionsError ? <p role="alert" data-testid="error-sessions" className="mt-3 text-sm font-semibold text-destructive">{sessionsError}</p> : null}
          {sessionsDone && otherSessions === 0 ? <p role="status" data-testid="status-sessions-done" className="mt-3 text-sm font-semibold text-foreground">{security.sessionsDone}</p> : null}
          <Button type="button" variant="outline" data-testid="button-sign-out-others" disabled={sessionsBusy || otherSessions === 0} className="mt-5 rounded-full" onClick={() => void onSignOutOthers()}>
            {sessionsBusy ? security.sessionsSubmitting : security.sessionsSubmit}
          </Button>
          <p className="mt-6 text-sm">
            <Link href="/account" data-testid="link-security-back-account" className="font-bold text-primary hover:underline">
              {security.backToAccount}
            </Link>
          </p>
        </section>
      </div>
    </AccountShell>
  );
}

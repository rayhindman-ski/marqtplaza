import { useState, type FormEvent } from 'react';
import { Redirect } from 'wouter';
import { useUser } from '@clerk/react';
import { useConfirmAccountEmailChange, useStartAccountEmailChange } from '@workspace/api-client-react';
import { AuthPageFrame } from '@/components/account/AuthPageFrame';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { accountTranslations } from '@/lib/i18n';
import { isRecentAuthError, RecentAuthPrompt } from '@/lib/recentAuth';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { withReturnPath } from '@/lib/returnPath';

export default function AccountEmailChangePage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language].emailChange;
  const auth = useAccountAuth();
  const { user } = useUser();
  const start = useStartAccountEmailChange();
  const confirm = useConfirmAccountEmailChange();
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [emailId, setEmailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  if (auth.isLoaded && !auth.isSignedIn) return <Redirect to={withReturnPath('/sign-in', '/account/e-mail-wijzigen')} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user && !auth.isTestAuth) return;
    setBusy(true);
    setError(null);
    try {
      if (!emailId) {
        await start.mutateAsync();
        if (!user) throw new Error('Clerk session required to create the address');
        const created = await user.createEmailAddress({ email: address });
        await created.prepareVerification({ strategy: 'email_code' });
        setEmailId(created.id);
      } else {
        const entry = user?.emailAddresses.find((email) => email.id === emailId);
        if (!entry) throw new Error('Email address no longer exists');
        const verified = await entry.attemptVerification({ code });
        if (verified.verification.status !== 'verified') throw new Error('Verification incomplete');
        await user!.update({ primaryEmailAddressId: emailId });
        await confirm.mutateAsync();
        setDone(true);
      }
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  return <AuthPageFrame testId="page-account-email-change" language={language} onLanguageChange={setLanguage}><section className="w-full max-w-xl">
    <h1 data-testid="heading-account-email-change" className="mb-4 font-serif text-4xl font-semibold">{copy.title}</h1>
    <p className="mb-6 text-sm text-muted-foreground">{copy.intro}</p>
    {isRecentAuthError(error) ? <RecentAuthPrompt language={language} returnPath="/account/e-mail-wijzigen" /> :
      error ? <p role="alert" className="text-destructive">{copy.error}</p> : null}
    {done ? <p role="status">{copy.done}</p> :
      <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-4 rounded-3xl border border-border bg-card p-6">
        {!emailId ? <label className="block">{copy.label}
          <input type="email" required autoComplete="email" value={address} onChange={(event) => setAddress(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-border p-2" />
        </label> : <label className="block">{copy.code}
          <input type="text" required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-border p-2" />
        </label>}
        <Button type="submit" disabled={busy || (!user && !auth.isTestAuth)}>{emailId ? copy.verify : copy.start}</Button>
      </form>}
  </section></AuthPageFrame>;
}
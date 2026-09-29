import { Link, Redirect } from 'wouter';
import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';

export default function AccountRightsPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language].rights;
  const auth = useAccountAuth();
  if (!auth.isLoaded) return <AccountLoading label={accountTranslations[language].account.loading} />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  const links = [
    ['access', '/account'], ['correction', '/account/voorkeuren'],
    ['export', '/account/gegevens-export'], ['deletion', '/account/privacy'],
    ['restriction', '/account/privacy'], ['objection', '/account/privacy'],
    ['contact', '/account'],
  ] as const;
  return <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={copy.title}
    title={copy.title} intro={copy.intro} backHref="/account/privacy"
    testId="page-account-rights" headingTestId="heading-account-rights">
    {!featureFlags.accounts ? <AccountUnavailable language={language} /> :
      <ul className="grid gap-3 sm:grid-cols-2">{links.map(([key, href]) =>
        <li key={key}><Link href={href} data-testid={`link-right-${key}`}
          className="block rounded-2xl border border-border bg-card p-5 font-bold text-primary underline-offset-2 hover:underline">
          {copy[key]}</Link></li>)}</ul>}
  </AccountShell>;
}

export function AccountExportUnavailablePage() {
  const [language, setLanguage] = useAppLanguage();
  return <AccountShell language={language} onLanguageChange={setLanguage}
    eyebrow={accountTranslations[language].rights.export} title={accountTranslations[language].rights.export}
    backHref="/account/privacy/rechten" testId="page-account-export" headingTestId="heading-account-export">
    <AccountUnavailable language={language} />
  </AccountShell>;
}
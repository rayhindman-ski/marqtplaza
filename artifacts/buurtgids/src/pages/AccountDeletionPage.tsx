import { Redirect } from 'wouter';
import { getGetAccountMeQueryKey, useGetAccountMe } from '@workspace/api-client-react';
import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { RequestsPanel } from './AccountPrivacyPage';

export default function AccountDeletionPage() {
  const [language, setLanguage] = useAppLanguage();
  const auth = useAccountAuth();
  const me = useGetAccountMe({ query: { queryKey: getGetAccountMeQueryKey(), enabled: auth.isLoaded && auth.isSignedIn && featureFlags.accountDeletion, retry: false } });
  const privacy = accountTranslations[language].privacy;
  if (!auth.isLoaded) return <AccountLoading label={accountTranslations[language].account.loading} />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  return <AccountShell language={language} onLanguageChange={setLanguage}
    eyebrow={privacy.eyebrow} title={privacy.scopesTitle} intro={privacy.scopesIntro}
    backHref="/account/privacy" testId="page-account-deletion" headingTestId="heading-account-deletion">
    {featureFlags.accountDeletion ? me.data
      ? <RequestsPanel language={language} verified={me.data.capabilities.isVerified} showPolicy />
      : me.isError ? <p role="alert">{language === 'nl' ? 'Het account kon niet worden geladen.' : 'The account could not be loaded.'}</p>
        : <AccountLoading label={accountTranslations[language].account.loading} />
      : <AccountUnavailable language={language} />}
  </AccountShell>;
}
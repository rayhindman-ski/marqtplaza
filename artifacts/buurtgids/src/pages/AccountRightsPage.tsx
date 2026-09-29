import { Link, Redirect } from 'wouter';
import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountExportTranslations, accountTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getListAccountExportRequestsQueryKey, useCreateAccountExportRequest, useListAccountExportRequests } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { RecentAuthPrompt, isRecentAuthError } from '@/lib/recentAuth';

export default function AccountRightsPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language].rights;
  const auth = useAccountAuth();
  if (!auth.isLoaded) return <AccountLoading label={accountTranslations[language].account.loading} />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  const links = [
    ['access', '/account'], ['correction', '/account/preferences'],
    ['export', '/account/data-export'], ['deletion', '/account/privacy'],
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
  const copy = accountExportTranslations[language];
  const auth = useAccountAuth();
  const client = useQueryClient();
  const [recentAuth, setRecentAuth] = useState(false);
  const [error, setError] = useState(false);
  const query = useListAccountExportRequests({ query: { queryKey: getListAccountExportRequestsQueryKey(), enabled: featureFlags.accountExport && auth.isSignedIn } });
  const create = useCreateAccountExportRequest();
  if (!auth.isLoaded) return <AccountLoading label={accountTranslations[language].account.loading} />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  return <AccountShell language={language} onLanguageChange={setLanguage}
    eyebrow={accountTranslations[language].rights.export} title={accountTranslations[language].rights.export}
    backHref="/account/privacy/rights" testId="page-account-export" headingTestId="heading-account-export">
    {!featureFlags.accountExport ? <p role="status">{copy.unavailable}</p> : <div data-testid="account-export-content" className="space-y-5">
      <p>{copy.intro}</p>
      <Button type="button" variant="secondary" data-testid="button-request-export" disabled={create.isPending} onClick={() => {
        setError(false); setRecentAuth(false);
        create.mutate(undefined, {
          onSuccess: () => void client.invalidateQueries({ queryKey: getListAccountExportRequestsQueryKey() }),
          onError: cause => { setRecentAuth(isRecentAuthError(cause)); setError(true); },
        });
      }}>{copy.request}</Button>
      {error && (recentAuth ? <RecentAuthPrompt language={language} returnPath="/account/data-export" /> : <p role="alert">{copy.error}</p>)}
      {query.isError && <p role="alert">{copy.error}</p>}
      {query.data?.requests.length === 0 && <p>{copy.empty}</p>}
      <ul className="space-y-3">{query.data?.requests.map(item => <li key={item.reference} className="rounded-xl border p-4" data-testid={`export-${item.reference}`}>
        <strong>#{item.reference} · {copy.status[item.status]}</strong>
        {item.expiresAt && <p>{copy.until} {new Date(item.expiresAt).toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB')}</p>}
        {item.downloads.map(file => <a className="mr-4 underline" key={file.file} href={file.url} download={file.file}>{file.file}</a>)}
      </li>)}</ul>
    </div>}
  </AccountShell>;
}
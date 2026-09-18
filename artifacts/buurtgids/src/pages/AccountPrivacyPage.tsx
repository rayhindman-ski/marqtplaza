import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, ShieldAlert, Trash2 } from 'lucide-react';

import {
  getGetAccountMeQueryKey,
  getGetAccountMessagesQueryKey,
  getGetAccountRequestsQueryKey,
  useCreateAccountDeletionRequest,
  useGetAccountMe,
  useGetAccountMessages,
  useGetAccountRequests,
  useWithdrawAccountRequest,
  type AccountDeletionScope,
  type AccountRequest,
  type ApiError,
  type LifecycleMessage,
} from '@workspace/api-client-react';

import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy, type Language } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { clearBrowserData, type BrowserDataCategory } from '@/lib/browserData';
import { ConsentPanel } from './AccountPage';

const DELETION_SCOPES: AccountDeletionScope[] = [
  'account_profile',
  'preferences',
  'consents',
  'saved_events',
  'business_memberships',
];

type PrivacyCopy = (typeof accountTranslations)[Language]['privacy'];

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

function formatDate(value: string, language: Language): string {
  return new Date(value).toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function lookup(copy: PrivacyCopy, key: string, fallback: string): string {
  return key in copy ? copy[key as keyof PrivacyCopy] : fallback;
}

export default function AccountPrivacyPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const privacy = copy.privacy;
  const auth = useAccountAuth();
  const signedIn = auth.isLoaded && auth.isSignedIn;
  const accountsOn = featureFlags.accounts && signedIn;

  const meQuery = useGetAccountMe({ query: { enabled: accountsOn, queryKey: getGetAccountMeQueryKey(), retry: false } });

  if (!auth.isLoaded) return <AccountLoading label={copy.account.loading} />;
  const me = meQuery.data;
  const meError = apiErrorFrom(meQuery.error);
  const featureDisabled = !featureFlags.accounts || meError?.code === 'FEATURE_DISABLED';

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={privacy.eyebrow}
      title={privacy.title}
      intro={privacy.intro}
      backHref="/account"
      testId="page-account-privacy"
      headingTestId="heading-account-privacy"
    >
      <BrowserDataPanel language={language} />
      {!auth.isSignedIn ? (
        <section className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            {language === 'nl' ? 'Gegevens in je account' : 'Data in your account'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {language === 'nl'
              ? 'Browsergegevens wissen verwijdert geen account- of servergegevens. Log in om toestemmingen, verzoeken en accountverwijdering te beheren.'
              : 'Clearing browser data does not delete account or server data. Sign in to manage consent, requests, and account deletion.'}
          </p>
          <Link href="/sign-in" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            {language === 'nl' ? 'Inloggen voor accountprivacy' : 'Sign in for account privacy'}
          </Link>
        </section>
      ) : featureDisabled ? (
        <div className="mb-6"><AccountUnavailable language={language} /></div>
      ) : meQuery.isError ? (
        <div role="alert" data-testid="status-privacy-error" className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-900">{accountErrorMessage(meQuery.error, language)}</p>
        </div>
      ) : me ? (
        <>
          <ConsentPanel language={language} enabled={accountsOn} verified={me.capabilities.isVerified} />
          <RequestsPanel language={language} verified={me.capabilities.isVerified} />
          <MessagesPanel language={language} />
        </>
      ) : (
        <p role="status" className="mb-6 text-sm text-muted-foreground">{copy.account.loading}</p>
      )}
      <div className="mt-2">
        <Link href="/account" data-testid="link-privacy-back" className="text-sm font-bold text-primary hover:underline">
          {privacy.toAccount}
        </Link>
      </div>
    </AccountShell>
  );
}

const BROWSER_DATA_CATEGORIES: BrowserDataCategory[] = ['discovery', 'saved', 'language', 'drafts'];

function BrowserDataPanel({ language }: { language: Language }) {
  const [selected, setSelected] = useState<Set<BrowserDataCategory>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState<BrowserDataCategory[]>([]);
  const labels: Record<BrowserDataCategory, string> = language === 'nl'
    ? {
      discovery: 'Zoekbereik, anonieme browser-ID en lokale weergavekeuzes',
      saved: 'Lokaal opgeslagen plaatsen en gebeurtenismeldingen',
      language: 'Taalvoorkeur op dit apparaat',
      drafts: 'Tijdelijke accountvoorkeuren in deze browsersessie',
    }
    : {
      discovery: 'Search scope, anonymous browser ID, and local display choices',
      saved: 'Locally saved places and event alerts',
      language: 'Language preference on this device',
      drafts: 'Temporary account-preference drafts in this browser session',
    };

  const toggle = (category: BrowserDataCategory) => {
    setCleared([]);
    setConfirming(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const confirmClear = () => {
    const categories = [...selected];
    setCleared(clearBrowserData(categories));
    setSelected(new Set());
    setConfirming(false);
  };

  return (
    <section data-testid="browser-data-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {language === 'nl' ? 'Gegevens in deze browser' : 'Data in this browser'}
      </p>
      <h2 className="mt-2 font-serif text-xl font-semibold text-foreground">
        {language === 'nl' ? 'Kies wat je wilt wissen' : 'Choose what to clear'}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {language === 'nl'
          ? 'Dit wist alleen de gekozen gegevens uit deze browser. Het verwijdert geen account, bijdragen of gegevens op onze servers.'
          : 'This clears only the selected data from this browser. It does not delete your account, contributions, or data on our servers.'}
      </p>
      <fieldset className="mt-5">
        <legend className="sr-only">{language === 'nl' ? 'Browsergegevens kiezen' : 'Select browser data'}</legend>
        <ul className="grid gap-2">
          {BROWSER_DATA_CATEGORIES.map((category) => (
            <li key={category}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(category)}
                  onChange={() => toggle(category)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="font-medium text-foreground">{labels[category]}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {!confirming ? (
        <Button
          type="button"
          variant="destructive"
          className="mt-5"
          disabled={selected.size === 0}
          onClick={() => setConfirming(true)}
        >
          {language === 'nl' ? 'Keuze controleren' : 'Review selection'}
        </Button>
      ) : (
        <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-bold">
            {language === 'nl'
              ? `Je wist ${selected.size} gekozen categorie${selected.size === 1 ? '' : 'ën'} uit deze browser.`
              : `You are clearing ${selected.size} selected browser-data ${selected.size === 1 ? 'category' : 'categories'}.`}
          </p>
          <p className="mt-1 text-xs leading-5">
            {language === 'nl'
              ? 'Account- en servergegevens blijven ongewijzigd.'
              : 'Account and server data will remain unchanged.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="destructive" onClick={confirmClear}>
              {language === 'nl' ? 'Browsergegevens wissen' : 'Clear browser data'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {language === 'nl' ? 'Annuleren' : 'Cancel'}
            </Button>
          </div>
        </div>
      )}

      {cleared.length > 0 ? (
        <div role="status" aria-live="polite" data-testid="browser-data-cleared" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <p className="text-sm font-bold">
            {language === 'nl' ? 'Gewist uit deze browser:' : 'Cleared from this browser:'}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {cleared.map((category) => <li key={category}>{labels[category]}</li>)}
          </ul>
          <p className="mt-2 text-xs">
            {language === 'nl'
              ? 'Er zijn geen account- of servergegevens verwijderd.'
              : 'No account or server data was deleted.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function RequestsPanel({ language, verified }: { language: Language; verified: boolean }) {
  const copy = accountTranslations[language];
  const privacy = copy.privacy;
  const queryClient = useQueryClient();
  const [acknowledged, setAcknowledged] = useState<Set<AccountDeletionScope>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);

  const requestsQuery = useGetAccountRequests({ query: { queryKey: getGetAccountRequestsQueryKey(), retry: false } });
  const createMutation = useCreateAccountDeletionRequest();
  const withdrawMutation = useWithdrawAccountRequest();

  const requests = requestsQuery.data?.requests ?? [];
  const openRequest = requests.find((request) => request.status === 'received' || request.status === 'blocked' || request.status === 'in_review');
  const allAcknowledged = DELETION_SCOPES.every((scope) => acknowledged.has(scope));

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetAccountRequestsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAccountMessagesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAccountMeQueryKey() }),
    ]);

  const submit = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({ data: { acknowledgedScopes: DELETION_SCOPES } });
      setAcknowledged(new Set());
      await invalidate();
    } catch (cause) {
      setError(accountErrorMessage(cause, language));
    }
  };

  const withdraw = async (request: AccountRequest) => {
    setError(null);
    setWithdrawingId(request.id);
    try {
      await withdrawMutation.mutateAsync({ id: request.id, data: { expectedVersion: request.version } });
      await invalidate();
    } catch (cause) {
      setError(accountErrorMessage(cause, language));
      await invalidate();
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <section data-testid="account-deletion-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {privacy.scopesTitle}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{privacy.scopesIntro}</p>

      <fieldset className="mt-5" disabled={Boolean(openRequest) || !verified}>
        <legend className="sr-only">{privacy.scopesTitle}</legend>
        <ul className="grid gap-2">
          {DELETION_SCOPES.map((scope) => {
            const checked = acknowledged.has(scope);
            return (
              <li key={scope}>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70">
                  <input
                    type="checkbox"
                    data-testid={`checkbox-scope-${scope}`}
                    checked={checked}
                    onChange={(event) => {
                      const next = new Set(acknowledged);
                      if (event.target.checked) next.add(scope);
                      else next.delete(scope);
                      setAcknowledged(next);
                    }}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span className="font-medium text-foreground">{lookup(privacy, `scope_${scope}`, scope)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div data-testid="deletion-separate-scopes" className="mt-5 rounded-2xl border border-border/60 bg-background/60 p-4">
        <p className="text-sm font-bold text-foreground">{privacy.separateTitle}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
          <li>{privacy.separateRegistration}</li>
          <li>{privacy.separateClerk}</li>
          <li>{privacy.separateSignOut}</li>
          <li>{privacy.separateContributions}</li>
        </ul>
      </div>

      <div className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
        <p className="flex items-start gap-2">
          <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{privacy.soleOwnerNotice}</span>
        </p>
        <p>{privacy.reauthNotice}</p>
        <p>{privacy.noRetention}</p>
      </div>

      {!verified ? (
        <p role="status" data-testid="status-deletion-unverified" className="mt-4 text-sm font-bold text-amber-900">{copy.account.unverifiedBody}</p>
      ) : null}
      {error ? <p role="alert" data-testid="status-deletion-error" className="mt-4 text-sm font-bold text-red-800">{error}</p> : null}
      {requestsQuery.isError ? (
        <p role="alert" data-testid="status-requests-error" className="mt-4 text-sm font-bold text-red-800">{accountErrorMessage(requestsQuery.error, language)}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          data-testid="button-request-deletion"
          disabled={!verified || !allAcknowledged || Boolean(openRequest) || createMutation.isPending}
          onClick={() => void submit()}
        >
          {createMutation.isPending ? privacy.submitting : privacy.submit}
        </Button>
        {!allAcknowledged && !openRequest ? <span className="text-xs text-muted-foreground">{privacy.confirmAll}</span> : null}
      </div>

      <h3 className="mt-8 font-serif text-xl font-semibold text-foreground">{privacy.requestsTitle}</h3>
      {requests.length === 0 ? (
        <p data-testid="status-requests-empty" className="mt-2 text-sm text-muted-foreground">{privacy.requestsEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {requests.map((request) => (
            <li key={request.id} data-testid={`request-${request.id}`} className="py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{lookup(privacy, `requestType_${request.type}`, request.type)}</p>
                  <p data-testid={`request-status-${request.id}`} className="mt-1 text-sm text-foreground">
                    {lookup(privacy, `status_${request.status}`, request.status)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCopy(privacy.submittedOn, { date: formatDate(request.createdAt, language) })}
                    {request.resolvedAt ? ` · ${formatCopy(privacy.resolvedOn, { date: formatDate(request.resolvedAt, language) })}` : ''}
                    {!request.resolvedAt && !request.withdrawnAt && !request.deadlineAt ? ` · ${privacy.noDeadline}` : ''}
                  </p>
                </div>
                {request.status === 'received' || request.status === 'blocked' ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={`button-withdraw-${request.id}`}
                    disabled={withdrawingId === request.id}
                    onClick={() => void withdraw(request)}
                  >
                    {withdrawingId === request.id ? privacy.withdrawing : privacy.withdraw}
                  </Button>
                ) : null}
              </div>
              {request.blocker ? (
                <div data-testid={`request-blocker-${request.id}`} className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-sm font-bold text-amber-900">{privacy.blockerTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900/80">{privacy.blockerBody}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {request.blocker.businesses.map((business) => (
                      <li key={business.businessProfileId} className="flex items-center justify-between gap-3">
                        <span className="font-medium text-foreground">{business.name}</span>
                        <span className={`text-xs font-bold ${business.resolved ? 'text-emerald-700' : 'text-amber-800'}`}>
                          {business.resolved ? privacy.blockerResolved : privacy.blockerOpen}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MessagesPanel({ language }: { language: Language }) {
  const privacy = accountTranslations[language].privacy;
  const messagesQuery = useGetAccountMessages({ query: { queryKey: getGetAccountMessagesQueryKey(), retry: false } });
  const messages = messagesQuery.data?.messages ?? [];

  return (
    <section data-testid="account-messages-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
        <Inbox className="h-4 w-4" aria-hidden="true" />
        {privacy.messagesTitle}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{privacy.messagesIntro}</p>
      {messagesQuery.isError ? (
        <p role="alert" data-testid="status-messages-error" className="mt-4 text-sm font-bold text-red-800">{accountErrorMessage(messagesQuery.error, language)}</p>
      ) : null}
      {messagesQuery.isSuccess && messages.length === 0 ? (
        <p data-testid="status-messages-empty" className="mt-4 text-sm text-muted-foreground">{privacy.messagesEmpty}</p>
      ) : null}
      {messages.length > 0 ? (
        <ul className="mt-4 divide-y divide-border/70">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} language={language} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MessageRow({ message, language }: { message: LifecycleMessage; language: Language }) {
  const privacy = accountTranslations[language].privacy;
  const eventKey = `event_${message.eventCode.replace(/\./g, '_')}`;
  const tone =
    message.status === 'delivered' || message.status === 'accepted'
      ? 'text-emerald-700'
      : message.status === 'failed'
        ? 'text-red-800'
        : 'text-muted-foreground';
  return (
    <li data-testid={`message-${message.id}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-foreground">
          {lookup(privacy, eventKey, message.eventCode)}
          {message.businessName ? <span className="font-medium text-muted-foreground"> · {message.businessName}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(message.createdAt, language)}</p>
      </div>
      <p data-testid={`message-status-${message.id}`} className={`text-sm font-bold ${tone}`}>
        {lookup(privacy, `message_${message.status}`, message.status)}
        {message.status === 'queued' && message.nextRetryAt ? (
          <span className="block text-xs font-medium text-muted-foreground">
            {formatCopy(privacy.retryAt, { date: formatDate(message.nextRetryAt, language) })}
          </span>
        ) : null}
      </p>
    </li>
  );
}

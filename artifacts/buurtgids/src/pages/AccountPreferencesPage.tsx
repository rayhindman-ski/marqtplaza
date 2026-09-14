import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Redirect, useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw } from 'lucide-react';

import {
  getGetAccountMeQueryKey,
  getGetAccountOptionsQueryKey,
  useCompleteAccountOnboarding,
  useGetAccountMe,
  useGetAccountOptions,
  useUpdateAccountPreferences,
  type AccountLocale,
  type AccountMe,
  type AccountOption,
  type ApiError,
} from '@workspace/api-client-react';

import { AccountLoading, AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy, type Language } from '@/lib/i18n';
import { resolveReturnPath, withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

const MAX_SELECTION = 20;
const DRAFT_STORAGE_PREFIX = 'buurtplaza-preferences-draft:';

type Draft = {
  locale: AccountLocale;
  neighborhoodIds: string[];
  interestIds: string[];
};

type Outcome = { kind: 'saved' } | { kind: 'skipped' } | null;

type FieldIssue = { field: string; code: string };

function draftStorageKey(userId: string) {
  return `${DRAFT_STORAGE_PREFIX}${userId}`;
}

function readDraft(userId: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!Array.isArray(parsed.neighborhoodIds) || !Array.isArray(parsed.interestIds)) return null;
    return {
      locale: parsed.locale === 'nl' || parsed.locale === 'en' ? parsed.locale : 'nl',
      neighborhoodIds: parsed.neighborhoodIds.filter((id): id is string => typeof id === 'string'),
      interestIds: parsed.interestIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

function writeDraft(userId: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
    else window.sessionStorage.removeItem(draftStorageKey(userId));
  } catch {
    // Session storage is a convenience for refresh; saving still works without it.
  }
}

function draftFromAccount(me: AccountMe): Draft {
  return {
    locale: me.locale,
    neighborhoodIds: me.preferences?.neighborhoodIds ?? [],
    interestIds: me.preferences?.interestIds ?? [],
  };
}

function toggle(list: string[], id: string, checked: boolean): string[] {
  if (checked) return list.includes(id) || list.length >= MAX_SELECTION ? list : [...list, id];
  return list.filter((item) => item !== id);
}

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

export default function AccountPreferencesPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const auth = useAccountAuth();
  const search = useSearch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const returnPath = useMemo(() => resolveReturnPath(search, ''), [search]);
  const enabled = featureFlags.accounts && auth.isLoaded && auth.isSignedIn;

  const meQuery = useGetAccountMe({
    query: { enabled, queryKey: getGetAccountMeQueryKey(), retry: false, staleTime: 0 },
  });
  const optionsQuery = useGetAccountOptions({
    query: { enabled, queryKey: getGetAccountOptionsQueryKey(), retry: 1, staleTime: 5 * 60_000 },
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [conflict, setConflict] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldIssues, setFieldIssues] = useState<FieldIssue[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const initialisedForUser = useRef<string | null>(null);

  // Seed the draft once per user: a refresh restores the unsaved draft from
  // session storage, otherwise the server state is the starting point.
  useEffect(() => {
    if (!meQuery.data || !auth.userId) return;
    if (initialisedForUser.current === auth.userId) return;
    initialisedForUser.current = auth.userId;
    setDraft(readDraft(auth.userId) ?? draftFromAccount(meQuery.data));
    setExpectedRevision(meQuery.data.preferences?.revision ?? 0);
  }, [meQuery.data, auth.userId]);

  useEffect(() => {
    if (!auth.userId || !draft || outcome) return;
    writeDraft(auth.userId, draft);
  }, [auth.userId, draft, outcome]);

  useEffect(() => {
    if ((errorMessage || conflict || fieldIssues.length > 0) && errorRef.current) {
      errorRef.current.focus();
    }
  }, [errorMessage, conflict, fieldIssues]);

  const updatePreferences = useUpdateAccountPreferences();
  const completeOnboarding = useCompleteAccountOnboarding();

  const applyAccount = useCallback((me: AccountMe) => {
    queryClient.setQueryData(getGetAccountMeQueryKey(), me);
    setExpectedRevision(me.preferences?.revision ?? 0);
  }, [queryClient]);

  const resetFeedback = () => {
    setErrorMessage(null);
    setFieldIssues([]);
    setConflict(false);
  };

  const handleFailure = (error: unknown) => {
    const apiError = apiErrorFrom(error);
    if (apiError?.code === 'VERSION_CONFLICT') {
      setConflict(true);
      if (typeof apiError.expectedVersion === 'number') setExpectedRevision(apiError.expectedVersion);
      return;
    }
    setFieldIssues(apiError?.fieldErrors ?? []);
    setErrorMessage(accountErrorMessage(error, language));
  };

  const finish = (me: AccountMe, kind: 'saved' | 'skipped') => {
    applyAccount(me);
    if (auth.userId) writeDraft(auth.userId, null);
    setOutcome({ kind });
  };

  const onSave = async () => {
    if (!draft || expectedRevision === null) return;
    resetFeedback();
    try {
      let me = await updatePreferences.mutateAsync({ data: { expectedRevision, ...draft } });
      if (!me.onboardingCompleted) me = await completeOnboarding.mutateAsync();
      finish(me, 'saved');
    } catch (error) {
      handleFailure(error);
    }
  };

  const onSkip = async () => {
    resetFeedback();
    try {
      finish(await completeOnboarding.mutateAsync(), 'skipped');
    } catch (error) {
      handleFailure(error);
    }
  };

  const onReloadAfterConflict = async () => {
    const result = await meQuery.refetch();
    if (result.data) {
      setExpectedRevision(result.data.preferences?.revision ?? 0);
      setConflict(false);
    }
  };

  if (!featureFlags.accounts) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={copy.preferences.eyebrow} title={copy.preferences.title} testId="page-account-preferences" headingTestId="heading-account-preferences">
        <AccountUnavailable language={language} />
      </AccountShell>
    );
  }
  if (!auth.isLoaded) return <AccountLoading label={copy.account.loading} />;
  if (!auth.isSignedIn) {
    return <Redirect to={withReturnPath('/sign-in', `/account/voorkeuren${search ? `?${search}` : ''}`)} />;
  }

  const meError = apiErrorFrom(meQuery.error);
  if (meError?.code === 'FEATURE_DISABLED') {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={copy.preferences.eyebrow} title={copy.preferences.title} testId="page-account-preferences" headingTestId="heading-account-preferences">
        <AccountUnavailable language={language} />
      </AccountShell>
    );
  }

  const me = meQuery.data;
  const options = optionsQuery.data;
  const editing = Boolean(me?.onboardingCompleted);
  const busy = updatePreferences.isPending || completeOnboarding.isPending;
  const unverified = me ? !me.capabilities.isVerified : false;

  if (outcome && me) {
    const done = outcome.kind === 'saved' ? copy.preferences.savedTitle : copy.preferences.skippedTitle;
    const body = outcome.kind === 'saved' ? copy.preferences.savedBody : copy.preferences.skippedBody;
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={copy.preferences.eyebrow} title={done} testId="page-account-preferences" headingTestId="heading-account-preferences">
        <section data-testid={`status-preferences-${outcome.kind}`} role="status" className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            {body}
          </p>
          {outcome.kind === 'saved' ? <PreferenceSummary me={me} options={options ?? null} language={language} /> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" data-testid="button-preferences-continue" onClick={() => navigate(returnPath)}>
              {returnPath === '/account' ? copy.preferences.toAccount : copy.preferences.continue}
            </Button>
            {returnPath !== '/account' ? (
              <Link href="/account" className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary">
                {copy.preferences.toAccount}
              </Link>
            ) : null}
          </div>
        </section>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={copy.preferences.eyebrow}
      title={editing ? copy.preferences.editTitle : copy.preferences.title}
      intro={editing ? copy.preferences.editIntro : copy.preferences.intro}
      testId="page-account-preferences"
      headingTestId="heading-account-preferences"
      backHref={editing ? '/account' : '/'}
    >
      {meQuery.isError ? (
        <ErrorBanner ref={errorRef} title={copy.preferences.errorTitle} message={accountErrorMessage(meQuery.error, language)} retryLabel={copy.preferences.retry} onRetry={() => void meQuery.refetch()} />
      ) : null}

      {!me || !draft ? (
        meQuery.isError ? null : (
          <p data-testid="status-preferences-loading" role="status" className="text-sm text-muted-foreground">{copy.preferences.loading}</p>
        )
      ) : (
        <form
          data-testid="form-account-preferences"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
          className="space-y-6"
        >
          {unverified ? (
            <section data-testid="status-preferences-unverified" role="status" className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
              <h2 className="text-base font-bold text-amber-900">{copy.account.unverifiedTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">{copy.account.unverifiedBody}</p>
              <Link href="/account" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">{copy.account.openSecurity}</Link>
            </section>
          ) : null}

          {conflict ? (
            <div ref={errorRef} tabIndex={-1} role="alert" data-testid="status-preferences-conflict" className="rounded-3xl border border-amber-300 bg-amber-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <h2 className="text-base font-bold text-amber-900">{copy.preferences.conflictTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">{copy.preferences.conflictBody}</p>
              <Button type="button" variant="outline" className="mt-3 gap-2" data-testid="button-preferences-reload" onClick={() => void onReloadAfterConflict()}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {copy.preferences.conflictReload}
              </Button>
            </div>
          ) : null}

          {errorMessage ? (
            <div ref={errorRef} tabIndex={-1} role="alert" data-testid="status-preferences-error" className="rounded-3xl border border-red-200 bg-red-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-red-300">
              <h2 className="text-base font-bold text-red-900">{copy.preferences.errorTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-red-900/80">{errorMessage}</p>
              {fieldIssues.length > 0 ? (
                <>
                  <p className="mt-3 text-sm font-bold text-red-900">{copy.preferences.errorSummaryIntro}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-900/80">
                    {fieldIssues.map((issue) => (
                      <li key={`${issue.field}:${issue.code}`}>
                        <span className="font-mono text-xs">{issue.field}</span>{' '}
                        {issue.code in copy.errors ? copy.errors[issue.code as keyof typeof copy.errors] : issue.code}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          <fieldset className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
            <legend className="px-2 text-sm font-extrabold uppercase tracking-[0.12em] text-primary">{copy.preferences.localeLegend}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['nl', 'en'] as const).map((locale) => (
                <label key={locale} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${draft.locale === locale ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>
                  <input
                    type="radio"
                    name="locale"
                    value={locale}
                    data-testid={`radio-locale-${locale}`}
                    checked={draft.locale === locale}
                    onChange={() => setDraft({ ...draft, locale })}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  {locale === 'nl' ? 'Nederlands' : 'English'}
                </label>
              ))}
            </div>
          </fieldset>

          {optionsQuery.isLoading ? (
            <p data-testid="status-options-loading" role="status" className="text-sm text-muted-foreground">{copy.preferences.loading}</p>
          ) : null}
          {optionsQuery.isError ? (
            <ErrorBanner title={copy.preferences.loadError} message={accountErrorMessage(optionsQuery.error, language)} retryLabel={copy.preferences.retry} onRetry={() => void optionsQuery.refetch()} testId="status-options-error" />
          ) : null}

          {options ? (
            <>
              <OptionGroup
                name="neighborhoodIds"
                legend={copy.preferences.neighborhoodsLegend}
                help={copy.preferences.neighborhoodsHelp}
                selectedLabel={formatCopy(copy.preferences.selected, { count: draft.neighborhoodIds.length })}
                clearLabel={copy.preferences.clear}
                options={options.neighborhoods}
                selected={draft.neighborhoodIds}
                language={language}
                onToggle={(id, checked) => setDraft({ ...draft, neighborhoodIds: toggle(draft.neighborhoodIds, id, checked) })}
                onClear={() => setDraft({ ...draft, neighborhoodIds: [] })}
              />
              <OptionGroup
                name="interestIds"
                legend={copy.preferences.interestsLegend}
                help={copy.preferences.interestsHelp}
                selectedLabel={formatCopy(copy.preferences.selected, { count: draft.interestIds.length })}
                clearLabel={copy.preferences.clear}
                options={options.interests}
                selected={draft.interestIds}
                language={language}
                onToggle={(id, checked) => setDraft({ ...draft, interestIds: toggle(draft.interestIds, id, checked) })}
                onClear={() => setDraft({ ...draft, interestIds: [] })}
              />
              <p className="text-xs text-muted-foreground">{formatCopy(copy.preferences.optionsVersion, { version: options.taxonomyVersion })}</p>
            </>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <Button type="submit" data-testid="button-preferences-save" disabled={busy || unverified || !options}>
                {updatePreferences.isPending ? copy.preferences.saving : copy.preferences.save}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" data-testid="button-preferences-cancel" disabled={busy} onClick={() => navigate(returnPath)}>
                  {copy.preferences.cancel}
                </Button>
              ) : (
                <Button type="button" variant="outline" data-testid="button-preferences-skip" disabled={busy || unverified} onClick={() => void onSkip()}>
                  {completeOnboarding.isPending && !updatePreferences.isPending ? copy.preferences.skipping : copy.preferences.skip}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {editing ? copy.preferences.returnNotice : copy.preferences.skipHelp}
            </p>
          </div>
        </form>
      )}
    </AccountShell>
  );
}

type OptionGroupProps = {
  name: string;
  legend: string;
  help: string;
  selectedLabel: string;
  clearLabel: string;
  options: AccountOption[];
  selected: string[];
  language: Language;
  onToggle: (id: string, checked: boolean) => void;
  onClear: () => void;
};

function OptionGroup({ name, legend, help, selectedLabel, clearLabel, options, selected, language, onToggle, onClear }: OptionGroupProps) {
  const known = new Set(options.map((option) => option.id));
  const unknownSelected = selected.filter((id) => !known.has(id));
  const full = selected.length >= MAX_SELECTION;
  return (
    <fieldset data-testid={`group-${name}`} className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
      <legend className="px-2 text-sm font-extrabold uppercase tracking-[0.12em] text-primary">{legend}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{help}</p>
        <p className="text-xs font-bold text-muted-foreground" data-testid={`count-${name}`}>{selectedLabel}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/50'} ${!checked && full ? 'opacity-50' : ''}`}
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                data-testid={`checkbox-${option.id}`}
                checked={checked}
                disabled={!checked && full}
                onChange={(event) => onToggle(option.id, event.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {option.label[language]}
            </label>
          );
        })}
        {unknownSelected.map((id) => (
          <label key={id} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground">
            <input type="checkbox" name={name} value={id} checked onChange={() => onToggle(id, false)} className="h-4 w-4" />
            <span className="font-mono text-xs">{id}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 ? (
        <button type="button" onClick={onClear} className="mt-4 text-xs font-bold text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
          {clearLabel}
        </button>
      ) : null}
    </fieldset>
  );
}

export function PreferenceSummary({ me, options, language }: { me: AccountMe; options: { neighborhoods: AccountOption[]; interests: AccountOption[] } | null; language: Language }) {
  const copy = accountTranslations[language].account;
  const labelFor = (list: AccountOption[] | undefined, id: string) => list?.find((option) => option.id === id)?.label[language] ?? id;
  const preferences = me.preferences;
  const hasChoices = Boolean(preferences && (preferences.neighborhoodIds.length > 0 || preferences.interestIds.length > 0));
  return (
    <dl data-testid="preference-summary" className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="font-bold text-foreground">{copy.summaryLocale}</dt>
        <dd data-testid="summary-locale" className="mt-1 text-muted-foreground">{me.locale === 'nl' ? 'Nederlands' : 'English'}</dd>
      </div>
      <div>
        <dt className="font-bold text-foreground">{copy.summaryNeighborhoods}</dt>
        <dd data-testid="summary-neighborhoods" className="mt-1 text-muted-foreground">
          {preferences && preferences.neighborhoodIds.length > 0 ? preferences.neighborhoodIds.map((id) => labelFor(options?.neighborhoods, id)).join(', ') : '—'}
        </dd>
      </div>
      <div>
        <dt className="font-bold text-foreground">{copy.summaryInterests}</dt>
        <dd data-testid="summary-interests" className="mt-1 text-muted-foreground">
          {preferences && preferences.interestIds.length > 0 ? preferences.interestIds.map((id) => labelFor(options?.interests, id)).join(', ') : '—'}
        </dd>
      </div>
      {!hasChoices ? <div data-testid="summary-none" className="text-muted-foreground sm:col-span-3">{copy.summaryNone}</div> : null}
    </dl>
  );
}


type ErrorBannerProps = { title: string; message: string; retryLabel: string; onRetry: () => void; testId?: string };

const ErrorBanner = forwardRef<HTMLDivElement, ErrorBannerProps>(function ErrorBanner({ title, message, retryLabel, onRetry, testId = 'status-account-error' }, ref) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" data-testid={testId} className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-red-300">
      <h2 className="text-base font-bold text-red-900">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-red-900/80">{message}</p>
      <Button type="button" variant="outline" className="mt-3" data-testid="button-account-retry" onClick={onRetry}>{retryLabel}</Button>
    </div>
  );
});

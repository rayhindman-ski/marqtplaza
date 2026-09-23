import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

import { LANGUAGE_OPTIONS, accountTranslations, type Language } from '@/lib/i18n';

type AccountShellProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  testId: string;
  headingTestId: string;
  backHref?: string;
  children: ReactNode;
};

/** The NL/EN switch shared by every account-area screen, including the Clerk sign-in/sign-up pages. */
export function LanguageToggle({ language, onLanguageChange }: Pick<AccountShellProps, 'language' | 'onLanguageChange'>) {
  const copy = accountTranslations[language];
  return (
    <div role="group" aria-label={copy.languageLabel} className="inline-flex rounded-full border border-border bg-card p-1 text-xs font-bold">
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`button-language-${option.value}`}
          aria-pressed={language === option.value}
          onClick={() => onLanguageChange(option.value)}
          className={`rounded-full px-3 py-1.5 transition-colors ${language === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AccountShell({
  language,
  onLanguageChange,
  eyebrow,
  title,
  intro,
  actions,
  testId,
  headingTestId,
  backHref = '/',
  children,
}: AccountShellProps) {
  const copy = accountTranslations[language];
  return (
    <main data-testid={testId} className="min-h-[100dvh] bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <Link href={backHref} data-testid="link-account-back" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.back}
            </Link>
            <LanguageToggle language={language} onLanguageChange={onLanguageChange} />
          </div>
          <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 data-testid={headingTestId} className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">{title}</h1>
              {intro ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</p> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function AccountUnavailable({ language }: { language: Language }) {
  const copy = accountTranslations[language].account;
  return (
    <section data-testid="status-account-unavailable" role="status" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      <h2 className="font-serif text-2xl font-semibold text-foreground">{copy.unavailableTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.unavailableBody}</p>
      <Link href="/" className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
        {accountTranslations[language].back}
      </Link>
    </section>
  );
}

export function AccountLoading({ label }: { label: string }) {
  return (
    <main data-testid="status-account-loading" aria-busy="true" className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-pulse space-y-4" aria-label={label}>
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-5 w-72 rounded bg-muted" />
        <div className="h-96 rounded-3xl bg-muted" />
      </div>
    </main>
  );
}

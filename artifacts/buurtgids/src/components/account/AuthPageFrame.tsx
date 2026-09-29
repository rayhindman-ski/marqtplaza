import type { ReactNode } from 'react';
import type { Language } from '@/lib/i18n';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { LanguageToggle } from './AccountShell';
import { accountTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';

/** Shared localized provider frame for sign-in, sign-up and verified e-mail changes. */
type AuthPageFrameProps = {
  testId: string;
  children: ReactNode;
  /** When the page owns the language state, pass it so the toggle and the page stay in sync. */
  language?: Language;
  onLanguageChange?: (language: Language) => void;
};

export function AuthPageFrame({ testId, children, language: ownedLanguage, onLanguageChange }: AuthPageFrameProps) {
  const [localLanguage, setLocalLanguage] = useAppLanguage();
  const language = ownedLanguage ?? localLanguage;
  const setLanguage = onLanguageChange ?? setLocalLanguage;
  const copy = accountTranslations[language];
  return (
    <main data-testid={testId} className="flex min-h-[100dvh] flex-col bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Link href="/" data-testid="link-account-back" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {copy.back}
        </Link>
        <LanguageToggle language={language} onLanguageChange={setLanguage} />
      </div>
      <div className="flex flex-1 items-center justify-center py-8">{children}</div>
    </main>
  );
}
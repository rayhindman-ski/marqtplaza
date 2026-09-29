import { Link } from 'wouter';
import { withReturnPath } from './returnPath';
import { accountTranslations, type Language } from './i18n';

/** API step-up errors cannot trigger Clerk's SDK reverification hook automatically;
 * a new verified session supplies fresh factor-verification age. */
export function isRecentAuthError(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null)?.data?.code === 'RECENT_AUTH_REQUIRED';
}

export function RecentAuthPrompt({ language, returnPath }: { language: Language; returnPath: string }) {
  const copy = accountTranslations[language].recentAuth;
  return <div role="alert" data-testid="prompt-recent-auth" className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
    <p>{copy.description}</p>
    <Link href={withReturnPath('/sign-in', returnPath)} className="mt-3 inline-block font-bold text-primary underline">{copy.action}</Link>
  </div>;
}
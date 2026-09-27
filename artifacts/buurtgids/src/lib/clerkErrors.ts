import { isClerkAPIResponseError } from '@clerk/react/errors';

import { accountTranslations, type Language } from './i18n';

type SecurityCopy = (typeof accountTranslations)[Language]['security'];

/**
 * Maps identity-provider failures to the app's own NL/EN copy. Only the code
 * is inspected; the provider's message text is never shown, so no English
 * fallback can leak into the Dutch screens (L10N-003) and no field value is
 * echoed back.
 */
export function clerkErrorCode(error: unknown): string | null {
  if (isClerkAPIResponseError(error)) return error.errors[0]?.code ?? null;
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

/** Field the provider blamed, when it names one (`param_name`, e.g. `password`, `code`). */
export function clerkErrorField(error: unknown): string | null {
  if (isClerkAPIResponseError(error)) {
    const meta = error.errors[0]?.meta as { paramName?: string } | undefined;
    return meta?.paramName ?? null;
  }
  return null;
}

export function securityErrorMessage(error: unknown, language: Language): string {
  const copy: SecurityCopy = accountTranslations[language].security;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return copy.error_offline;
  const code = clerkErrorCode(error);
  if (code) {
    const key = `error_${code}` as keyof SecurityCopy;
    if (key in copy) return copy[key];
  }
  if (error instanceof TypeError || code === 'network_error') return copy.error_offline;
  return copy.error_generic;
}

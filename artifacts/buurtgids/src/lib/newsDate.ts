import { format, isValid, parseISO, type Locale } from 'date-fns';
import type { Language } from './i18n';

export function formatNewsPublishedAt(
  value: string | null | undefined,
  language: Language,
  pattern: string,
  locale: Locale,
): string {
  if (!value) return language === 'nl' ? 'Datum onbekend' : 'Date unknown';
  const parsed = parseISO(value);
  return isValid(parsed)
    ? format(parsed, pattern, { locale })
    : (language === 'nl' ? 'Datum onbekend' : 'Date unknown');
}
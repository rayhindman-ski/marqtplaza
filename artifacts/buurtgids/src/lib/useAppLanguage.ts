import { useEffect, useState } from 'react';

import type { Language } from './i18n';

export const LANGUAGE_STORAGE_KEY = 'buurtplaza-language';

export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'nl' ? 'nl' : 'en';
}

/**
 * The app-wide UI language shared by every page. Switching it only changes the
 * copy; form drafts owned by the calling page are untouched.
 */
export function useAppLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  return [language, setLanguage];
}

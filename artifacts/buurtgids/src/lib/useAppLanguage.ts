import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Language } from './i18n';

export const LANGUAGE_STORAGE_KEY = 'buurtplaza-language';
const LANGUAGE_CHANGE_EVENT = 'buurtplaza-language-change';

export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'nl' ? 'nl' : 'en';
}

function readRequestedLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  const locale = new URLSearchParams(window.location.search).get('locale');
  return locale === 'nl' || locale === 'en' ? locale : null;
}

/**
 * Persist the UI language and notify same-tab subscribers (e.g. the Clerk
 * provider, which lives above every page and cannot see page-level state).
 */
export function persistLanguage(language: Language): void {
  if (typeof window === 'undefined') return;
  const previous = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
  if (previous !== language) {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT));
  }
}

function subscribeToLanguage(onChange: () => void): () => void {
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Read-only view of the stored language that re-renders whenever any page
 * switches it. Use this in providers that sit above the page owning the toggle.
 */
export function useStoredLanguage(): Language {
  return useSyncExternalStore(subscribeToLanguage, readStoredLanguage, () => 'en');
}

/**
 * The app-wide UI language shared by every page. Switching it only changes the
 * copy; form drafts owned by the calling page are untouched.
 */
export function useAppLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(
    () => readRequestedLanguage() ?? readStoredLanguage(),
  );

  useEffect(() => {
    persistLanguage(language);
  }, [language]);

  return [language, setLanguage];
}

export type BrowserDataCategory = 'discovery' | 'saved' | 'language' | 'drafts';

const LOCAL_STORAGE_KEYS: Record<Exclude<BrowserDataCategory, 'drafts'>, string[]> = {
  discovery: [
    'buurtplaza-discovery-live-mode',
    'buurtplaza-anonymous-id',
    'buurtplaza-user-role',
    'buurtplaza-onboarding-complete',
  ],
  saved: [
    'buurtgids_saved_places',
    'buurtgids_saved_event_alerts',
  ],
  language: ['buurtplaza-language'],
};

const SESSION_STORAGE_PREFIXES: Record<'drafts', string[]> = {
  drafts: ['buurtplaza-preferences-draft:'],
};

export function clearBrowserData(categories: BrowserDataCategory[]): BrowserDataCategory[] {
  const cleared: BrowserDataCategory[] = [];

  for (const category of categories) {
    if (category === 'drafts') {
      const matchingKeys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
        window.sessionStorage.key(index),
      ).filter((key): key is string =>
        Boolean(key && SESSION_STORAGE_PREFIXES.drafts.some((prefix) => key.startsWith(prefix))),
      );
      for (const key of matchingKeys) window.sessionStorage.removeItem(key);
      cleared.push(category);
      continue;
    }

    for (const key of LOCAL_STORAGE_KEYS[category]) window.localStorage.removeItem(key);
    cleared.push(category);
  }

  return cleared;
}
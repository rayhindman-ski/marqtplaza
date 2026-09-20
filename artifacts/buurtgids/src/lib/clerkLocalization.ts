import { enUS, nlNL } from '@clerk/localizations';

import type { Language } from './i18n';

type ClerkLocalization = typeof nlNL;

/**
 * Error keys that @clerk/localizations leaves untranslated for nl-NL. Without an
 * override Clerk falls back to the English server message, so the expired-link
 * and invalid-link cards would stay English while the rest of the app is Dutch.
 */
const nlNLErrorOverrides: NonNullable<ClerkLocalization['unstable__errors']> = {
  ticket_expired_code: 'Deze link is verlopen. Begin opnieuw of vraag een nieuwe link aan.',
  ticket_invalid_code: 'Deze link is niet meer geldig of al gebruikt. Begin opnieuw of vraag een nieuwe link aan.',
  // Clerk looks error messages up by server error code, but this code is missing from
  // the typed localization table, so it is added untyped here (verified with a live run).
  ...({
    sign_in_token_already_used_code: 'Deze inloglink is al gebruikt. Elke link werkt maar één keer. Log opnieuw in of vraag een nieuwe link aan.',
  } as Record<string, string>),
};

const enUSErrorOverrides = {
  sign_in_token_already_used_code: 'This sign-in link has already been used. Each link can only be used once. Please sign in again or request a new link.',
} as Record<string, string>;

const nlNLWithOverrides: ClerkLocalization = {
  ...nlNL,
  unstable__errors: {
    ...nlNL.unstable__errors,
    ...nlNLErrorOverrides,
  },
};

const enUSWithOverrides: ClerkLocalization = {
  ...enUS,
  unstable__errors: {
    ...enUS.unstable__errors,
    ...enUSErrorOverrides,
  },
};

export function clerkLocalizationFor(language: Language): ClerkLocalization {
  return language === 'nl' ? nlNLWithOverrides : enUSWithOverrides;
}

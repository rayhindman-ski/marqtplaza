import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { enUS, nlNL } from '@clerk/localizations';

import { clerkLocalizationFor } from './clerkLocalization';

const overriddenErrorKeys = [
  'ticket_expired_code',
  'ticket_invalid_code',
  'sign_in_token_already_used_code',
] as const;

function errorMessage(
  localization: { unstable__errors?: Record<string, string> },
  key: string,
): string | undefined {
  return localization.unstable__errors?.[key];
}

describe('Clerk localization overrides', () => {
  it('keeps every overridden sign-in error available in Dutch and English', () => {
    const nl = clerkLocalizationFor('nl');
    const en = clerkLocalizationFor('en');

    for (const key of overriddenErrorKeys) {
      assert.match(errorMessage(nl, key) ?? '', /\S/, `${key} must have Dutch copy`);
      assert.match(errorMessage(en, key) ?? '', /\S/, `${key} must have English copy`);
    }
  });

  it('only overrides Dutch keys that Clerk still leaves untranslated', () => {
    for (const key of overriddenErrorKeys) {
      const upstreamDutch = errorMessage(nlNL, key);
      const upstreamEnglish = errorMessage(enUS, key);

      assert.ok(
        !upstreamDutch || upstreamDutch === upstreamEnglish,
        `${key} now has its own Dutch Clerk translation; drop the local override`,
      );
    }
  });
});
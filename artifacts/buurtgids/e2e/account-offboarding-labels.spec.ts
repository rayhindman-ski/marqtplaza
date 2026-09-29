import { expect, test } from '@playwright/test';
import { accountDeletionCategoryCopy, accountOffboardingLabels } from '../src/lib/i18n';

test('OFF-001: independent account actions have distinct NL/EN labels', () => {
  const actions = ['signOut', 'revokeSessions', 'withdrawConsent', 'clearPreferences', 'clearLastSearch', 'exportData', 'deleteAccount'] as const;
  for (const language of ['nl', 'en'] as const) {
    const labels = actions.map(action => accountOffboardingLabels[language][action]);
    expect(labels.every(label => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(actions.length);
    expect(Object.keys(accountDeletionCategoryCopy[language].labels)).toEqual(
      Object.keys(accountDeletionCategoryCopy.nl.labels),
    );
    for (const [id, label] of Object.entries(accountDeletionCategoryCopy[language].labels)) {
      expect(label).toBeTruthy();
      expect(label).not.toBe(id);
      expect(label).not.toContain('_');
    }
  }
});
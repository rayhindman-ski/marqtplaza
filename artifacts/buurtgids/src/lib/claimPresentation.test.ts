import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { claimPresentation } from './claimPresentation';
import { businessIntakeTranslations } from './i18n';

const persistedStatuses = [
  'draft', 'pending', 'submitted', 'changes_requested', 'approved', 'rejected', 'disputed', 'withdrawn',
] as const;

describe('claim presentation after an intake flag rollback', () => {
  it('keeps every persisted status truthful while the flag is off', () => {
    for (const language of ['nl', 'en'] as const) {
      const seen = new Set<string>();
      for (const status of persistedStatuses) {
        const view = claimPresentation({ status, nextAction: 'none' }, language, false);
        assert.equal(view.label, businessIntakeTranslations[language].status[status]);
        assert.ok(!seen.has(view.label), `${language} label for ${status} must be distinct`);
        seen.add(view.label);
        assert.equal(view.canContinue, false, 'gated actions are hidden while the flag is off');
        assert.equal(view.canWithdraw, false);
      }
      assert.notEqual(
        claimPresentation({ status: 'draft' }, language, false).label,
        claimPresentation({ status: 'rejected' }, language, false).label,
        'a draft is never shown as rejected',
      );
    }
  });

  it('offers only the permitted actions while the flag is on', () => {
    assert.deepEqual(
      persistedStatuses.map((status) => [status, claimPresentation({ status }, 'nl', true).canContinue]),
      persistedStatuses.map((status) => [status, status === 'draft' || status === 'changes_requested']),
    );
    assert.deepEqual(
      persistedStatuses.map((status) => [status, claimPresentation({ status }, 'nl', true).canWithdraw]),
      persistedStatuses.map((status) => [status, ['draft', 'pending', 'submitted', 'changes_requested', 'disputed'].includes(status)]),
    );
  });

  it('describes the next step from the server, never from the flag', () => {
    const view = claimPresentation({ status: 'changes_requested', nextAction: 'provide_changes' }, 'en', false);
    assert.equal(view.nextAction, businessIntakeTranslations.en.nextAction.provide_changes);
    assert.equal(view.tone, 'progress');
    assert.equal(claimPresentation({ status: 'disputed' }, 'en', false).tone, 'danger');
    assert.equal(claimPresentation({ status: 'withdrawn' }, 'en', false).tone, 'muted');
  });
});

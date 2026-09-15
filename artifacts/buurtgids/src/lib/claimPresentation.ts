import type { ClaimNextAction, ClaimStatus } from '@workspace/api-client-react';

import { businessIntakeTranslations, type Language } from './i18n';

export type ClaimTone = 'success' | 'danger' | 'muted' | 'progress';

export type ClaimPresentation = {
  /** Localized, truthful status label — never collapses new statuses into "rejected". */
  label: string;
  nextAction: string;
  tone: ClaimTone;
  /** Gated actions: only offered while the intake flag is on. */
  canContinue: boolean;
  canWithdraw: boolean;
};

const WITHDRAWABLE: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>([
  'draft', 'pending', 'submitted', 'changes_requested', 'disputed',
]);

export function claimTone(status: ClaimStatus): ClaimTone {
  if (status === 'approved') return 'success';
  if (status === 'rejected' || status === 'disputed') return 'danger';
  if (status === 'withdrawn') return 'muted';
  return 'progress';
}

/**
 * Presentation for a claim card in the business workspace. The status and
 * reviewer next step are rendered truthfully regardless of the intake flag so
 * a rollback never misrepresents persisted drafts, submissions, disputes, or
 * withdrawals; only the actions that call gated endpoints depend on the flag.
 */
export function claimPresentation(
  claim: { status: ClaimStatus; nextAction?: ClaimNextAction | null },
  language: Language,
  intakeEnabled: boolean,
): ClaimPresentation {
  const copy = businessIntakeTranslations[language];
  const status = claim.status;
  return {
    label: copy.status[status],
    nextAction: copy.nextAction[claim.nextAction ?? 'none'],
    tone: claimTone(status),
    canContinue: intakeEnabled && (status === 'draft' || status === 'changes_requested'),
    canWithdraw: intakeEnabled && WITHDRAWABLE.has(status),
  };
}

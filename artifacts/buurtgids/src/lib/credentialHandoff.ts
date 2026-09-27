/**
 * Credential handoff between the consumer registration link and the identity
 * provider's password step (v0.5.2, BCRED-001).
 *
 * After the single-use registration link is consumed, the API answers once
 * with the verified address. It is kept in `sessionStorage` (tab-scoped, never
 * in the URL, never in `localStorage`) only long enough for the sign-up card to
 * prefill it, and is cleared as soon as a session exists. No password or token
 * is ever stored here.
 */
const HANDOFF_KEY = 'buurtplaza.credential-handoff';

export type CredentialHandoff = { email: string };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeCredentialHandoff(handoff: CredentialHandoff): void {
  storage()?.setItem(HANDOFF_KEY, JSON.stringify({ email: handoff.email }));
}

/** Reads without clearing so a reload of the sign-up card keeps the prefill. */
export function peekCredentialHandoff(): CredentialHandoff | null {
  const raw = storage()?.getItem(HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { email?: unknown };
    return typeof parsed.email === 'string' && parsed.email.length > 0 ? { email: parsed.email } : null;
  } catch {
    return null;
  }
}

export function clearCredentialHandoff(): void {
  storage()?.removeItem(HANDOFF_KEY);
}

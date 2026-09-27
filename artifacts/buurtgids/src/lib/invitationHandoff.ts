/**
 * Invitation handoff across sign-in / registration (v0.5.2, BMEM-002).
 *
 * The invitation token must never be persisted server-side (the registration
 * row stores only the bare `/account/uitnodiging` return path) and must not
 * ride along in sign-in redirect URLs. So when a signed-out visitor opens an
 * invitation link and goes to sign in or register, the token is parked in
 * `localStorage` — not `sessionStorage`, because e-mail registration finishes
 * in a fresh tab — and re-attached when the invitation page is opened again
 * without a token. The token is single-use, bound to the invited address and
 * expires with the invitation, so a parked copy cannot be used by anyone who
 * cannot also sign in to that account. It is cleared on accept and after the
 * invitation lifetime.
 */
const HANDOFF_KEY = 'buurtplaza.invitation-handoff';
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storeInvitationHandoff(token: string): void {
  if (!token) return;
  storage()?.setItem(HANDOFF_KEY, JSON.stringify({ token, storedAt: Date.now() }));
}

export function peekInvitationHandoff(): string | null {
  const raw = storage()?.getItem(HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; storedAt?: unknown };
    if (typeof parsed.token !== 'string' || typeof parsed.storedAt !== 'number' || Date.now() - parsed.storedAt > MAX_AGE_MS) {
      clearInvitationHandoff();
      return null;
    }
    return parsed.token;
  } catch {
    clearInvitationHandoff();
    return null;
  }
}

export function clearInvitationHandoff(): void {
  storage()?.removeItem(HANDOFF_KEY);
}

import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * v0.5.2 business membership (BMEM-001…006): the account home lists
 * businesses, the team page invites/revokes/transfers/leaves against a
 * stateful mock that mirrors the server's rules (last-owner refusal, owner-only
 * invitations), and the invitation landing page keeps the token out of every
 * write until the signed-in person accepts. All copy is Dutch.
 */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Member = { id: number; role: 'owner' | 'manager'; displayName: string | null; isSelf: boolean; joinedAt: string };
type Invitation = { id: number; email: string; role: 'owner' | 'manager'; status: string; expiresAt: string; createdAt: string };

function createState() {
  return {
    viewerRole: 'owner' as 'owner' | 'manager',
    closed: false,
    members: [
      { id: 1, role: 'owner', displayName: 'Anna Eigenaar', isSelf: true, joinedAt: '2026-09-01T10:00:00.000Z' },
      { id: 2, role: 'manager', displayName: 'Bram Beheerder', isSelf: false, joinedAt: '2026-09-05T10:00:00.000Z' },
    ] as Member[],
    invitations: [] as Invitation[],
    writes: [] as { method: string; path: string; body: unknown }[],
  };
}

async function signIn(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: 'user-e2e' };
    if (!localStorage.getItem('buurtplaza-language')) localStorage.setItem('buurtplaza-language', 'nl');
  });
}

async function stubApi(page: Page, state: ReturnType<typeof createState>) {
  const me = () => ({
    id: 7, status: 'active', role: 'consumer', locale: 'nl', onboardingCompleted: true, onboardingCompletedAt: '2026-09-01T10:00:00.000Z',
    capabilities: { isVerified: true, canParticipate: true, canReview: false, canModerate: false },
    hasResearchRegistration: false, businessMembershipCount: 1, preferences: null, createdAt: '2026-09-01T10:00:00.000Z',
    businesses: [{ id: 41, name: 'Kapper Centrum', slug: 'kapper-centrum', role: state.viewerRole, status: state.closed ? 'closed' : 'published' }],
  });
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/account/me')) return json(route, me());
    if (path.endsWith('/account/options')) return json(route, { neighborhoods: [], interests: [] });
    if (path.endsWith('/account/consents')) return json(route, { currentNoticeVersion: '2026-09', purposes: [], current: [], history: [] });
    return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
  });
  await page.route('**/api/registration', (route) => json(route, { registered: false, registration: null }));
  await page.route(/\/api\/businesses\/\d+\/(members|invitations|ownership|close)(\/.*)?$/, (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = method === 'GET' ? undefined : request.postDataJSON();
    if (method !== 'GET') state.writes.push({ method, path, body });
    if (!path.includes('/businesses/41/')) return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
    if (method === 'GET' && path.endsWith('/members')) {
      return json(route, { businessId: 41, viewerRole: state.viewerRole, members: state.members, invitations: state.viewerRole === 'owner' ? state.invitations : [] });
    }
    if (state.viewerRole !== 'owner' && !(method === 'DELETE' && /\/members\/1$/.test(path))) {
      return json(route, { code: 'FORBIDDEN', messageKey: 'errors.forbidden', correlationId: 'e2e' }, 403);
    }
    if (method === 'POST' && path.endsWith('/invitations')) {
      if (state.invitations.some((entry) => entry.email === body.email && entry.status === 'open')) {
        return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', fieldErrors: [{ field: 'email', code: 'already_invited' }] }, 409);
      }
      const invitation: Invitation = { id: state.invitations.length + 1, email: body.email, role: body.role, status: 'open', expiresAt: '2026-10-04T10:00:00.000Z', createdAt: '2026-09-27T10:00:00.000Z' };
      state.invitations.unshift(invitation);
      return json(route, { id: invitation.id, role: invitation.role, status: 'open', expiresAt: invitation.expiresAt }, 201);
    }
    const revoke = path.match(/\/invitations\/(\d+)$/);
    if (method === 'DELETE' && revoke) {
      const invitation = state.invitations.find((entry) => entry.id === Number(revoke[1]));
      if (invitation) invitation.status = 'revoked';
      return json(route, { id: Number(revoke[1]), status: 'revoked' });
    }
    const memberMatch = path.match(/\/members\/(\d+)$/);
    if (memberMatch) {
      const member = state.members.find((entry) => entry.id === Number(memberMatch[1]));
      if (!member) return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
      const owners = state.members.filter((entry) => entry.role === 'owner').length;
      if (method === 'PATCH') {
        if (member.role === 'owner' && body.role !== 'owner' && owners <= 1) {
          return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', fieldErrors: [{ field: 'role', code: 'last_owner' }] }, 409);
        }
        member.role = body.role;
        return json(route, { id: member.id, role: member.role });
      }
      if (method === 'DELETE') {
        if (member.role === 'owner' && owners <= 1) {
          return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', fieldErrors: [{ field: 'role', code: 'last_owner' }] }, 409);
        }
        state.members = state.members.filter((entry) => entry.id !== member.id);
        return json(route, { id: member.id, removed: true, left: member.isSelf });
      }
    }
    if (method === 'POST' && path.endsWith('/ownership/transfer')) {
      const target = state.members.find((entry) => entry.id === body.memberId)!;
      target.role = 'owner';
      state.members.find((entry) => entry.isSelf)!.role = 'manager';
      state.viewerRole = 'manager';
      return json(route, { businessId: 41, viewerRole: 'manager' });
    }
    if (method === 'POST' && path.endsWith('/close')) {
      if (body.confirm !== true) return json(route, { code: 'VALIDATION_FAILED', messageKey: 'errors.validation_failed', correlationId: 'e2e', fieldErrors: [{ field: 'confirm', code: 'required' }] }, 400);
      state.closed = true;
      return json(route, { businessId: 41, publicationStatus: 'unpublished', closed: true });
    }
    return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
  });
}

test.describe('business membership (v0.5.2)', () => {
  test('account home lists the business with role and status and links to the team', async ({ page }) => {
    const state = createState();
    await signIn(page);
    await stubApi(page, state);
    await page.goto('/account?e2eAccountAuth=1');
    const row = page.getByTestId('account-business-41');
    await expect(row).toContainText('Kapper Centrum');
    await expect(row).toContainText('Eigenaar');
    await expect(page.getByTestId('account-business-status-41')).toHaveText('Gepubliceerd');
    await page.getByTestId('link-account-business-team-41').click();
    await expect(page.getByTestId('heading-business-members')).toHaveText('Team van Kapper Centrum');
    await expect(page.getByTestId('member-role-1')).toHaveText('Eigenaar');
    await expect(page.getByTestId('member-role-2')).toHaveText('Beheerder');
  });

  test('owner invites (once), revokes, hits the last-owner guard, transfers and then may leave', async ({ page }) => {
    const state = createState();
    await signIn(page);
    await stubApi(page, state);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/account/bedrijf/41/team?e2eAccountAuth=1');
    await expect(page.getByTestId('status-no-invitations')).toHaveText('Geen openstaande uitnodigingen.');

    await page.getByTestId('input-invite-email').fill('nieuw@example.com');
    await page.getByTestId('select-invite-role').selectOption('manager');
    await page.getByTestId('button-invite-send').click();
    await expect(page.getByTestId('status-members-action-ok')).toHaveText('Uitnodiging verstuurd naar nieuw@example.com.');
    await expect(page.getByTestId('invitation-status-1')).toContainText('Open tot');
    expect(state.writes.at(-1)).toEqual({ method: 'POST', path: '/api/businesses/41/invitations', body: { email: 'nieuw@example.com', role: 'manager' } });

    await page.getByTestId('input-invite-email').fill('nieuw@example.com');
    await page.getByTestId('button-invite-send').click();
    await expect(page.getByTestId('status-members-action-error')).toHaveText('Er staat al een uitnodiging open voor dit adres.');

    await page.getByTestId('button-invitation-revoke-1').click();
    await expect(page.getByTestId('invitation-status-1')).toHaveText('Ingetrokken');

    // Demoting or leaving as the only owner is refused with the server's reason.
    await page.getByTestId('button-member-leave').click();
    await expect(page.getByTestId('status-members-action-error')).toHaveText('Een bedrijf houdt altijd minstens één eigenaar. Draag eerst het eigendom over.');

    await page.getByTestId('button-member-transfer-2').click();
    await expect(page.getByTestId('member-role-2')).toHaveText('Eigenaar');
    await expect(page.getByTestId('member-role-1')).toHaveText('Beheerder');
    // As a manager: no invitation form, no owner buttons, note shown.
    await expect(page.getByTestId('invitations-panel')).toHaveCount(0);
    await expect(page.getByTestId('button-member-remove-2')).toHaveCount(0);
    await expect(page.getByText('Alleen eigenaren zien uitnodigingen en kunnen het team wijzigen.')).toBeVisible();

    await page.getByTestId('button-member-leave').click();
    await expect(page.getByTestId('page-account')).toBeVisible();
    expect(state.writes.at(-1)).toEqual({ method: 'DELETE', path: '/api/businesses/41/members/1', body: null });
    expect(state.members.map((member) => member.id)).toEqual([2]);
  });

  test('close asks for one explicit confirmation, then the account shows the business as closed', async ({ page }) => {
    const state = createState();
    await signIn(page);
    await stubApi(page, state);
    await page.goto('/account/bedrijf/41/team?e2eAccountAuth=1');
    await page.getByTestId('link-business-close').click();
    await expect(page.getByTestId('heading-business-close')).toHaveText('Kapper Centrum sluiten');
    await expect(page.getByTestId('button-close-business')).toBeDisabled();
    await page.getByTestId('checkbox-close-confirm').check();
    await page.getByTestId('button-close-business').click();
    await expect(page.getByTestId('status-business-closed-done')).toContainText('Kapper Centrum is gesloten.');
    expect(state.writes).toEqual([{ method: 'POST', path: '/api/businesses/41/close', body: { confirm: true } }]);
    await page.getByTestId('link-close-back').click();
    await expect(page.getByTestId('account-business-status-41')).toHaveText('Gesloten');
  });

  test('invitation page: token stays unused until accept; rejections explain; sign-in keeps the return path', async ({ page }) => {
    const accepts: unknown[] = [];
    await page.addInitScript(() => localStorage.setItem('buurtplaza-language', 'nl'));
    await page.route('**/api/business-invitations/accept', (route) => {
      const body = route.request().postDataJSON();
      accepts.push(body);
      if (body.token === 'wrong-address-token') return json(route, { accepted: false, reason: 'email_mismatch' }, 403);
      if (body.token === 'stale-token') return json(route, { accepted: false, reason: 'expired' }, 409);
      return json(route, { accepted: true, businessId: 41, businessName: 'Kapper Centrum', role: 'manager' });
    });
    // Signed out: no write happens; both links return to the bare invitation page and the
    // token is parked in the browser instead of travelling through sign-in or registration URLs.
    await page.goto('/account/uitnodiging?token=fresh-token');
    await expect(page.getByTestId('heading-business-invitation')).toHaveText('Uitnodiging voor een bedrijfsteam');
    await expect(page.getByTestId('link-invitation-sign-in')).toHaveAttribute('href', /\/sign-in\?terug=%2Faccount%2Fuitnodiging$/);
    await expect(page.getByTestId('link-invitation-register')).toHaveAttribute('href', /\/account\/register\?terug=%2Faccount%2Fuitnodiging$/);
    expect(accepts).toEqual([]);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('buurtplaza.invitation-handoff') ?? 'null')?.token ?? null))
      .toBe('fresh-token');
    // The registration form sends only the bare return path to the server.
    const registrations: unknown[] = [];
    await page.route('**/api/consumer-registration', (route) => {
      registrations.push(route.request().postDataJSON());
      return json(route, { status: 'queued' }, 202);
    });
    await page.getByTestId('link-invitation-register').click();
    await expect(page).toHaveURL(/\/account\/register\?terug=%2Faccount%2Fuitnodiging$/);

    await signIn(page);
    // Back on the bare page after sign-in: the parked token is re-attached and used only on accept.
    await page.goto('/account/uitnodiging?e2eAccountAuth=1');
    await expect(page.getByTestId('button-invitation-accept')).toBeVisible();
    expect(accepts).toEqual([]);
    expect(registrations).toEqual([]);
    await page.goto('/account/uitnodiging?token=wrong-address-token&e2eAccountAuth=1');
    expect(accepts).toEqual([]);
    await page.getByTestId('button-invitation-accept').click();
    await expect(page.getByTestId('status-invitation-error')).toContainText('Deze uitnodiging hoort bij een ander e-mailadres.');
    await page.goto('/account/uitnodiging?token=stale-token&e2eAccountAuth=1');
    await page.getByTestId('button-invitation-accept').click();
    await expect(page.getByTestId('status-invitation-error')).toHaveText('Deze uitnodiging is verlopen. Vraag de eigenaar om een nieuwe uitnodiging.');
    await page.goto('/account/uitnodiging?token=fresh-token&e2eAccountAuth=1');
    await page.getByTestId('button-invitation-accept').click();
    await expect(page.getByTestId('status-invitation-accepted')).toContainText('Je bent nu beheerder van Kapper Centrum.');
    await expect(page.getByTestId('link-invitation-team')).toHaveAttribute('href', /\/account\/bedrijf\/41\/team$/);
    expect(accepts).toEqual([{ token: 'wrong-address-token' }, { token: 'stale-token' }, { token: 'fresh-token' }]);
    // Accepting clears the parked token; the bare page now reports a missing invitation.
    await page.goto('/account/uitnodiging?e2eAccountAuth=1');
    await expect(page.getByTestId('status-invitation-missing')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('buurtplaza.invitation-handoff'))).toBeNull();
  });

  test('journey: invitation → e-mail registration → password step → back to the invitation → accepted', async ({ page }) => {
    const REG_TOKEN = 'B'.repeat(43);
    const registrations: Record<string, unknown>[] = [];
    const accepts: unknown[] = [];
    await page.addInitScript(() => localStorage.setItem('buurtplaza-language', 'nl'));
    await page.route('**/api/consumer-registration', (route) => {
      registrations.push(route.request().postDataJSON());
      return json(route, { status: 'accepted', linkLifetimeMinutes: 60 }, 202);
    });
    await page.route(/\/api\/consumer-registration\/verify(\?.*)?$/, (route) => {
      if (route.request().method() === 'GET') return json(route, { state: 'valid', canResend: false, locale: 'nl', expiresAt: '2030-01-01T00:00:00.000Z' });
      // The server hands back the *bare* return ref it stored — no token was ever persisted.
      return json(route, { state: 'valid', canResend: false, locale: 'nl', handoff: { email: 'invitee@example.org', returnRef: '/account/uitnodiging' } });
    });
    await page.route('**/api/business-invitations/accept', (route) => {
      accepts.push(route.request().postDataJSON());
      return json(route, { accepted: true, businessId: 41, businessName: 'Kapper Centrum', role: 'manager' });
    });

    // 1. Signed out, the e-mailed link opens; the visitor chooses to register.
    await page.goto('/account/uitnodiging?token=journey-token');
    await page.getByTestId('link-invitation-register').click();
    await expect(page).toHaveURL(/\/account\/register\?terug=%2Faccount%2Fuitnodiging$/);
    await page.getByTestId('input-register-name').fill('Nieuwe Beheerder');
    await page.getByTestId('input-register-email').fill('invitee@example.org');
    await page.getByTestId('input-register-phone').fill('+31612345678');
    await page.getByTestId('button-register-submit').click();
    await expect(page).toHaveURL(/\/account\/register\/check-email$/);
    expect(registrations).toHaveLength(1);
    expect(registrations[0].returnRef).toBe('/account/uitnodiging');
    expect(JSON.stringify(registrations[0])).not.toContain('journey-token');

    // 2. The registration e-mail link is consumed; the password step follows with the bare return ref.
    await page.goto(`/account/register/complete?token=${REG_TOKEN}`);
    await page.getByTestId('button-register-continue').click();
    await page.getByTestId('button-register-set-password').click();
    await expect(page).toHaveURL(/\/sign-up\?terug=%2Faccount%2Fuitnodiging$/);
    expect(page.url()).not.toContain('journey-token');

    // 3. Once signed in (password created), the invitation page re-attaches the parked token and accepts on click only.
    await signIn(page);
    await page.goto('/account/uitnodiging?e2eAccountAuth=1');
    await expect(page.getByTestId('button-invitation-accept')).toBeVisible();
    expect(accepts).toEqual([]);
    await page.getByTestId('button-invitation-accept').click();
    await expect(page.getByTestId('status-invitation-accepted')).toContainText('Kapper Centrum');
    expect(accepts).toEqual([{ token: 'journey-token' }]);
    expect(await page.evaluate(() => localStorage.getItem('buurtplaza.invitation-handoff'))).toBeNull();
  });
});

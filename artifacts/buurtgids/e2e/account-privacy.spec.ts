import { expect, test, type Page, type Route } from '@playwright/test';

type Recorded = { method: string; path: string; body: unknown };

type AccountRequest = {
  id: number;
  type: 'deletion';
  scope: 'account';
  status: 'received' | 'blocked' | 'in_review' | 'completed' | 'rejected' | 'withdrawn';
  version: number;
  acknowledgedScopes: string[];
  blocker: { code: string; businesses: Array<{ businessProfileId: number; name: string; resolved: boolean; resolution: string | null }> } | null;
  deadlineAt: string | null;
  resolvedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{ id: number; fromStatus: string | null; toStatus: string; createdAt: string }>;
};

type Message = {
  id: number;
  eventCode: string;
  channel: 'email';
  status: 'queued' | 'sending' | 'accepted' | 'delivered' | 'failed' | 'cancelled';
  businessProfileId: number | null;
  businessName: string | null;
  nextRetryAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const me = (verified = true) => ({
  id: 1,
  status: 'active',
  role: 'user',
  locale: 'nl',
  onboardingCompleted: true,
  onboardingCompletedAt: '2026-09-02T00:00:00.000Z',
  capabilities: { isVerified: verified, isEditor: false, canReview: false, isBusinessMember: false, canClaimBusiness: false, canPublishBusiness: false },
  hasResearchRegistration: false,
  businessMembershipCount: 1,
  preferences: null,
  createdAt: '2026-09-01T00:00:00.000Z',
});

type FakeServer = { requests: Recorded[]; accountRequests: AccountRequest[]; messages: Message[]; soleOwnerBlock: boolean };

async function installServer(page: Page, options: { verified?: boolean; soleOwnerBlock?: boolean; messages?: Message[] } = {}): Promise<FakeServer> {
  const state: FakeServer = { requests: [], accountRequests: [], messages: options.messages ?? [], soleOwnerBlock: options.soleOwnerBlock ?? false };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/account/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : null });
    if (!request.headers().authorization?.startsWith('Bearer e2e-token:')) {
      return json(route, { code: 'AUTH_REQUIRED', messageKey: 'errors.auth_required', correlationId: 'e2e' }, 401);
    }
    if (path.endsWith('/account/me')) return json(route, me(options.verified ?? true));
    if (path.endsWith('/account/consents')) {
      return json(route, { currentNoticeVersion: 'draft-2026-09', purposes: ['marketing_updates', 'research_contact'], current: [], history: [] });
    }
    if (path.endsWith('/account/messages')) return json(route, { messages: state.messages });
    if (path.endsWith('/account/requests')) return json(route, { requests: state.accountRequests });
    if (path.endsWith('/account/deletion-requests') && request.method() === 'POST') {
      const body = request.postDataJSON();
      const now = new Date().toISOString();
      const blocked = state.soleOwnerBlock;
      const created: AccountRequest = {
        id: state.accountRequests.length + 1,
        type: 'deletion',
        scope: 'account',
        status: blocked ? 'blocked' : 'received',
        version: 1,
        acknowledgedScopes: body.acknowledgedScopes,
        blocker: blocked
          ? { code: 'blocked_ownership', businesses: [{ businessProfileId: 7, name: 'Bakkerij De Korenaar', resolved: false, resolution: null }] }
          : null,
        deadlineAt: null,
        resolvedAt: null,
        withdrawnAt: null,
        createdAt: now,
        updatedAt: now,
        events: [{ id: 1, fromStatus: null, toStatus: blocked ? 'blocked' : 'received', createdAt: now }],
      };
      state.accountRequests.unshift(created);
      state.messages.unshift({
        id: state.messages.length + 1,
        eventCode: blocked ? 'account.deletion_blocked' : 'account.deletion_received',
        channel: 'email',
        status: 'queued',
        businessProfileId: null,
        businessName: null,
        nextRetryAt: null,
        acceptedAt: null,
        deliveredAt: null,
        failedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return json(route, created, 201);
    }
    const withdrawMatch = path.match(/\/account\/requests\/(\d+)\/withdraw$/);
    if (withdrawMatch && request.method() === 'POST') {
      const target = state.accountRequests.find((item) => item.id === Number(withdrawMatch[1]));
      if (!target) return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
      if (request.postDataJSON().expectedVersion !== target.version) {
        return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', expectedVersion: target.version }, 409);
      }
      target.status = 'withdrawn';
      target.version += 1;
      target.withdrawnAt = new Date().toISOString();
      return json(route, target);
    }
    return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
  });
  await page.route('**/api/registration', (route) => json(route, { registered: false, registration: null }));
  return state;
}

async function signIn(page: Page, userId = 'user-e2e') {
  await page.addInitScript((id) => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: id };
  }, userId);
}

const SCOPES = ['account_profile', 'preferences', 'consents', 'saved_events', 'business_memberships'];

test.describe('account privacy and deletion', () => {
  test('requires every scope acknowledgement, files the request, and tracks it truthfully', async ({ page }) => {
    await signIn(page);
    const server = await installServer(page, {
      messages: [
        {
          id: 40,
          eventCode: 'claim.approved',
          channel: 'email',
          status: 'failed',
          businessProfileId: 7,
          businessName: 'Bakkerij De Korenaar',
          nextRetryAt: null,
          acceptedAt: null,
          deliveredAt: null,
          failedAt: '2026-09-10T10:00:00.000Z',
          createdAt: '2026-09-10T09:00:00.000Z',
          updatedAt: '2026-09-10T10:00:00.000Z',
        },
      ],
    });
    await page.goto('/account?e2eAccountAuth=1');
    await page.getByTestId('link-account-privacy').click();
    await expect(page).toHaveURL(/\/account\/privacy$/);
    await expect(page.getByTestId('heading-account-privacy')).toBeVisible();
    await page.getByTestId('button-language-nl').click();

    // Separate scopes are explained; deletion needs every acknowledgement.
    await expect(page.getByTestId('deletion-separate-scopes')).toContainText('Onderzoeksregistratie');
    await expect(page.getByTestId('deletion-separate-scopes')).toContainText('Clerk');
    await expect(page.getByTestId('deletion-separate-scopes')).toContainText('Uitloggen');
    await expect(page.getByTestId('status-requests-empty')).toBeVisible();
    await expect(page.getByTestId('message-status-40')).toContainText('Mislukt');
    await expect(page.getByTestId('button-request-deletion')).toBeDisabled();
    for (const scope of SCOPES.slice(0, -1)) await page.getByTestId(`checkbox-scope-${scope}`).check();
    await expect(page.getByTestId('button-request-deletion')).toBeDisabled();
    await page.getByTestId('checkbox-scope-business_memberships').check();
    await expect(page.getByTestId('button-request-deletion')).toBeEnabled();

    await page.getByTestId('button-request-deletion').click();
    await expect(page.getByTestId('request-status-1')).toHaveText('Ontvangen, wacht op behandeling');
    const created = server.requests.find((request) => request.method === 'POST' && request.path.endsWith('/deletion-requests'));
    expect(created?.body).toEqual({ acknowledgedScopes: SCOPES });
    await expect(page.getByTestId('request-1')).toContainText('Er is nog geen behandeltermijn vastgesteld.');
    await expect(page.getByTestId('message-status-2')).toContainText('In de wachtrij');
    // Only one open request at a time.
    await expect(page.getByTestId('button-request-deletion')).toBeDisabled();

    // English parity for the status vocabulary.
    await page.getByTestId('button-language-en').click();
    await expect(page.getByTestId('request-status-1')).toHaveText('Received, awaiting handling');
    await expect(page.getByTestId('message-status-40')).toContainText('Failed');
    await expect(page.getByTestId('message-status-2')).toContainText('Queued');
    await page.getByTestId('button-language-nl').click();

    await page.getByTestId('button-withdraw-1').click();
    await expect(page.getByTestId('request-status-1')).toHaveText('Ingetrokken');
    const withdrawn = server.requests.find((request) => request.method === 'POST' && request.path.endsWith('/requests/1/withdraw'));
    expect(withdrawn?.body).toEqual({ expectedVersion: 1 });
    await expect(page.getByTestId('button-request-deletion')).toBeDisabled();
  });

  test('sole owners see the blocking business and a pending decision instead of deletion', async ({ page }) => {
    await signIn(page);
    await installServer(page, { soleOwnerBlock: true });
    await page.goto('/account/privacy?e2eAccountAuth=1');
    await page.getByTestId('button-language-nl').click();
    for (const scope of SCOPES) await page.getByTestId(`checkbox-scope-${scope}`).check();
    await page.getByTestId('button-request-deletion').click();
    await expect(page.getByTestId('request-status-1')).toHaveText('Wacht op besluit over je bedrijf');
    await expect(page.getByTestId('request-blocker-1')).toContainText('Bakkerij De Korenaar');
    await expect(page.getByTestId('request-blocker-1')).toContainText('Wacht op besluit');
    await expect(page.getByTestId('button-withdraw-1')).toBeVisible();
  });

  test('unverified accounts cannot file a deletion request', async ({ page }) => {
    await signIn(page);
    await installServer(page, { verified: false });
    await page.goto('/account/privacy?e2eAccountAuth=1');
    await expect(page.getByTestId('status-deletion-unverified')).toBeVisible();
    await expect(page.getByTestId('checkbox-scope-account_profile')).toBeDisabled();
    await expect(page.getByTestId('button-request-deletion')).toBeDisabled();
  });
});

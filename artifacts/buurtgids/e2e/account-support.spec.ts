import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Support tabs on the reviewer screen (Accountverzoeken / Mislukte berichten)
 * against a route-mocked API. The dev-only `?e2eEditorAuth=1` hook supplies
 * the editor session so the test drives the real BusinessModerationView +
 * AccountSupportPanel: version-bound decisions for start_review,
 * resolve_blocker, complete and reject, the self-review refusal, the 409
 * refresh path, and resending a permanently failed lifecycle message without
 * ever rendering payload contents.
 */

const NOW = '2026-09-14T10:00:00.000Z';

type Recorded = { method: string; path: string; body: any };
type Business = { businessProfileId: number; name: string; publicationStatus: string; resolved: boolean };
type Event = { id: number; fromStatus: string | null; toStatus: string; actor: string; resolutionCode: string | null; businessProfileId: number | null; note: string | null; createdAt: string };
type AccountRequest = {
  id: number; userId: number; scope: 'account'; type: 'deletion'; status: string; version: number; acknowledgedScopes: string[];
  blocker: { code: 'blocked_ownership'; businesses: Business[] } | null; resolutionCode: string | null; resolutionNote: string | null;
  resolvedByUserId: string | null; deadlineAt: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null; withdrawnAt: string | null;
  events: Event[]; requesterClerkId: string;
};

function installServer(page: Page, options: { viewerId?: string } = {}) {
  const requests: Recorded[] = [];
  const viewerId = options.viewerId ?? 'user-editor';

  const accountRequests: AccountRequest[] = [
    {
      id: 11, userId: 501, scope: 'account', type: 'deletion', status: 'blocked', version: 2, acknowledgedScopes: ['profile', 'businesses'],
      blocker: { code: 'blocked_ownership', businesses: [
        { businessProfileId: 301, name: 'Bakkerij Solo', publicationStatus: 'published', resolved: false },
        { businessProfileId: 302, name: 'Kapper Alleen', publicationStatus: 'published', resolved: false },
      ] },
      resolutionCode: null, resolutionNote: null, resolvedByUserId: null, deadlineAt: null, createdAt: NOW, updatedAt: NOW, resolvedAt: null, withdrawnAt: null,
      events: [{ id: 1, fromStatus: null, toStatus: 'received', actor: 'requester', resolutionCode: null, businessProfileId: null, note: null, createdAt: NOW }],
      requesterClerkId: 'user-requester',
    },
    {
      id: 12, userId: 502, scope: 'account', type: 'deletion', status: 'received', version: 1, acknowledgedScopes: ['profile'],
      blocker: null, resolutionCode: null, resolutionNote: null, resolvedByUserId: null, deadlineAt: null, createdAt: NOW, updatedAt: NOW, resolvedAt: null, withdrawnAt: null,
      events: [], requesterClerkId: 'user-editor', // the signed-in editor's own request
    },
  ];

  const messages = [
    { id: 71, eventCode: 'account.deletion_received', status: 'failed', locale: 'nl', businessName: null, attempts: 5, maxAttempts: 5, nextRetryAt: null, acceptedAt: null, deliveredAt: null, failedAt: NOW, createdAt: NOW, recipientUserId: 501, lastErrorCode: 'provider_timeout', lastErrorAt: NOW, payload: { secret: 'NEVER-RENDER-ME' } },
    { id: 72, eventCode: 'business.unpublished', status: 'failed', locale: 'en', businessName: 'Bakkerij Solo', attempts: 3, maxAttempts: 5, nextRetryAt: null, acceptedAt: null, deliveredAt: null, failedAt: NOW, createdAt: NOW, recipientUserId: null, lastErrorCode: null, lastErrorAt: null, payload: { secret: 'NEVER-RENDER-ME' } },
  ];

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const error = (route: Route, code: string, status: number, extra: Record<string, unknown> = {}) =>
    json(route, { code, messageKey: `errors.${code.toLowerCase()}`, correlationId: 'e2e', ...extra }, status);
  const record = (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ method: request.method(), path: url.pathname + url.search, body });
    return { url, body, method: request.method() };
  };
  const OPEN = new Set(['received', 'blocked', 'in_review']);
  const publicView = ({ requesterClerkId: _omit, ...request }: AccountRequest) => request;
  const publicMessage = ({ payload: _omit, ...message }: (typeof messages)[number]) => message;

  const install = async () => {
    await page.route('**/api/business-claims/moderation**', (route) => json(route, []));
    await page.route('**/api/deals/moderation**', (route) => json(route, []));

    await page.route(/\/api\/review\/account-requests(\/\d+\/decision)?(\?.*)?$/, (route) => {
      const { url, body, method } = record(route);
      if (method === 'GET') return json(route, { requests: accountRequests.filter((r) => OPEN.has(r.status)).map(publicView) });
      const id = Number(url.pathname.match(/\/review\/account-requests\/(\d+)\/decision$/)?.[1]);
      const request = accountRequests.find((r) => r.id === id);
      if (!request) return error(route, 'NOT_FOUND', 404);
      if (request.requesterClerkId === viewerId) return error(route, 'SELF_REVIEW_FORBIDDEN', 403);
      if (body.expectedVersion !== request.version) return error(route, 'VERSION_CONFLICT', 409, { expectedVersion: request.version });
      const audit = (toStatus: string, resolutionCode: string | null = null, businessProfileId: number | null = null) => {
        request.events.push({ id: request.events.length + 1, fromStatus: request.status, toStatus, actor: 'support', resolutionCode, businessProfileId, note: body.note ?? null, createdAt: NOW });
        request.status = toStatus;
        request.version += 1;
      };
      switch (body.decision) {
        case 'start_review':
          if (request.status !== 'received' && request.status !== 'blocked') return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'status', code: 'not_reviewable' }] });
          audit('in_review');
          break;
        case 'resolve_blocker': {
          const business = request.blocker?.businesses.find((b) => b.businessProfileId === body.businessProfileId);
          if (!business) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'businessProfileId', code: 'not_blocking' }] });
          business.resolved = true;
          if (body.resolutionCode === 'business_closed') business.publicationStatus = 'archived';
          if (body.resolutionCode === 'business_unpublished') business.publicationStatus = 'unpublished';
          const stillBlocked = request.blocker!.businesses.some((b) => !b.resolved);
          audit(request.status === 'in_review' ? 'in_review' : stillBlocked ? 'blocked' : 'received', body.resolutionCode, body.businessProfileId);
          break;
        }
        case 'complete':
          if (request.status !== 'in_review') return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'status', code: 'not_in_review' }] });
          if (request.blocker?.businesses.some((b) => !b.resolved)) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'status', code: 'ownership_unresolved' }] });
          audit('completed', 'account_deleted');
          request.resolutionCode = 'account_deleted';
          break;
        case 'reject':
          if (request.status !== 'in_review') return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'status', code: 'not_in_review' }] });
          audit('rejected', 'request_rejected');
          request.resolutionCode = 'request_rejected';
          break;
        default:
          return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'decision', code: 'invalid' }] });
      }
      return json(route, publicView(request));
    });

    await page.route(/\/api\/review\/lifecycle-messages(\/\d+\/resend)?(\?.*)?$/, (route) => {
      const { url, method } = record(route);
      if (method === 'GET') {
        const status = url.searchParams.get('status');
        return json(route, { messages: messages.filter((m) => !status || m.status === status).map(publicMessage) });
      }
      const id = Number(url.pathname.match(/\/review\/lifecycle-messages\/(\d+)\/resend$/)?.[1]);
      const message = messages.find((m) => m.id === id);
      if (!message) return error(route, 'NOT_FOUND', 404);
      if (message.status !== 'failed') return error(route, 'IDEMPOTENCY_CONFLICT', 409, { fieldErrors: [{ field: 'status', code: 'not_failed' }] });
      message.status = 'queued';
      message.failedAt = null;
      return json(route, publicMessage(message));
    });
  };

  return {
    install,
    requests,
    accountRequests,
    messages,
    bumpVersionBehindEditor(id: number) {
      const request = accountRequests.find((r) => r.id === id)!;
      request.version += 1;
    },
  };
}

async function signIn(page: Page, auth: { userId: string | null; role?: string | null }, language: 'nl' | 'en' = 'nl') {
  await page.addInitScript(({ value, lang }) => {
    window.localStorage.setItem('buurtplaza-language', lang);
    (window as Window & { __editorTestAuth?: typeof value }).__editorTestAuth = value;
  }, { value: auth, lang: language });
}

const MODERATION_URL = '/redactie/bedrijven?e2eEditorAuth=1';

test.describe('account support screen', () => {
  test('non-editors never see the support tabs or call the support API', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-member', role: 'member' });
    await page.goto(MODERATION_URL);
    await expect(page.getByRole('heading', { name: 'Redactietoegang vereist' })).toBeVisible();
    await expect(page.getByTestId('tab-account-requests')).toHaveCount(0);
    expect(server.requests.filter((request) => request.path.startsWith('/api/review/'))).toEqual([]);
  });

  test('editors unblock a sole-owner deletion and complete it with version-bound decisions', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-account-requests').click();

    const queue = page.getByTestId('support-requests');
    const item = queue.getByTestId('account-request-11');
    await expect(item.getByTestId('account-request-status-11')).toHaveText('geblokkeerd · v2');
    await expect(item.getByText('Aanvrager #501', { exact: false })).toBeVisible();
    await expect(item.getByTestId('blocker-11-301')).toContainText('Bakkerij Solo');
    await expect(item.getByTestId('blocker-11-301')).toContainText('open');
    await expect(item.getByRole('button', { name: 'Blokkade oplossen' })).toHaveCount(2);
    // Not in review yet: completion and rejection are not offered.
    await expect(item.getByRole('button', { name: 'Account verwijderen' })).toHaveCount(0);

    // Resolve the first blocker by recording an ownership transfer (default choice) via the keyboard.
    await item.getByTestId('blocker-11-301').getByRole('button', { name: 'Blokkade oplossen' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Blokkade oplossen · Verzoek #11 · v2 · Bakkerij Solo')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Eigendom overgedragen/ })).toBeChecked();
    await dialog.getByLabel('Interne notitie (optioneel)').fill('Overgedragen aan partner.');
    await dialog.getByTestId('confirm-support-action').click();
    await expect(page.getByText('Beslissing opgeslagen.').first()).toBeVisible();
    await expect(item.getByTestId('blocker-11-301')).toContainText('opgelost');
    await expect(item.getByTestId('account-request-status-11')).toHaveText('geblokkeerd · v3');

    // Second blocker: close the business. The request drops back to received.
    await item.getByTestId('blocker-11-302').getByRole('button', { name: 'Blokkade oplossen' }).click();
    await dialog.getByRole('radio', { name: /Bedrijf gesloten/ }).check();
    await dialog.getByTestId('confirm-support-action').click();
    await expect(item.getByTestId('account-request-status-11')).toHaveText('ontvangen · v4');
    await expect(item.getByTestId('blocker-11-302')).toContainText('gearchiveerd');
    await expect(item.getByRole('button', { name: 'Blokkade oplossen' })).toHaveCount(0);

    // Take into review, then complete.
    await item.getByRole('button', { name: 'In behandeling nemen' }).click();
    await dialog.getByTestId('confirm-support-action').click();
    await expect(item.getByTestId('account-request-status-11')).toHaveText('in behandeling · v5');
    await item.getByRole('button', { name: 'Account verwijderen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('kan niet ongedaan worden gemaakt');
    await dialog.getByTestId('confirm-support-action').click();
    await expect(item).toHaveCount(0);

    const decisions = server.requests.filter((r) => r.method === 'POST' && r.path === '/api/review/account-requests/11/decision').map((r) => r.body);
    expect(decisions).toEqual([
      { expectedVersion: 2, decision: 'resolve_blocker', businessProfileId: 301, resolutionCode: 'ownership_transferred', note: 'Overgedragen aan partner.' },
      { expectedVersion: 3, decision: 'resolve_blocker', businessProfileId: 302, resolutionCode: 'business_closed' },
      { expectedVersion: 4, decision: 'start_review' },
      { expectedVersion: 5, decision: 'complete' },
    ]);
    expect(server.accountRequests[0].status).toBe('completed');
  });

  test('self-review is refused with the API error copy and a stale version refreshes the queue', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-account-requests').click();

    const own = page.getByTestId('account-request-12');
    await own.getByRole('button', { name: 'In behandeling nemen' }).click();
    await page.getByRole('dialog').getByTestId('confirm-support-action').click();
    await expect(page.getByText('Je kunt geen beslissing nemen over je eigen accountverzoek.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(server.accountRequests[1].status).toBe('received');

    const item = page.getByTestId('account-request-11');
    await expect(item.getByTestId('account-request-status-11')).toHaveText('geblokkeerd · v2');
    server.bumpVersionBehindEditor(11);
    await item.getByRole('button', { name: 'In behandeling nemen' }).click();
    await page.getByRole('dialog').getByTestId('confirm-support-action').click();
    await expect(page.getByText('Dit verzoek is intussen gewijzigd. De wachtrij is ververst.')).toBeVisible();
    await expect(item.getByTestId('account-request-status-11')).toHaveText('geblokkeerd · v3');
    expect(server.requests.filter((r) => r.method === 'POST').at(-1)?.body).toEqual({ expectedVersion: 2, decision: 'start_review' });
  });

  test('a rejected request leaves the queue with the internal note recorded', async ({ page }) => {
    const server = installServer(page);
    server.accountRequests[0].status = 'in_review';
    server.accountRequests[0].blocker = null;
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' }, 'en');
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-account-requests').click();

    const item = page.getByTestId('account-request-11');
    await expect(item.getByTestId('account-request-status-11')).toHaveText('in review · v2');
    await expect(item.getByText('No blockers')).toBeVisible();
    await item.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Reject · Request #11 · v2')).toBeVisible();
    await dialog.getByLabel('Internal note (optional)').fill('Identity could not be confirmed.');
    await dialog.getByTestId('confirm-support-action').click();
    await expect(page.getByText('Decision saved.')).toBeVisible();
    await expect(item).toHaveCount(0);
    expect(server.requests.filter((r) => r.method === 'POST').at(-1)?.body).toEqual({ expectedVersion: 2, decision: 'reject', note: 'Identity could not be confirmed.' });
    expect(server.accountRequests[0].events.at(-1)?.note).toBe('Identity could not be confirmed.');
  });

  test('failed lifecycle messages show attempts and error code, never the payload, and can be resent', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-lifecycle-messages').click();

    const list = page.getByTestId('support-messages');
    const first = list.getByTestId('lifecycle-message-71');
    await expect(first).toContainText('account.deletion_received');
    await expect(first.getByTestId('lifecycle-message-status-71')).toHaveText('mislukt');
    await expect(first.getByTestId('lifecycle-message-attempts-71')).toHaveText('5 / 5');
    await expect(first.getByTestId('lifecycle-message-error-71')).toHaveText('provider_timeout');
    await expect(first).toContainText('Ontvanger');
    await expect(first).toContainText('#501');
    const second = list.getByTestId('lifecycle-message-72');
    await expect(second.getByTestId('lifecycle-message-error-72')).toHaveText('geen foutcode');
    await expect(second).toContainText('Bakkerij Solo');
    await expect(page.getByText('NEVER-RENDER-ME')).toHaveCount(0);
    expect(server.requests.find((r) => r.method === 'GET' && r.path.startsWith('/api/review/lifecycle-messages'))?.path).toBe('/api/review/lifecycle-messages?status=failed');

    await first.getByRole('button', { name: 'Opnieuw versturen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Bericht #71 · account.deletion_received')).toBeVisible();
    await dialog.getByTestId('confirm-support-action').click();
    await expect(page.getByText('Bericht opnieuw in de wachtrij gezet.')).toBeVisible();
    await expect(first).toHaveCount(0);
    await expect(second).toBeVisible();
    expect(server.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual(['/api/review/lifecycle-messages/71/resend']);
    expect(server.messages[0].status).toBe('queued');
  });
});

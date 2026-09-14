import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Reviewer moderation screen (Eigenaarschap / Profielen / Publicatie) against
 * a route-mocked API. The real screen needs a Clerk editor claim; here the
 * dev-only `?e2eEditorAuth=1` hook supplies the session so the test drives the
 * actual BusinessModerationView + BusinessReviewPanel components: access
 * gating, cursor pagination, the decision dialog with fact checks, the
 * self-review-blocked state, and the 409 refresh path.
 */

const NOW = '2026-09-14T10:00:00.000Z';
const PAGE_SIZE = 20;

type Recorded = { method: string; path: string; body: any };

const profile = (id: number, name: string, publicationStatus = 'draft') => ({
  id, slug: `bedrijf-${id}`, name, neighborhood: 'Bezuidenhout', category: 'Bakkerij', listingSource: 'openstreetmap',
  sourceUrl: `https://www.openstreetmap.org/node/${id}`, isClaimed: false, publicationStatus,
});

const revision = (id: number, businessProfileId: number, version: number, status: string, tagline: string) => ({
  id, businessProfileId, version, status,
  content: {
    nl: { tagline, description: `Beschrijving ${tagline}`, openingHours: null },
    en: { tagline: null, description: null, openingHours: null },
    facts: { websiteUrl: 'https://voorbeeld.nl', phone: null, email: null, address: 'Laan 1', logoUrl: null, coverUrl: null },
  },
  submittedAt: NOW, decidedAt: null, createdAt: NOW, updatedAt: NOW,
});

function installServer(page: Page) {
  const requests: Recorded[] = [];

  // 21 pending claims so the first page is full and one item spills over.
  const claims = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => {
    const id = index + 1;
    return {
      id, version: 1, status: 'submitted', kind: id % 2 ? 'existing_listing' : 'new_business', relationship: 'eigenaar',
      authorityDeclaration: `Ik ben bevoegd voor bedrijf ${id}.`, evidenceReference: null, message: null,
      contactName: `Contact ${id}`, submittedAt: NOW, createdAt: NOW,
      profile: profile(100 + id, `Claim Bedrijf ${id}`),
      // Claim 3 belongs to the signed-in reviewer: the API says they cannot decide.
      canDecide: id !== 3,
    };
  });

  const revisions = [
    { revision: revision(51, 201, 2, 'submitted', 'Nieuwe slogan'), profile: profile(201, 'Profiel Bakkerij'), approvedRevision: revision(50, 201, 1, 'approved', 'Oude slogan'), canDecide: true },
    { revision: revision(61, 202, 1, 'submitted', 'Eigen bedrijf'), profile: profile(202, 'Eigen Zaak'), approvedRevision: null, canDecide: false },
  ];

  const publications = [
    { profile: profile(301, 'Klaar Voor Publicatie', 'draft'), approvedRevision: revision(70, 301, 3, 'approved', 'Goedgekeurd'), latestDecision: null, freshness: { status: 'unverified', checkedOn: null, staleAfterDays: 180, staleOn: null, daysUntilStale: null, recheckWindowDays: 30, recheckDue: false }, canDecide: true },
    { profile: profile(302, 'Al Online', 'published'), approvedRevision: revision(71, 302, 1, 'approved', 'Live'), latestDecision: { id: 9, targetType: 'publication', targetId: 302, targetVersion: 1, decision: 'publish', reason: 'Alles klopt.', createdAt: NOW }, freshness: { status: 'fresh', checkedOn: '2026-03-25T00:00:00.000Z', staleAfterDays: 180, staleOn: '2026-09-21T00:00:00.000Z', daysUntilStale: 7, recheckWindowDays: 30, recheckDue: true }, canDecide: true },
  ];

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const error = (route: Route, code: string, status: number, extra: Record<string, unknown> = {}) =>
    json(route, { code, messageKey: `errors.${code.toLowerCase()}`, correlationId: 'e2e', ...extra }, status);

  const paginate = <T,>(items: T[], url: URL) => {
    const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE);
    const start = Number(url.searchParams.get('cursor') ?? 0);
    const slice = items.slice(start, start + limit);
    const end = start + slice.length;
    return { items: slice, pageInfo: { hasMore: end < items.length, nextCursor: end < items.length ? String(end) : null } };
  };

  const record = (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ method: request.method(), path: url.pathname + url.search, body });
    return { url, body, method: request.method() };
  };

  const install = async () => {
    await page.route('**/api/business-claims/moderation**', (route) => json(route, []));
    await page.route('**/api/deals/moderation**', (route) => json(route, []));

    await page.route(/\/api\/review\/claims(\/\d+\/decision)?(\?.*)?$/, (route) => {
      const { url, body, method } = record(route);
      if (method === 'GET') return json(route, paginate(claims, url));
      const id = Number(url.pathname.match(/\/review\/claims\/(\d+)\/decision$/)?.[1]);
      const index = claims.findIndex((claim) => claim.id === id);
      if (index === -1) return error(route, 'NOT_FOUND', 404);
      const claim = claims[index];
      if (!claim.canDecide) return error(route, 'SELF_REVIEW_FORBIDDEN', 403);
      if (body.expectedVersion !== claim.version) return error(route, 'VERSION_CONFLICT', 409, { expectedVersion: claim.version });
      if (body.decision !== 'approve' && !body.reason) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'reason', code: 'required' }] });
      claims.splice(index, 1);
      return json(route, { id, version: claim.version + 1, status: body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'changes_requested' });
    });

    await page.route(/\/api\/review\/revisions(\/\d+\/decision)?(\?.*)?$/, (route) => {
      const { url, body, method } = record(route);
      if (method === 'GET') return json(route, paginate(revisions, url));
      const id = Number(url.pathname.match(/\/review\/revisions\/(\d+)\/decision$/)?.[1]);
      const index = revisions.findIndex((item) => item.revision.id === id);
      if (index === -1) return error(route, 'NOT_FOUND', 404);
      const item = revisions[index];
      if (!item.canDecide) return error(route, 'SELF_REVIEW_FORBIDDEN', 403);
      if (body.expectedVersion !== item.revision.version) return error(route, 'VERSION_CONFLICT', 409, { expectedVersion: item.revision.version });
      if (body.decision !== 'approve' && !body.reason) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'reason', code: 'required' }] });
      revisions.splice(index, 1);
      return json(route, { ...item.revision, status: body.decision === 'approve' ? 'approved' : 'rejected', decidedAt: NOW });
    });

    await page.route(/\/api\/review\/businesses(\/\d+\/publication)?(\?.*)?$/, (route) => {
      const { url, body, method } = record(route);
      if (method === 'GET') return json(route, paginate(publications, url));
      const id = Number(url.pathname.match(/\/review\/businesses\/(\d+)\/publication$/)?.[1]);
      const item = publications.find((entry) => entry.profile.id === id);
      if (!item) return error(route, 'NOT_FOUND', 404);
      if (body.expectedRevisionVersion !== (item.approvedRevision?.version ?? 0)) {
        return error(route, 'VERSION_CONFLICT', 409, { expectedVersion: item.approvedRevision?.version ?? 0 });
      }
      if (body.action !== 'publish' && !body.reason) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'reason', code: 'required' }] });
      item.profile.publicationStatus = body.action === 'publish' ? 'published' : body.action === 'suspend' ? 'suspended' : 'unpublished';
      item.latestDecision = { id: 10, targetType: 'publication', targetId: id, targetVersion: body.expectedRevisionVersion, decision: body.action, reason: body.reason ?? null, createdAt: NOW };
      return json(route, { id, publicationStatus: item.profile.publicationStatus });
    });
  };

  return {
    install,
    requests,
    claims,
    revisions,
    publications,
    /** Simulate another reviewer or the owner changing a claim after the queue was loaded. */
    bumpClaimVersion(id: number) {
      const claim = claims.find((entry) => entry.id === id);
      if (!claim) throw new Error(`no claim ${id}`);
      claim.version += 1;
      claim.status = 'changes_requested';
    },
  };
}

async function signIn(page: Page, auth: { userId: string | null; role?: string | null }) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('buurtplaza-language', 'nl');
    (window as Window & { __editorTestAuth?: typeof value }).__editorTestAuth = value;
  }, auth);
}

const MODERATION_URL = '/redactie/bedrijven?e2eEditorAuth=1';

test.describe('business moderation screen', () => {
  test('signed-out and non-editor visitors never see the review queues', async ({ page }) => {
    const server = installServer(page);
    await server.install();

    await signIn(page, { userId: null });
    await page.goto(MODERATION_URL);
    await expect(page.getByRole('heading', { name: 'Geen toegang' })).toBeVisible();
    await expect(page.getByTestId('tab-authority')).toHaveCount(0);

    await signIn(page, { userId: 'user-member', role: 'member' });
    await page.goto(MODERATION_URL);
    await expect(page.getByRole('heading', { name: 'Redactietoegang vereist' })).toBeVisible();
    await expect(page.getByTestId('tab-authority')).toHaveCount(0);
    expect(server.requests.filter((request) => request.path.startsWith('/api/review/'))).toEqual([]);
  });

  test('editors page through the ownership queue and approve a claim bound to its version', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);

    await expect(page.getByRole('heading', { name: 'Bedrijven & Deals Moderatie' })).toBeVisible();
    await expect(page.getByTestId('tab-authority')).toHaveText('Eigenaarschap');
    await expect(page.getByTestId('tab-editorial')).toHaveText('Profielen');
    await expect(page.getByTestId('tab-publication')).toHaveText('Publicatie');

    // Queues are only fetched once their tab is opened.
    expect(server.requests.filter((request) => request.path.startsWith('/api/review/claims'))).toHaveLength(0);
    await page.getByTestId('tab-authority').click();

    const queue = page.getByTestId('review-authority');
    await expect(queue.getByTestId('authority-item-1')).toBeVisible();
    await expect(queue.locator('[data-testid^="authority-item-"]')).toHaveCount(PAGE_SIZE);
    await expect(queue.getByTestId('authority-item-21')).toHaveCount(0);

    const loadMore = queue.getByRole('button', { name: 'Meer laden' });
    await loadMore.click();
    await expect(queue.getByTestId('authority-item-21')).toBeVisible();
    await expect(queue.locator('[data-testid^="authority-item-"]')).toHaveCount(PAGE_SIZE + 1);
    await expect(loadMore).toHaveCount(0);
    const pageRequests = server.requests.filter((request) => request.method === 'GET' && request.path.startsWith('/api/review/claims'));
    expect(pageRequests.map((request) => request.path)).toEqual([`/api/review/claims?limit=${PAGE_SIZE}`, `/api/review/claims?limit=${PAGE_SIZE}&cursor=${PAGE_SIZE}`]);

    // The reviewer's own claim offers no decision buttons.
    const own = queue.getByTestId('authority-item-3');
    await expect(own.getByTestId('self-review-blocked')).toHaveText(/kunt niet beslissen/);
    await expect(own.getByRole('button', { name: 'Goedkeuren' })).toHaveCount(0);
    await expect(queue.getByTestId('self-review-blocked')).toHaveCount(1);

    // Approve claim 2 through the dialog.
    await queue.getByTestId('authority-item-2').getByRole('button', { name: 'Goedkeuren' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Goedkeuren · Claim Bedrijf 2 · v1')).toBeVisible();
    await expect(dialog.getByText('Toelichting (optioneel)')).toBeVisible();
    await dialog.getByTestId('confirm-decision').click();

    await expect(page.getByText('Beslissing opgeslagen.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(queue.getByTestId('authority-item-2')).toHaveCount(0);
    const decision = server.requests.find((request) => request.method === 'POST' && request.path === '/api/review/claims/2/decision');
    expect(decision?.body).toEqual({ decision: 'approve', expectedVersion: 1 });
  });

  test('rejecting requires a reason and the reason travels with the decision', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-authority').click();

    await page.getByTestId('authority-item-1').getByRole('button', { name: 'Afwijzen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Toelichting (verplicht)')).toBeVisible();
    const confirm = dialog.getByTestId('confirm-decision');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Toelichting/).fill('   ');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Toelichting/).fill('Geen bewijs van eigenaarschap.');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText('Beslissing opgeslagen.')).toBeVisible();
    await expect(page.getByTestId('authority-item-1')).toHaveCount(0);
    const decision = server.requests.find((request) => request.method === 'POST' && request.path === '/api/review/claims/1/decision');
    expect(decision?.body).toEqual({ decision: 'reject', expectedVersion: 1, reason: 'Geen bewijs van eigenaarschap.' });
  });

  test('a stale claim decision gets a 409, closes the dialog and refreshes the queue', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-authority').click();

    const item = page.getByTestId('authority-item-4');
    await expect(item.getByText('ingediend · v1')).toBeVisible();
    // Someone else changes the claim while this reviewer has the old queue open.
    server.bumpClaimVersion(4);

    await item.getByRole('button', { name: 'Goedkeuren' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Goedkeuren · Claim Bedrijf 4 · v1')).toBeVisible();
    await dialog.getByTestId('confirm-decision').click();

    await expect(page.getByText('Deze versie is intussen gewijzigd. De wachtrij is ververst.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    // The refreshed queue shows the current version so the next decision binds to v2.
    await expect(item.getByText('wijzigingen gevraagd · v2')).toBeVisible();
    await expect(page.getByText('Beslissing opgeslagen.')).toHaveCount(0);

    const posts = server.requests.filter((request) => request.method === 'POST' && request.path === '/api/review/claims/4/decision');
    expect(posts.map((request) => request.body.expectedVersion)).toEqual([1]);
    const listCalls = server.requests.filter((request) => request.method === 'GET' && request.path.startsWith('/api/review/claims'));
    expect(listCalls.length).toBeGreaterThanOrEqual(2);

    // Retrying against the refreshed version succeeds.
    await item.getByRole('button', { name: 'Goedkeuren' }).click();
    await expect(page.getByRole('dialog').getByText('Goedkeuren · Claim Bedrijf 4 · v2')).toBeVisible();
    await page.getByRole('dialog').getByTestId('confirm-decision').click();
    await expect(page.getByText('Beslissing opgeslagen.')).toBeVisible();
    await expect(item).toHaveCount(0);
  });

  test('approving a profile revision sends only the filled-in fact checks', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-editorial').click();

    const queue = page.getByTestId('review-editorial');
    const item = queue.getByTestId('editorial-item-51');
    await expect(item.getByText('Nieuwe slogan', { exact: true })).toBeVisible();
    await expect(item.getByText('Oude slogan', { exact: true })).toBeVisible();
    await expect(item.getByText('Ingediend · v2')).toHaveCount(2);
    await expect(item.getByText('Huidig goedgekeurd · v1')).toBeVisible();

    // The reviewer's own business cannot be decided on.
    const own = queue.getByTestId('editorial-item-61');
    await expect(own.getByTestId('self-review-blocked')).toBeVisible();
    await expect(own.getByRole('button', { name: 'Goedkeuren' })).toHaveCount(0);

    // Fact checks are only offered on approval, not on rejection.
    await item.getByRole('button', { name: 'Afwijzen' }).click();
    await expect(page.getByRole('dialog').getByText('Feitencontrole (optioneel)')).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await item.getByRole('button', { name: 'Goedkeuren' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Goedkeuren · Profiel Bakkerij · v2')).toBeVisible();
    await expect(dialog.getByText('Feitencontrole (optioneel)')).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /^Status / })).toHaveCount(9);

    await dialog.getByRole('combobox', { name: 'Status Website' }).selectOption('confirmed');
    await dialog.getByRole('textbox', { name: 'Bron Website' }).fill('https://voorbeeld.nl/contact');
    await dialog.getByRole('combobox', { name: 'Status Adres' }).selectOption('contradicted');
    // A source without a status stays unchecked and must not be sent.
    await dialog.getByRole('textbox', { name: 'Bron Telefoon' }).fill('https://ergens.nl');
    await dialog.getByTestId('confirm-decision').click();

    await expect(page.getByText('Beslissing opgeslagen.')).toBeVisible();
    await expect(item).toHaveCount(0);
    const decision = server.requests.find((request) => request.method === 'POST' && request.path === '/api/review/revisions/51/decision');
    expect(decision?.body).toEqual({
      decision: 'approve',
      expectedVersion: 2,
      factChecks: [
        { field: 'websiteUrl', status: 'confirmed', sourceUrl: 'https://voorbeeld.nl/contact' },
        { field: 'address', status: 'contradicted' },
      ],
    });
  });

  test('editors publish an approved snapshot and the queue reflects the new state', async ({ page }) => {
    const server = installServer(page);
    await server.install();
    await signIn(page, { userId: 'user-editor', role: 'editor' });
    await page.goto(MODERATION_URL);
    await page.getByTestId('tab-publication').click();

    const queue = page.getByTestId('review-publication');
    const draft = queue.getByTestId('publication-item-301');
    await expect(draft.getByText('concept')).toBeVisible();
    await expect(draft.getByText('Goedgekeurde versie v3')).toBeVisible();
    await expect(draft.getByRole('button', { name: 'Offline halen' })).toHaveCount(0);

    const live = queue.getByTestId('publication-item-302');
    await expect(live.getByText('gepubliceerd')).toBeVisible();
    await expect(draft.getByTestId('publication-recheck-due-301')).toHaveCount(0);
    await expect(live.getByTestId('publication-recheck-due-302')).toContainText('Hercontrole nodig');
    await expect(live.getByTestId('publication-recheck-due-302')).toContainText('verloopt op 21-9-2026');
    await expect(live.getByText(/laatste toelichting: Alles klopt\./)).toBeVisible();
    await expect(live.getByRole('button', { name: 'Publiceren' })).toHaveCount(0);
    await expect(live.getByRole('button', { name: 'Offline halen' })).toBeVisible();

    await draft.getByRole('button', { name: 'Publiceren' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Publiceren · Klaar Voor Publicatie · snapshot v3')).toBeVisible();
    await expect(dialog.getByText('Toelichting (optioneel)')).toBeVisible();
    await dialog.getByTestId('confirm-decision').click();

    await expect(page.getByText('Beslissing opgeslagen.')).toBeVisible();
    await expect(draft.getByText('gepubliceerd')).toBeVisible();
    await expect(draft.getByRole('button', { name: 'Publiceren' })).toHaveCount(0);
    await expect(draft.getByRole('button', { name: 'Offline halen' })).toBeVisible();
    const publish = server.requests.find((request) => request.method === 'POST' && request.path === '/api/review/businesses/301/publication');
    expect(publish?.body).toEqual({ action: 'publish', expectedRevisionVersion: 3 });

    // Suspending needs a reason, which the API echoes back into the queue.
    await draft.getByRole('button', { name: 'Schorsen' }).click();
    await expect(page.getByRole('dialog').getByTestId('confirm-decision')).toBeDisabled();
    await page.getByRole('dialog').getByLabel(/Toelichting/).fill('Klacht ontvangen.');
    await page.getByRole('dialog').getByTestId('confirm-decision').click();
    await expect(draft.getByText('geschorst')).toBeVisible();
    await expect(draft.getByText(/laatste toelichting: Klacht ontvangen\./)).toBeVisible();
    await expect(draft.getByRole('button', { name: 'Schorsen' })).toHaveCount(0);
  });
});

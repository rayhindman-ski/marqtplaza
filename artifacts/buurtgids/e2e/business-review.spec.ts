import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Owner profile editor + public approved projection, against a route-mocked
 * API. Covers draft privacy, immutable submitted revisions, stale-version
 * conflicts, changes-requested resubmission, suspension, and localisation
 * without invented English text.
 */

type Text = { tagline: string | null; description: string | null; openingHours: string | null };
type Content = { nl: Text; en: Text; facts: Record<string, string | null> };
type Revision = {
  id: number; businessProfileId: number; version: number; status: string; content: Content;
  submittedAt: string | null; decidedAt: string | null; createdAt: string; updatedAt: string;
};

const NOW = '2026-09-14T10:00:00.000Z';
const emptyText = (): Text => ({ tagline: null, description: null, openingHours: null });
const emptyContent = (): Content => ({
  nl: emptyText(), en: emptyText(),
  facts: { websiteUrl: null, phone: null, email: null, address: null, logoUrl: null, coverUrl: null },
});

function installServer(page: Page, options: { initialState?: 'suspended' } = {}) {
  const profile = {
    id: 7, slug: 'bakkerij-e2e', cityId: 'dhg', listingSource: 'openstreetmap', listingId: 'osm-1',
    name: 'Bakkerij E2E', address: null, neighborhood: 'Bezuidenhout', latitude: null, longitude: null,
    sourceUrl: 'https://www.openstreetmap.org/node/1', tagline: 'Legacy tagline', description: 'Legacy description',
    websiteUrl: null, phone: null, email: null, openingHours: null, logoUrl: null, coverUrl: null,
    isClaimed: true, claimedAt: NOW, publicationStatus: options.initialState ?? 'published', approvedRevisionVersion: null as number | null,
    createdAt: NOW, updatedAt: NOW,
  };
  // Existing profiles receive a backfilled approved v1 from their columns.
  const revisions: Revision[] = [{
    id: 1, businessProfileId: 7, version: 1, status: 'approved',
    content: { ...emptyContent(), nl: { tagline: 'Legacy tagline', description: 'Legacy description', openingHours: null } },
    submittedAt: NOW, decidedAt: NOW, createdAt: NOW, updatedAt: NOW,
  }];
  let approvedId: number | null = 1;
  let latestDecision: { decision: string; reason: string | null; targetVersion: number; decidedAt: string } | null =
    options.initialState === 'suspended' ? { decision: 'suspend', reason: 'Klacht ontvangen.', targetVersion: 0, decidedAt: NOW } : null;
  const requests: { method: string; path: string; body: any }[] = [];

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const error = (route: Route, code: string, status: number, extra: Record<string, unknown> = {}) =>
    json(route, { code, messageKey: `errors.${code.toLowerCase()}`, correlationId: 'e2e', ...extra }, status);
  const latest = () => revisions.filter((r) => r.status !== 'discarded' && r.status !== 'superseded').at(-1) ?? null;
  const approved = () => revisions.find((r) => r.id === approvedId) ?? null;
  const state = () => {
    const l = latest();
    if (profile.publicationStatus === 'suspended') return 'suspended';
    if (l?.status === 'draft') return 'draft';
    if (l?.status === 'submitted') return 'submitted';
    if (l?.status === 'changes_requested') return 'changes_requested';
    if (!approved()) return 'unknown';
    return profile.publicationStatus === 'published' ? 'published' : profile.publicationStatus === 'unpublished' ? 'unpublished' : 'approved';
  };
  const workspace = () => ({
    profile: { ...profile, approvedRevisionVersion: approved()?.version ?? null },
    role: 'owner',
    state: state(),
    latestRevision: latest(),
    approvedRevision: approved(),
    latestDecision,
    factChecks: [],
    freshness: { status: 'unverified', checkedOn: null },
  });

  // Reviewer actions the test triggers directly (the moderation UI needs a Clerk editor session).
  const reviewer = {
    requestChanges(reason: string) {
      const l = latest()!;
      l.status = 'changes_requested';
      l.decidedAt = NOW;
      latestDecision = { decision: 'request_changes', reason, targetVersion: l.version, decidedAt: NOW };
    },
    approve() {
      const l = latest()!;
      l.status = 'approved';
      l.decidedAt = NOW;
      approvedId = l.id;
      latestDecision = { decision: 'approve', reason: null, targetVersion: l.version, decidedAt: NOW };
    },
    bumpVersionBehindOwner() {
      const l = latest()!;
      l.version += 1;
    },
  };

  const install = async () => {
    await page.route(/\/api\/business-profiles\/7\/revision(\/submit|\/discard)?$/, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postData() ? request.postDataJSON() : null;
      requests.push({ method: request.method(), path, body });
      const l = latest();
      const current = l?.version ?? 0;
      if (request.method() === 'GET') return json(route, workspace());
      if (body.expectedVersion !== current) return error(route, 'VERSION_CONFLICT', 409, { expectedVersion: current });
      if (path.endsWith('/submit')) {
        if (!l || l.status !== 'draft') return error(route, 'VERSION_CONFLICT', 409, { fieldErrors: [{ field: 'status', code: 'not_submittable' }] });
        if (!l.content.nl.description && !l.content.nl.tagline) return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'nl.description', code: 'required' }] });
        l.status = 'submitted';
        l.submittedAt = NOW;
        return json(route, workspace());
      }
      if (path.endsWith('/discard')) {
        if (l) l.status = 'discarded';
        return json(route, workspace());
      }
      // PATCH
      if (l?.status === 'submitted') return error(route, 'VERSION_CONFLICT', 409, { fieldErrors: [{ field: 'status', code: 'not_editable' }] });
      if (body.facts?.websiteUrl && !/^https?:\/\//.test(body.facts.websiteUrl)) {
        return error(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'facts.websiteUrl', code: 'invalid_url' }] });
      }
      const base = l ? l.content : emptyContent();
      const content: Content = JSON.parse(JSON.stringify(base));
      for (const lang of ['nl', 'en'] as const) {
        for (const [key, value] of Object.entries(body[lang] ?? {})) (content[lang] as any)[key] = (value as string).trim() || null;
      }
      for (const [key, value] of Object.entries(body.facts ?? {})) content.facts[key] = (value as string).trim() || null;
      if (l?.status === 'draft') {
        l.content = content;
        l.updatedAt = new Date().toISOString();
      } else {
        revisions.push({
          id: revisions.length + 1, businessProfileId: 7, version: current + 1, status: 'draft', content,
          submittedAt: null, decidedAt: null, createdAt: NOW, updatedAt: new Date().toISOString(),
        });
      }
      return json(route, workspace());
    });
    await page.route('**/api/business-profiles/public/bakkerij-e2e', (route) => {
      if (profile.publicationStatus !== 'published') return error(route, 'NOT_FOUND', 404);
      const a = approved();
      return json(route, {
        ...profile,
        tagline: a ? a.content.nl.tagline : profile.tagline,
        description: a ? a.content.nl.description : profile.description,
        openingHours: a ? a.content.nl.openingHours : profile.openingHours,
        approvedRevisionVersion: a?.version ?? null,
        content: a ? a.content : null,
        provenance: a
          ? { listingSource: 'openstreetmap', sourceUrl: profile.sourceUrl, approvedVersion: a.version, approvedAt: NOW, freshness: { status: 'unverified', checkedOn: null }, checks: [] }
          : null,
        deals: [],
      });
    });
    await page.route('**/api/business-profiles/7/deals**', (route) => json(route, []));
  };

  return { install, requests, reviewer, profile, revisions };
}

async function signIn(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: 'owner-e2e' };
    if (!window.sessionStorage.getItem('e2e-language-set')) window.localStorage.setItem('buurtplaza-language', 'nl');
  });
}

test.describe('business review publication', () => {
  test('owner drafts, submits, receives changes, resubmits; public page only shows approved content', async ({ page }) => {
    await signIn(page);
    const server = installServer(page);
    await server.install();

    await page.goto('/mijn-bedrijf/7/profiel?e2eAccountAuth=1');
    await expect(page.getByTestId('owner-state')).toHaveText('Gepubliceerd');
    // The editor starts from the existing profile values rather than a blank form.
    await expect(page.locator('#nl-tagline')).toHaveValue('Legacy tagline');
    await expect(page.locator('#nl-description')).toHaveValue('Legacy description');

    // Unsafe URL is refused and highlighted, nothing is stored.
    await page.getByLabel('Website').fill('javascript:alert(1)');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('error-websiteUrl')).toBeVisible();
    expect(server.revisions).toHaveLength(1);

    await page.getByLabel('Website').fill('https://bakkerij.example');
    await page.locator('#nl-tagline').fill('Verse broodjes');
    await page.locator('#nl-description').fill('Bakkerij in Bezuidenhout sinds 1990.');
    await page.locator('#en-tagline').fill('Fresh rolls');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('owner-state')).toHaveText('Concept');
    expect(server.revisions[1].version).toBe(2);
    expect(server.revisions[1].content.nl.description).toBe('Bakkerij in Bezuidenhout sinds 1990.');
    expect(server.revisions[1].content.en.description).toBeNull();
    expect(server.revisions[0].content.nl.tagline).toBe('Legacy tagline');

    // Draft is private: public page still shows the approved v1 snapshot.
    await page.goto('/bedrijf/bakkerij-e2e');
    await expect(page.getByTestId('public-tagline')).toHaveText('Legacy tagline');
    await expect(page.getByTestId('public-provenance')).toContainText('goedgekeurde versie v1');
    await expect(page.getByText('Verse broodjes')).toHaveCount(0);

    // Resume the draft after a reload, then submit.
    await page.goto('/mijn-bedrijf/7/profiel?e2eAccountAuth=1');
    await expect(page.locator('#nl-tagline')).toHaveValue('Verse broodjes');
    await page.getByTestId('submit-revision').click();
    await expect(page.getByTestId('owner-state')).toHaveText('Ingediend voor controle');
    await expect(page.getByTestId('editor-locked')).toBeVisible();
    await expect(page.locator('#nl-tagline')).toBeDisabled();

    // Reviewer asks for changes; owner sees the note and can edit a new version.
    server.reviewer.requestChanges('Voeg openingstijden toe.');
    await page.reload();
    await expect(page.getByTestId('owner-state')).toHaveText('Wijzigingen gevraagd');
    await expect(page.getByTestId('reviewer-note')).toContainText('Voeg openingstijden toe.');
    await page.locator('#nl-openingHours').fill('ma-vr 08:00-18:00');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('owner-state')).toHaveText('Concept');
    expect(server.revisions).toHaveLength(3);
    expect(server.revisions[2].version).toBe(3);
    expect(server.revisions[2].content.nl.description).toBe('Bakkerij in Bezuidenhout sinds 1990.');
    await page.getByTestId('submit-revision').click();
    await expect(page.getByTestId('owner-state')).toHaveText('Ingediend voor controle');

    // Approval → published state; public page renders the approved snapshot with provenance.
    server.reviewer.approve();
    await page.reload();
    await expect(page.getByTestId('owner-state')).toHaveText('Gepubliceerd');
    await page.goto('/bedrijf/bakkerij-e2e');
    await expect(page.getByTestId('public-tagline')).toHaveText('Verse broodjes');
    await expect(page.getByTestId('public-opening-hours')).toHaveText('ma-vr 08:00-18:00');
    await expect(page.getByTestId('public-provenance')).toContainText('goedgekeurde versie v3');
    await expect(page.getByTestId('public-freshness')).toHaveText('Feiten nog niet gecontroleerd');

    // English falls back per field; the missing English description is never invented.
    await page.evaluate(() => {
      window.sessionStorage.setItem('e2e-language-set', '1');
      window.localStorage.setItem('buurtplaza-language', 'en');
    });
    await page.reload();
    await expect(page.getByTestId('public-tagline')).toHaveText('Fresh rolls');
    await expect(page.getByTestId('public-description')).toContainText('Bakkerij in Bezuidenhout sinds 1990.');
    await expect(page.getByTestId('public-freshness')).toHaveText('Facts not checked yet');
  });

  test('stale saves surface a conflict and reload the newest version', async ({ page }) => {
    await signIn(page);
    const server = installServer(page);
    await server.install();
    await page.goto('/mijn-bedrijf/7/profiel?e2eAccountAuth=1');
    await page.locator('#nl-tagline').fill('Eerste concept');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('owner-state')).toHaveText('Concept');

    server.reviewer.bumpVersionBehindOwner();
    await page.locator('#nl-tagline').fill('Tweede poging');
    await page.getByTestId('save-draft').click();
    await expect(page.getByText('Iemand anders heeft dit profiel intussen gewijzigd.', { exact: false })).toBeVisible();
    const conflicting = server.requests.filter((r) => r.method === 'PATCH');
    expect(conflicting.at(-1)?.body.expectedVersion).toBe(2);
    expect(server.revisions[1].content.nl.tagline).toBe('Eerste concept');
  });

  test('suspended businesses are locked for the owner and hidden publicly', async ({ page }) => {
    await signIn(page);
    const server = installServer(page, { initialState: 'suspended' });
    await server.install();
    await page.goto('/mijn-bedrijf/7/profiel?e2eAccountAuth=1');
    await expect(page.getByTestId('owner-state')).toHaveText('Geschorst');
    await expect(page.getByTestId('reviewer-note')).toContainText('Klacht ontvangen.');
    await expect(page.locator('#nl-tagline')).toBeDisabled();
    await page.goto('/bedrijf/bakkerij-e2e');
    await expect(page.getByTestId('public-tagline')).toHaveCount(0);
    await expect(page.getByText('Bakkerij E2E')).toHaveCount(0);
  });
});

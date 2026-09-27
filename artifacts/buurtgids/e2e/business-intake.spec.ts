import { expect, test, type Page, type Route } from '@playwright/test';

type Claim = {
  id: number; businessProfileId: number; claimantId: string; contactName: string; contactEmail: string;
  relationship: string; authorityDeclaration: string; evidenceReference: string | null; evidenceUrl: null;
  message: string | null; status: string; reviewNote: string | null; version: number; nextAction: string;
  kind: 'existing_listing' | 'new_business'; withdrawnAt: string | null; reviewedAt: null;
  createdAt: string; updatedAt: string; profile: Record<string, unknown>;
};
type RequestRecord = { method: string; path: string; body: any; headers: Record<string, string> };

async function signIn(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: 'business-e2e' };
  });
}

async function installServer(page: Page, options: { duplicateNewBusiness?: boolean } = {}) {
  const requests: RequestRecord[] = [];
  const claims = new Map<number, Claim>();
  let nextId = 1;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const record = (route: Route) => {
    const request = route.request();
    requests.push({
      method: request.method(), path: new URL(request.url()).pathname,
      body: request.postData() ? request.postDataJSON() : null, headers: request.headers(),
    });
  };
  const makeClaim = (body: any): Claim => {
    const now = '2026-10-01T12:00:00.000Z';
    const id = nextId++;
    return {
      id, businessProfileId: id, claimantId: 'business-e2e', contactName: body.contactName,
      contactEmail: body.contactEmail, relationship: body.relationship, relationshipKind: body.relationshipKind ?? null,
      authorityDeclaration: body.authorityDeclaration, evidenceReference: body.evidenceReference ?? null,
      evidenceUrl: null, message: body.message ?? null, status: 'draft', reviewNote: null,
      version: 1, nextAction: 'submit', kind: body.kind, withdrawnAt: null, reviewedAt: null,
      createdAt: now, updatedAt: now,
      profile: {
        id, slug: `draft-${id}`, cityId: body.listing?.cityId ?? 'dhg',
        name: body.business?.name ?? 'Koffie om de Hoek', address: body.business?.address ?? 'Prinsestraat 1',
        neighborhood: body.business?.neighborhood ?? 'Centrum', category: body.business?.category ?? 'Horeca',
        subcategory: body.business?.subcategory ?? null, phone: body.business?.phone ?? null, geographyBasis: null,
        websiteUrl: body.business?.websiteUrl ?? null, isClaimed: false, publicationStatus: body.kind === 'new_business' ? 'draft' : 'published',
        createdAt: now, updatedAt: now,
      },
    };
  };
  await page.route('**/api/businesses/lookup*', (route) => {
    record(route);
    return json(route, {
      query: new URL(route.request().url()).searchParams.get('q'),
      matches: [{ kind: 'listing', cityId: 'dhg', listingSource: 'google_maps', listingId: 'place-7', name: 'Koffie om de Hoek', neighborhood: 'Centrum', category: 'Horeca', sourceUrl: 'https://example.test', isClaimed: false }],
      truncated: false,
    });
  });
  await page.route('**/api/businesses', (route) => {
    record(route);
    if (!route.request().headers().authorization?.startsWith('Bearer e2e-token:')) {
      return json(route, { code: 'AUTH_REQUIRED', messageKey: 'errors.auth_required', correlationId: 'e2e' }, 401);
    }
    const claim = makeClaim(route.request().postDataJSON());
    claims.set(claim.id, claim);
    return json(route, claim, 201);
  });
  await page.route('**/api/business-claims/**', (route) => {
    record(route);
    const request = route.request();
    const parts = new URL(request.url()).pathname.split('/');
    const id = Number(parts[parts.indexOf('business-claims') + 1]);
    const claim = claims.get(id);
    if (!claim) return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
    if (request.method() === 'GET') return json(route, claim);
    const body = request.postDataJSON();
    if (body.expectedVersion !== claim.version) return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', expectedVersion: claim.version }, 409);
    if (request.method() === 'PATCH') {
      Object.assign(claim, body, { version: claim.version + 1 });
      delete (claim as any).expectedVersion;
      if (body.business) Object.assign(claim.profile, body.business);
      return json(route, claim);
    }
    if (parts.at(-1) === 'submit' && options.duplicateNewBusiness && claim.kind === 'new_business' && body.confirmNoDuplicate !== true) {
      return json(route, {
        code: 'DUPLICATE_CANDIDATES',
        messageKey: 'errors.duplicate_candidates',
        correlationId: 'e2e',
        duplicateCandidates: [{
          kind: 'listing',
          cityId: 'dhg',
          listingSource: 'google_maps',
          listingId: 'possible-42',
          name: 'Studio Zee Bestaand',
          neighborhood: 'Zeeheldenkwartier',
          category: 'Dienstverlening',
          sourceUrl: 'https://example.test/studio',
          isClaimed: true,
        }],
      }, 409);
    }
    if (parts.at(-1) === 'submit') Object.assign(claim, { status: 'submitted', nextAction: 'wait_for_review', version: claim.version + 1 });
    if (parts.at(-1) === 'withdraw') Object.assign(claim, { status: 'withdrawn', nextAction: 'none', withdrawnAt: '2026-10-01T13:00:00.000Z', version: claim.version + 1 });
    return json(route, claim);
  });
  return { requests, claims };
}

async function fillCommon(page: Page) {
  await page.getByLabel(/Jouw naam|Your name/).fill('Sam Ondernemer');
  await page.getByLabel(/Zakelijk e-mailadres|Business e-mail/).fill('sam@example.nl');
  await page.getByTestId('select-relationship-kind').selectOption('owner');
  await page.getByLabel(/Jouw relatie|Your relationship/).fill('Eigenaar');
  await page.getByLabel(/Verklaring van bevoegdheid|Authority declaration/).fill('Ik ben de geregistreerde eigenaar van deze onderneming.');
}

test.describe('business intake', () => {
  test('claim editor keeps the selected language and exposes its language selector', async ({ page }) => {
    await signIn(page);
    await installServer(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('buurtplaza-language', 'nl');
    });

    await page.goto('/bedrijf-nieuw?kind=existing_listing&cityId=dhg&listingSource=openstreetmap&listingId=place-7&locale=en&e2eAccountAuth=1');
    await expect(page.getByTestId('page-business-draft')).toContainText('Claim or add a business');
    await expect(page.getByTestId('button-language-en')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-language-nl')).toBeVisible();
    await expect(page).toHaveURL(/locale=en/);

    await page.getByTestId('button-language-nl').click();
    await expect(page.getByTestId('page-business-draft')).toContainText('Bedrijf claimen of toevoegen');
    await expect(page.getByTestId('button-language-nl')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/locale=nl/);

    await page.reload();
    await expect(page.getByTestId('page-business-draft')).toContainText('Bedrijf claimen of toevoegen');
    await expect(page.getByTestId('button-language-nl')).toHaveAttribute('aria-pressed', 'true');
  });

  test('lookup, existing-listing draft resume, submit receipt, and withdraw', async ({ page }) => {
    await signIn(page);
    const server = await installServer(page);
    await page.goto('/bedrijf-zoeken?e2eAccountAuth=1');
    await page.getByTestId('input-business-search').fill('Koffie');
    await expect(page.getByText('Koffie om de Hoek')).toBeVisible();
    await page.getByRole('button', { name: /Dit bedrijf claimen|Claim this business/ }).click();
    await fillCommon(page);
    await page.getByRole('button', { name: /Concept opslaan|Save draft/ }).click();
    await expect(page).toHaveURL(/bedrijf-nieuw\?claim=1/);

    const create = server.requests.find((item) => item.method === 'POST' && item.path === '/api/businesses');
    expect(create?.headers['idempotency-key']).toBeTruthy();
    expect(create?.body.listing).toEqual({ cityId: 'dhg', listingSource: 'google_maps', listingId: 'place-7' });
    expect(create?.body.listing.name).toBeUndefined();
    await page.reload();
    await expect(page.getByLabel(/Jouw naam|Your name/)).toHaveValue('Sam Ondernemer');
    await page.getByRole('button', { name: /Indienen voor beoordeling|Submit for review/ }).click();
    await expect(page.getByTestId('business-claim-receipt')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Aanvraag intrekken|Withdraw application/ }).click();
    await expect(page.getByText(/Deze aanvraag is ingetrokken|This application has been withdrawn/)).toBeVisible();
  });

  test('creates a private new-business draft and explicitly resolves duplicate candidates', async ({ page }) => {
    await signIn(page);
    const server = await installServer(page, { duplicateNewBusiness: true });
    await page.goto('/bedrijf-nieuw?kind=new_business&context=account_home&terug=%2Faccount&e2eAccountAuth=1');
    // BPROF-005: each field says whether it becomes public.
    await expect(page.getByLabel(/Bedrijfsnaam|Business name/)).toBeVisible();
    await expect(page.getByText(/^openbaar$|^public$/).first()).toBeVisible();
    await expect(page.getByText(/^niet openbaar$|^not public$/).first()).toBeVisible();
    await page.getByTestId('input-business-name').fill('Studio Zee');
    await page.getByTestId('select-business-category').selectOption('Food & Drink');
    await page.getByTestId('select-business-subcategory').selectOption('cafe');
    await page.getByTestId('select-business-neighborhood').selectOption('Zeeheldenkwartier');
    await page.getByTestId('input-business-address').fill('Prins Hendrikstraat 1, 2518 HH');
    await page.getByTestId('input-business-phone').fill('070 123 4567');
    await fillCommon(page);
    await page.getByRole('button', { name: /Concept opslaan|Save draft/ }).click();
    await expect(page).toHaveURL(/bedrijf-nieuw\?claim=1/);
    expect(server.requests.find((item) => item.path === '/api/businesses')?.body.business).toEqual({
      name: 'Studio Zee', category: 'Food & Drink', subcategory: 'cafe', neighborhood: 'Zeeheldenkwartier',
      address: 'Prins Hendrikstraat 1, 2518 HH', websiteUrl: null, phone: '070 123 4567',
    });

    await page.getByRole('button', { name: /Indienen voor beoordeling|Submit for review/ }).click();
    const panel = page.getByTestId('duplicate-candidates-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Studio Zee Bestaand')).toBeVisible();
    await expect(panel.getByRole('heading')).toBeFocused();
    const claimInstead = panel.getByRole('link', { name: /Claim deze vermelding|Claim this listing/ });
    const href = await claimInstead.getAttribute('href');
    expect(href).toContain('kind=existing_listing');
    expect(href).toContain('cityId=dhg');
    expect(href).toContain('listingSource=google_maps');
    expect(href).toContain('listingId=possible-42');
    // The journey origin and return path travel along when the representative claims a candidate instead.
    expect(href).toContain('context=account_home');
    expect(href).toContain('terug=%2Faccount');
    expect(href).not.toMatch(/name=|address=/);

    await panel.getByRole('button', { name: /Annuleren|Cancel/ }).click();
    await expect(panel).toHaveCount(0);
    expect(server.claims.get(1)?.status).toBe('draft');

    await page.getByRole('button', { name: /Indienen voor beoordeling|Submit for review/ }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /Ja, mijn bedrijf is nieuw|Yes, my business is new/ }).click();
    await expect(page.getByTestId('business-claim-receipt')).toBeVisible();
    await expect(page.getByTestId('business-claim-receipt')).toContainText(/Ingediend|Submitted/);
    const submitRequests = server.requests.filter((item) => item.path.endsWith('/submit'));
    expect(submitRequests.at(-1)?.body).toEqual({
      expectedVersion: server.claims.get(1)!.version - 1,
      confirmNoDuplicate: true,
    });
  });

  test('anonymous claim URLs redirect before private data is fetched', async ({ page }) => {
    const server = await installServer(page);
    await page.goto('/bedrijf-nieuw?claim=1&e2eAccountAuth=1');
    await expect(page).toHaveURL(/\/sign-in\?terug=/);
    expect(server.requests.some((item) => item.path.includes('/business-claims/1'))).toBe(false);
    await expect(page.getByTestId('page-business-draft')).toHaveCount(0);
  });

  test('lookup works with keyboard only', async ({ page }) => {
    await signIn(page);
    await installServer(page);
    await page.goto('/bedrijf-zoeken?e2eAccountAuth=1');
    for (let i = 0; i < 10; i += 1) {
      if (await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'input-business-search')) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.type('Koffie');
    await expect(page.getByText('Koffie om de Hoek')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/bedrijf-nieuw\?kind=existing_listing/);
  });
});
test.describe('business onboarding journey (v0.5.2)', () => {
  test('lookup carries the journey context and return path; the draft records the context, role and evidence; the receipt leads back', async ({ page }) => {
    await signIn(page);
    const server = await installServer(page);
    await page.addInitScript(() => window.localStorage.setItem('buurtplaza-language', 'nl'));

    const back = '/account/bedrijf/toevoegen?context=account_home';
    await page.goto(`/bedrijf-zoeken?context=account_home&terug=${encodeURIComponent(back)}&e2eAccountAuth=1`);
    const steps = page.getByTestId('business-journey-steps');
    await expect(steps).toBeVisible();
    await expect(steps.locator('[aria-current="step"]')).toHaveText(/Bedrijf zoeken/);
    await expect(page.getByRole('link', { name: 'Mijn bedrijf staat er niet bij' }).first()).toHaveAttribute('href', /kind=new_business&context=account_home&terug=%2Faccount%2Fbedrijf%2Ftoevoegen%3Fcontext%3Daccount_home/);

    await page.getByTestId('input-business-search').fill('Koffie');
    await page.getByRole('button', { name: 'Dit bedrijf claimen' }).click();
    await expect(page).toHaveURL(/\/bedrijf-nieuw\?kind=existing_listing.*context=account_home.*terug=/);
    await expect(page.getByTestId('business-journey-steps').locator('[aria-current="step"]')).toHaveText(/Gegevens en bevoegdheid/);

    await fillCommon(page);
    await page.getByTestId('select-relationship-kind').selectOption('manager');
    await page.getByTestId('input-evidence-kvk').fill('1234');
    await page.getByRole('button', { name: 'Indienen voor beoordeling' }).click();
    await expect(page.getByText('Een KvK-nummer bestaat uit precies 8 cijfers.')).toBeVisible();
    expect(server.requests.filter((item) => item.method === 'POST' && item.path === '/api/businesses')).toHaveLength(0);

    await page.getByTestId('input-evidence-kvk').fill('12345678');
    await page.getByTestId('input-evidence-domain').fill('Koffie-Hoek.nl');
    await expect(page.getByTestId('text-authority-confirm')).toContainText('verklaar je dat je bevoegd bent');
    await page.getByRole('button', { name: 'Indienen voor beoordeling' }).click();

    await expect(page.getByTestId('business-claim-receipt')).toBeVisible();
    const create = server.requests.find((item) => item.method === 'POST' && item.path === '/api/businesses');
    expect(create?.body).toMatchObject({
      kind: 'existing_listing', relationshipKind: 'manager', relationship: 'Eigenaar',
      evidenceKvk: '12345678', evidenceDomain: 'koffie-hoek.nl', onboardingContext: 'account_home',
    });
    expect(create?.body).not.toHaveProperty('name');
    await expect(page.getByTestId('business-journey-steps').locator('[aria-current="step"]')).toHaveText(/Controle/);
    await expect(page.getByTestId('link-journey-return')).toHaveAttribute('href', back);
  });

  test('without a journey context the intake works as before: no steps, no context field, role label used as relationship', async ({ page }) => {
    await signIn(page);
    const server = await installServer(page);
    await page.addInitScript(() => window.localStorage.setItem('buurtplaza-language', 'nl'));
    await page.goto('/bedrijf-nieuw?kind=existing_listing&cityId=dhg&listingSource=google_maps&listingId=place-7&e2eAccountAuth=1');
    await expect(page.getByTestId('business-journey-steps')).toHaveCount(0);
    await page.getByLabel(/Jouw naam/).fill('Sam Ondernemer');
    await page.getByLabel(/Zakelijk e-mailadres/).fill('sam@example.nl');
    await page.getByLabel(/Verklaring van bevoegdheid/).fill('Ik ben de geregistreerde eigenaar van deze onderneming.');
    // The role is never pre-selected on the claimant's behalf.
    await page.getByRole('button', { name: 'Concept opslaan' }).click();
    await expect(page.getByText('Kies je rol voordat je opslaat.')).toBeVisible();
    await page.getByTestId('select-relationship-kind').selectOption('owner');
    await page.getByRole('button', { name: 'Concept opslaan' }).click();
    await expect(page.getByText('Concept opgeslagen')).toBeVisible();
    const create = server.requests.find((item) => item.method === 'POST' && item.path === '/api/businesses');
    expect(create?.body).toMatchObject({ relationshipKind: 'owner', relationship: 'Eigenaar' });
    expect(create?.body).not.toHaveProperty('onboardingContext');
    expect(create?.body).not.toHaveProperty('evidenceKvk');
  });
});

import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * v0.5.2 business onboarding entry points (BENT-001 – BENT-005, BOPS-001).
 * The intent is only ever the allow-listed business-step path; the step
 * requires a session, asks the server to confirm the reference, and explains
 * the profile / visibility / separation before anything is asked.
 */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const BUSINESS_STEP = '/account/bedrijf/toevoegen';

async function signIn(page: Page, userId = 'user-e2e') {
  await page.addInitScript((id) => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: id };
  }, userId);
}

function stubIntent(page: Page, options: { disabled?: boolean } = {}) {
  const calls: unknown[] = [];
  const handler = (route: Route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (options.disabled) return json(route, { code: 'FEATURE_DISABLED', messageKey: 'errors.feature_disabled', correlationId: 'e2e' }, 404);
    const allowed = new Set(['registration', 'account_home', 'listing']);
    if (!allowed.has(body.context)) {
      return json(route, { code: 'VALIDATION_FAILED', messageKey: 'errors.validation_failed', correlationId: 'e2e', fieldErrors: [{ field: 'context', code: 'invalid' }] }, 400);
    }
    const parts = [body.cityId, body.listingSource, body.listingId].filter((v) => v !== undefined).length;
    if ((parts > 0 && parts < 3) || (body.listingId && /\s/.test(body.listingId))) {
      return json(route, { code: 'VALIDATION_FAILED', messageKey: 'errors.validation_failed', correlationId: 'e2e', fieldErrors: [{ field: 'listingId', code: 'invalid' }] }, 400);
    }
    const params = new URLSearchParams({ context: body.context });
    if (body.listingSource) {
      params.set('cityId', body.cityId);
      params.set('listingSource', body.listingSource);
      params.set('listingId', body.listingId);
    }
    return json(route, { context: body.context, returnRef: `${BUSINESS_STEP}?${params.toString()}` });
  };
  return { calls, install: () => page.route('**/api/business-onboarding/intent', handler) };
}

async function stubAccount(page: Page) {
  await page.route('**/api/account/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/account/me')) {
      return json(route, {
        userId: 'user-e2e', email: 'e2e@example.com', role: 'consumer', status: 'active', locale: 'nl',
        onboardingCompleted: true, onboardingCompletedAt: '2026-09-01T10:00:00.000Z', preferences: null,
        capabilities: { isVerified: true, canParticipate: true, canReview: false, canModerate: false },
      });
    }
    if (path.endsWith('/account/options')) return json(route, { neighborhoods: [], interests: [] });
    if (path.endsWith('/account/consents')) return json(route, { currentNoticeVersion: '2026-09', purposes: [], current: [], history: [] });
    return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
  });
  await page.route('**/api/registration', (route) => json(route, { registered: false, registration: null }));
}

test.describe('business onboarding entry points (v0.5.2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('buurtplaza-language')) localStorage.setItem('buurtplaza-language', 'nl');
    });
  });

  test('registration offers the business choice and carries it only as the business-step return path', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route('**/api/consumer-registration', (route) => {
      bodies.push(route.request().postDataJSON());
      return json(route, { status: 'pending', linkLifetimeMinutes: 30 });
    });
    await page.goto('/account/register');
    const choice = page.getByTestId('checkbox-register-business-intent');
    await expect(choice).not.toBeChecked();
    await choice.check();
    await page.getByTestId('input-register-name').fill('Noor Bakker');
    await page.getByTestId('input-register-email').fill('noor@example.com');
    await page.getByTestId('input-register-phone').fill('0612345678');
    await page.getByTestId('button-register-submit').click();
    await expect(page).toHaveURL(/\/account\/register\/check-email$/);
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { returnRef: string }).returnRef).toBe(`${BUSINESS_STEP}?context=registration`);
    expect(JSON.stringify(bodies[0])).not.toContain('businessIntent');
  });

  test('arriving at registration with the business return path preselects the choice; unchecking drops it', async ({ page }) => {
    await page.goto(`/account/register?terug=${encodeURIComponent(`${BUSINESS_STEP}?context=registration`)}`);
    await expect(page.getByTestId('checkbox-register-business-intent')).toBeChecked();
    await page.getByTestId('checkbox-register-business-intent').uncheck();
    await expect(page.getByTestId('link-account-back')).toHaveAttribute('href', /\/$/);
  });

  test('the sign-up frame offers the business entry and confirms it once carried', async ({ page }) => {
    await page.goto('/sign-up');
    const link = page.getByTestId('link-sign-up-business-intent');
    await expect(link).toHaveText('Ik vertegenwoordig een bedrijf');
    await link.click();
    await expect(page).toHaveURL(/\/sign-up\?terug=%2Faccount%2Fbedrijf%2Ftoevoegen%3Fcontext%3Dregistration$/);
    await expect(page.getByTestId('status-sign-up-business-intent')).toHaveText('Na het aanmaken van je account ga je door naar het toevoegen van je bedrijf.');
    await expect(link).toHaveCount(0);
  });

  test('the business step requires a session and returns to itself with its query intact', async ({ page }) => {
    await page.goto(`${BUSINESS_STEP}?context=account_home`);
    await expect(page).toHaveURL(/\/sign-in\?terug=%2Faccount%2Fbedrijf%2Ftoevoegen%3Fcontext%3Daccount_home$/);
  });

  test('account home links to the business step; the step confirms the intent server-side and explains before asking', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    const intent = stubIntent(page);
    await intent.install();
    await page.goto('/account?e2eAccountAuth=1');
    const link = page.getByTestId('link-account-add-business');
    await expect(link).toHaveAttribute('href', new RegExp(`${BUSINESS_STEP.replace(/\//g, '\\/')}\\?context=account_home$`));
    await link.click();
    await expect(page.getByTestId('heading-business-onboarding')).toHaveText('Je bedrijf toevoegen aan Buurtplaza');
    await expect(page.getByTestId('explain-what')).toContainText('Wat is een bedrijfsprofiel?');
    await expect(page.getByTestId('explain-who')).toContainText('Wie ziet wat?');
    await expect(page.getByTestId('explain-separate')).toContainText('Je persoonlijke account blijft apart');
    await expect(page.getByTestId('status-business-resume')).toHaveCount(0);
    const start = page.getByTestId('button-business-start');
    await expect(start).not.toHaveAttribute('aria-disabled', 'true');
    await expect(start).toHaveAttribute('href', /\/bedrijf-zoeken\?terug=%2Faccount%2Fbedrijf%2Ftoevoegen%3Fcontext%3Daccount_home$/);
    expect(intent.calls).toEqual([{ context: 'account_home' }]);
    // No personal data in the intent call or the URL.
    expect(page.url()).not.toMatch(/e2e@example|user-e2e/);
  });

  test('a registration intent resumed after verification shows the resume notice; reloading repeats no write', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    const intent = stubIntent(page);
    await intent.install();
    await page.goto(`${BUSINESS_STEP}?context=registration&e2eAccountAuth=1`);
    await expect(page.getByTestId('status-business-resume')).toHaveText('Je bent teruggekomen bij het toevoegen van je bedrijf. Er is nog niets opgeslagen.');
    await page.reload();
    await expect(page.getByTestId('status-business-resume')).toBeVisible();
    expect(intent.calls.every((call) => JSON.stringify(call) === JSON.stringify({ context: 'registration' }))).toBe(true);
  });

  test('an unclaimed public listing offers "is this your business?" carrying only the listing key', async ({ page }) => {
    await page.route('**/api/business-profiles/public/kapper-e2e', (route) =>
      json(route, {
        id: 41, slug: 'kapper-e2e', cityId: 'dhg', listingSource: 'google_maps', listingId: 'ChIJ-kapper', name: 'Kapper E2E', address: null, neighborhood: null, latitude: null, longitude: null,
        sourceUrl: null, tagline: null, description: null, websiteUrl: null, phone: null, email: null, openingHours: null,
        logoUrl: null, coverUrl: null, isClaimed: false, claimedAt: null, publicationStatus: 'published', approvedRevisionVersion: null,
        content: null, provenance: null, deals: [], createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      }),
    );
    await page.route('**/api/business-profiles/41/deals**', (route) => json(route, []));
    await page.goto('/bedrijf/kapper-e2e');
    const link = page.getByTestId('link-listing-claim-intent');
    await expect(link).toHaveText('Is dit jouw bedrijf?');
    await expect(link).toHaveAttribute('href', /\/account\/bedrijf\/toevoegen\?context=listing&cityId=dhg&listingSource=google_maps&listingId=ChIJ-kapper$/);
    await link.click();
    await expect(page).toHaveURL(/\/sign-in\?terug=%2Faccount%2Fbedrijf%2Ftoevoegen%3Fcontext%3Dlisting%26cityId%3Ddhg%26listingSource%3Dgoogle_maps%26listingId%3DChIJ-kapper$/);
  });

  test('a claimed listing shows no claim entry', async ({ page }) => {
    await page.route('**/api/business-profiles/public/claimed-e2e', (route) =>
      json(route, {
        id: 42, slug: 'claimed-e2e', cityId: 'dhg', listingSource: 'google_maps', listingId: 'ChIJ-claimed', name: 'Claimed E2E', address: null, neighborhood: null, latitude: null, longitude: null,
        sourceUrl: null, tagline: null, description: null, websiteUrl: null, phone: null, email: null, openingHours: null,
        logoUrl: null, coverUrl: null, isClaimed: true, claimedAt: '2026-09-01T10:00:00.000Z', publicationStatus: 'published', approvedRevisionVersion: null,
        content: null, provenance: null, deals: [], createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      }),
    );
    await page.route('**/api/business-profiles/42/deals**', (route) => json(route, []));
    await page.goto('/bedrijf/claimed-e2e');
    await expect(page.getByRole('heading', { name: 'Claimed E2E', exact: true })).toBeVisible();
    await expect(page.getByTestId('link-listing-claim-intent')).toHaveCount(0);
  });

  test('a tampered listing reference is dropped by the server check; the step still opens', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    const intent = stubIntent(page);
    await intent.install();
    await page.goto(`${BUSINESS_STEP}?context=listing&cityId=dhg&listingSource=google_maps&listingId=${encodeURIComponent('41 OR 1=1')}&e2eAccountAuth=1`);
    await expect(page.getByTestId('button-business-start')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('status-business-listing')).toHaveCount(0);
    expect(intent.calls).toHaveLength(2);
    expect(intent.calls[1]).toEqual({ context: 'listing' });
    await expect(page.getByTestId('error-business-intent')).toHaveCount(0);
  });

  test('a confirmed listing intent hands over to the existing-listing intake step with the listing key', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    const intent = stubIntent(page);
    await intent.install();
    await page.goto(`${BUSINESS_STEP}?context=listing&cityId=dhg&listingSource=google_maps&listingId=ChIJ-kapper&e2eAccountAuth=1`);
    await expect(page.getByTestId('status-business-listing')).toBeVisible();
    await expect(page.getByTestId('button-business-start')).toHaveAttribute(
      'href',
      /\/bedrijf-nieuw\?kind=existing_listing&cityId=dhg&listingSource=google_maps&listingId=ChIJ-kapper&terug=/,
    );
    expect(intent.calls).toEqual([{ context: 'listing', cityId: 'dhg', listingSource: 'google_maps', listingId: 'ChIJ-kapper' }]);
  });

  test('changing the intent in place drops the previous confirmation until the new one is answered', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    let release: (() => void) | null = null;
    let delayNext = false;
    await page.route('**/api/business-onboarding/intent', async (route) => {
      const body = route.request().postDataJSON();
      if (delayNext) await new Promise<void>((resolve) => { release = resolve; });
      const params = new URLSearchParams({ context: body.context });
      return json(route, { context: body.context, returnRef: `${BUSINESS_STEP}?${params.toString()}` });
    });
    await page.goto(`${BUSINESS_STEP}?context=account_home&e2eAccountAuth=1`);
    const start = page.getByTestId('button-business-start');
    await expect(start).toHaveAttribute('href', /context%3Daccount_home$/);
    delayNext = true;
    await page.evaluate((path) => history.pushState(null, '', path), `${BUSINESS_STEP}?context=registration`);
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    await expect(start).not.toHaveAttribute('href', /account_home/);
    await expect.poll(() => release !== null).toBe(true);
    release!();
    await expect(start).not.toHaveAttribute('aria-disabled', 'true');
    await expect(start).toHaveAttribute('href', /context%3Dregistration$/);
    await expect(page.getByTestId('status-business-resume')).toBeVisible();
  });

  test('when the server gate is closed the step explains it is not open yet and offers the account', async ({ page }) => {
    await signIn(page);
    await stubAccount(page);
    const intent = stubIntent(page, { disabled: true });
    await intent.install();
    await page.goto(`${BUSINESS_STEP}?context=account_home&e2eAccountAuth=1`);
    await expect(page.getByTestId('status-business-onboarding-unavailable')).toContainText('Bedrijven toevoegen staat nog niet open');
    await expect(page.getByTestId('link-business-back-account')).toHaveAttribute('href', /\/account$/);
    await expect(page.getByTestId('button-business-start')).toHaveCount(0);
  });

  test('the step reads in English when the visitor chose English', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('buurtplaza-language', 'en'));
    await signIn(page);
    await stubAccount(page);
    await stubIntent(page).install();
    await page.goto(`${BUSINESS_STEP}?context=account_home&e2eAccountAuth=1`);
    await expect(page.getByTestId('heading-business-onboarding')).toHaveText('Add your business to Buurtplaza');
    await expect(page.getByTestId('button-business-start')).toHaveText('Start');
  });
});

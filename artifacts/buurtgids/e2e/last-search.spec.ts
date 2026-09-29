import { expect, test } from '@playwright/test';

test('captured search stays private, restores public URL and clears authoritatively', async ({ page }) => {
  const searches = new Map<string, Record<string, unknown>>();
  const puts: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    window.__accountTestAuth = { userId: window.sessionStorage.getItem('last-search-test-user') || 'user-one' };
    (window as typeof window & { __geoCalls?: number }).__geoCalls = 0;
    navigator.geolocation.getCurrentPosition = () => {
      (window as typeof window & { __geoCalls?: number }).__geoCalls! += 1;
    };
  });
  await page.route(/maps\.googleapis\.com/, (route) => route.abort('failed'));
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort('failed'));
  await page.route(/\/api\/weather(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      cityId: 'dhg', locationName: 'Den Haag', fetchedAt: new Date().toISOString(),
      current: { temperature: 18, apparentTemperature: 18, precipitation: 0, windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true },
      forecast: [], provider: 'open-meteo',
    }),
  }));
  await page.route(/\/api\/listings(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ source: 'curated', listings: [] }),
  }));
  await page.route(/\/api\/account\/(last-search|me|options|consents)(\?.*)?$/, async (route) => {
    const req = route.request();
    const userId = req.headers().authorization?.replace('Bearer e2e-token:', '') ?? '';
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/me')) return json({
      id: userId === 'user-one' ? 1 : 2, status: 'active', role: 'user', locale: 'nl',
      onboardingCompleted: true, onboardingCompletedAt: null, createdAt: '2026-09-01T00:00:00.000Z',
      capabilities: { isVerified: true, isEditor: false, isBusinessMember: false, canClaimBusiness: false, canPublishBusiness: false, canReview: false },
      hasResearchRegistration: false, businessMembershipCount: 0, businesses: [],
      preferences: { revision: 1, neighborhoodIds: [], interestIds: [], unresolvedNeighborhoodIds: [], unresolvedInterestIds: [], retainLastSearch: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    });
    if (path.endsWith('/options')) return json({
      taxonomyVersion: 'test',
      neighborhoods: [
        { id: 'dhg:centrum', label: { nl: 'Centrum', en: 'Centrum' } },
        { id: 'dhg:scheveningen', label: { nl: 'Scheveningen', en: 'Scheveningen' } },
      ],
      interests: [{ id: 'category:retail-and-shopping', label: { nl: 'Winkelen', en: 'Retail & Shopping' } }],
    });
    if (path.endsWith('/consents')) return json({ currentNoticeVersion: 'draft-2026-09', purposes: [], current: [], history: [] });
    if (req.method() === 'PUT') {
      const body = req.postDataJSON() as Record<string, unknown>;
      puts.push(body);
      const record = { ...body, summary: 'Den Haag', capturedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
      searches.set(userId, record);
      return json(record);
    }
    if (req.method() === 'DELETE') {
      searches.delete(userId);
      return route.fulfill({ status: 204 });
    }
    return json(searches.get(userId) ?? null);
  });
  await page.route(/\/api\/registration(\?.*)?$/, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/activiteiten/den-haag?locale=nl&city=den-haag&section=events&postcode=2511AB&scope=local&e2eAccountAuth=1');
  await expect.poll(() => puts.length, { timeout: 12000 }).toBeGreaterThan(0);
  expect(puts[0].cityId).toBe('dhg');
  expect(puts[0].query).toBe('2511AB');
  expect(puts[0]).not.toHaveProperty('userId');
  const original = searches.get('user-one')!;
  searches.set('user-one', {
    ...original,
    section: 'businesses',
    neighborhoodIds: ['dhg:centrum', 'dhg:scheveningen'],
    categoryIds: ['category:retail-and-shopping'],
    filters: { openNow: true },
    summary: 'Centrum · Scheveningen · Winkelen',
  });
  await page.goto('/account?e2eAccountAuth=1');
  await expect(page.getByTestId('link-restore-last-search')).toBeVisible();
  await expect(page.getByTestId('last-search-summary')).not.toContainText('2511AB');
  await page.getByTestId('button-sign-out').click();
  await expect(page.getByTestId('link-restore-last-search')).toHaveCount(0);
  await page.evaluate(() => window.__setAccountTestAuth?.({ userId: 'user-two' }));
  await page.evaluate(() => window.sessionStorage.setItem('last-search-test-user', 'user-two'));
  await page.goto('/account?e2eAccountAuth=1');
  await expect(page.getByTestId('link-restore-last-search')).toHaveCount(0);
  await page.evaluate(() => window.__setAccountTestAuth?.({ userId: 'user-one' }));
  await page.evaluate(() => window.sessionStorage.setItem('last-search-test-user', 'user-one'));
  await page.goto('/account?e2eAccountAuth=1');
  await expect(page.getByTestId('link-restore-last-search')).toBeVisible();
  const beforeRestorePuts = puts.length;
  const providerRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.pathname.includes('/api/listings') && url.searchParams.get('mode') === 'live')
      || url.pathname.includes('/api/capture')) providerRequests.push(request.url());
  });
  await page.getByTestId('link-restore-last-search').click();
  await expect(page).toHaveURL(/\/activiteiten\/den-haag\?/);
  expect(page.url()).toContain('postcode=2511AB');
  expect(page.url()).toContain('section=businesses');
  expect(page.url()).toContain('neighborhood=centrum');
  expect(page.url()).not.toMatch(/centerLat|centerLng|user-one|accountId/);
  const restored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('buurtplaza-discovery-return-state') ?? 'null'));
  expect(restored.selectedNeighborhoods).toEqual(['Centrum', 'Scheveningen']);
  expect(restored.subcategories['Retail & Shopping']).toBe(true);
  expect(restored.subcategories['Fitness & Sports']).toBe(false);
  expect(restored.quickFilters).toContain('open-now');
  await page.waitForTimeout(1000);
  expect(puts.length).toBe(beforeRestorePuts);
  expect(providerRequests).toHaveLength(0);
  expect(await page.evaluate(() => (window as typeof window & { __geoCalls?: number }).__geoCalls)).toBe(0);
  await page.goto('/account?e2eAccountAuth=1');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('button-clear-last-search').click();
  await expect(page.getByTestId('link-restore-last-search')).toHaveCount(0);
  expect(searches.has('user-one')).toBe(false);
});
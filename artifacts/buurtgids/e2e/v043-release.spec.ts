import { expect, test, type Page } from '@playwright/test';

const listing = {
  id: 'v043-event',
  locationId: 'dhg',
  category: 'Family',
  name: 'Neighbourhood repair café',
  description: 'Bring a small household item for local volunteers to inspect.',
  details: 'Saturday at 14:00',
  startsAt: '2026-09-26T12:00:00.000Z',
  address: 'Teststraat 1, 2511 AB Den Haag',
  x: 50,
  y: 50,
  lat: 52.075,
  lng: 4.31,
  source: 'source_scan',
  sourceName: 'Community calendar',
  sourceUrl: 'https://example.test/events/repair-cafe',
  evidence: [{
    field: 'event_date',
    sourceLabel: 'Community calendar',
    sourceUrl: 'https://example.test/events/repair-cafe',
    checkedAt: '2026-09-20T08:00:00.000Z',
    status: 'current',
    caveat: null,
  }],
};

async function stubDiscovery(page: Page) {
  await page.route(/\/api\/listings(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [listing],
        evidence: {
          status: 'verified',
          lastCheckedAt: '2026-09-20T08:00:00.000Z',
          message: 'A checked source contains an upcoming event.',
          sources: [{ id: 'community', name: 'Community calendar', status: 'verified' }],
        },
      }),
    });
  });
  await page.route(/\/api\/listing(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ listing, source: 'stored' }),
    });
  });
  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'Den Haag',
        fetchedAt: '2026-09-20T08:00:00.000Z',
        current: {
          temperature: 18,
          apparentTemperature: 18,
          precipitation: 0,
          windSpeed: 5,
          weatherCode: 0,
          condition: 'clear',
          isDay: true,
        },
        forecast: [],
        provider: 'open-meteo',
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await stubDiscovery(page);
});

test('canonicalizes safe public criteria and reports rejected shared state', async ({ page }) => {
  await page.goto('/activiteiten/den-haag?locale=nl&neighborhood=centrum&postcode=2511&token=private&lat=52');

  await expect(page.getByRole('heading', { name: 'Den Haag' })).toBeVisible();
  await expect(page.getByText('Neighbourhood repair café')).toBeVisible();
  expect(page.url()).not.toContain('private');
});

test('keeps locale and criteria together when the language changes', async ({ page }) => {
  await page.goto('/activiteiten/den-haag?locale=nl&section=events&neighborhood=centrum&postcode=2511');
  await expect(page.getByRole('heading', { name: 'Den Haag' })).toBeVisible();

  await page.getByRole('combobox', { name: /taal|language/i }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'The Hague' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('neighborhood')).toBe('centrum');
  expect(new URL(page.url()).searchParams.get('postcode')).toBe('2511');
});

test('shows evidence and contract-backed actions to ordinary visitors', async ({ page }) => {
  await page.goto('/activiteiten/den-haag/v043-event?section=events');

  await expect(page.getByRole('heading', { name: listing.name })).toBeVisible();
  await page.getByText('Source and check by field').click();
  await expect(page.getByText(/Community calendar/)).toBeVisible();
  await expect(page.getByText(/Currently checked/)).toBeVisible();
  await expect(page.getByRole('link', { name: /source website/i })).toHaveAttribute(
    'href',
    listing.sourceUrl,
  );
});

test('does not silently substitute an unsupported city', async ({ page }) => {
  await page.goto('/activiteiten/amsterdam?locale=nl');

  await expect(page.getByRole('heading', { name: 'Deze stad wordt nog niet ondersteund' })).toBeVisible();
  await expect(page.getByText(/beperkt tot Den Haag/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ontdek Den Haag' })).toHaveAttribute(
    'href',
    /activiteiten\/den-haag\?locale=nl$/,
  );
});

test('keeps discovery usable when optional map providers fail', async ({ page }) => {
  await page.route('https://maps.googleapis.com/**', (route) => route.abort('failed'));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort('failed'));
  await page.goto('/activiteiten/den-haag?neighborhood=centrum');

  await expect(page.getByText('Neighbourhood repair café')).toBeVisible();
  await page.getByRole('button', { name: 'Show map' }).click();
  await expect(page.getByText('Neighbourhood repair café')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show list' })).toBeVisible();
});
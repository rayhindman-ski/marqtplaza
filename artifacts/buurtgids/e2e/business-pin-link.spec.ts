import { expect, test, type Page } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8XnWQAAAABJRU5ErkJggg==',
  'base64',
);

async function stubBusinessDiscovery(page: Page, match: { slug: string; name: string } | null) {
  await page.route(/https:\/\/maps\.googleapis\.com\/.*/, (route) => route.abort('failed'));
  await page.route(/\/api\/listings(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'curated',
      listings: [{
        id: 'pin-business',
        locationId: 'dhg',
        category: 'Businesses',
        businessCategory: 'Retail & Shopping',
        name: 'Pin business',
        description: 'A local business',
        details: 'Open',
        address: '2511 AB Den Haag',
        source: 'openstreetmap',
        x: 50,
        y: 50,
        lat: 52.075,
        lng: 4.31,
        openNow: true,
      }],
    }),
  }));
  await page.route(/\/api\/business-profiles\/by-listing(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ match }),
  }));
  await page.route(/\/api\/weather(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      cityId: 'dhg',
      locationName: 'Den Haag',
      fetchedAt: new Date().toISOString(),
      current: { temperature: 18, apparentTemperature: 18, precipitation: 0, windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true },
      forecast: [],
      provider: 'open-meteo',
    }),
  }));
  await page.route(/https:\/\/tile\.openstreetmap\.org\/.*/, (route) => route.fulfill({
    contentType: 'image/png',
    body: transparentPng,
  }));
  await page.goto('/activiteiten/den-haag?section=businesses&neighborhood=Centrum');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('nl');
  await expect(page.locator('[data-map-pin][data-event-id="pin-business"]')).toBeVisible();
  await page.getByRole('button', { name: 'Pin business', exact: true }).click();
}

test('claimed published business pin links to its public profile', async ({ page }) => {
  await stubBusinessDiscovery(page, { slug: 'pin-business-profile', name: 'Pin business' });
  const link = page.getByTestId('listing-business-link-pin-business');
  await expect(link).toHaveText('Bekijk bedrijfspagina');
  await expect(link).toHaveAttribute('href', '/bedrijf/pin-business-profile');
  await expect(page.getByRole('link', { name: 'Dit bedrijf claimen' })).toHaveCount(0);
});

test('unclaimed business pin retains the existing claim action', async ({ page }) => {
  await stubBusinessDiscovery(page, null);
  const link = page.getByTestId('listing-business-link-pin-business');
  await expect(link).toHaveText('Dit bedrijf claimen');
  await expect(link).toHaveAttribute('href', /\/bedrijf-(?:claim|nieuw)\?/);
  await expect(page.getByRole('link', { name: 'Bekijk bedrijfspagina' })).toHaveCount(0);
});
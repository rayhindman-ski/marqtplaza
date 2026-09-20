import { expect, test, type Page } from '@playwright/test';

async function stubPublicApis(page: Page) {
  await page.route('**/api/listings*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'stored',
        scopeGroup: 'local',
        groupStatus: 'ready',
        listings: [],
      }),
    });
  });
  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'The Hague',
        fetchedAt: new Date().toISOString(),
        current: {
          temperature: 18,
          apparentTemperature: 18,
          precipitation: 0,
          windSpeed: 4,
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
  await stubPublicApis(page);
});

test('states a global proposition and current availability without eager map access', async ({ page }) => {
  let mapRequests = 0;
  await page.route(/(maps\.googleapis\.com|tile\.openstreetmap\.org)/, async (route) => {
    mapRequests += 1;
    await route.abort('blockedbyclient');
  });

  await page.goto('/');

  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Discover what is happening locally, wherever you are',
  })).toBeVisible();
  await expect(page.getByText('Currently available across The Hague')).toBeVisible();
  await expect(page.getByText('Start with the list. Choose if you want to share more.')).toBeVisible();
  expect(mapRequests).toBe(0);
});

test('keeps labelled navigation destinations in the mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');

  const menu = page.getByRole('button', { name: 'Open menu' });
  await expect(menu).toBeVisible();
  await menu.click();

  await expect(page.getByRole('link', { name: 'News' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Things to do' })).toBeVisible();
  const closeMenu = page.getByRole('button', { name: 'Close menu' });
  await closeMenu.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
});

test('starts discovery with a list and mounts the map only after explicit action', async ({ page }) => {
  let mapRequests = 0;
  await page.route(/(maps\.googleapis\.com|tile\.openstreetmap\.org)/, async (route) => {
    mapRequests += 1;
    await route.abort('blockedbyclient');
  });

  await page.goto('/activiteiten/den-haag?neighborhood=Centrum');

  await expect(page.getByRole('heading', { level: 1, name: 'The Hague' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show map' })).toBeVisible();
  expect(mapRequests).toBe(0);

  await page.getByRole('button', { name: 'Show map' }).click();
  await expect(page.getByRole('button', { name: 'Show list' })).toBeVisible();
  await expect.poll(() => mapRequests).toBeGreaterThan(0);
});

test('uses progressive filter disclosure at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/activiteiten/den-haag?neighborhood=Centrum');

  const filters = page.getByRole('button', { name: 'Filters and search area' });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await filters.click();
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Local-only search.')).toBeVisible();
});
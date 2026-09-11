import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8XnWQAAAABJRU5ErkJggg==',
  'base64',
);

// Covers the "Select all" neighborhoods flow for the businesses section:
// when the search area is broadened to the whole city, Google Places may
// return nothing while OpenStreetMap still has coverage. The UI must fall
// back to the OpenStreetMap-sourced listings and reflect that in its data
// source badge and per-listing source label.
test('Select all neighborhoods falls back to OpenStreetMap when Google Places fails', async ({ page }) => {
  const listingsRequests: URL[] = [];

  await page.route('**/api/listings*', async (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('section') !== 'businesses') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ source: 'curated', listings: [] }),
      });
      return;
    }

    listingsRequests.push(url);
    const neighborhoods = url.searchParams.get('neighborhoods');

    if (neighborhoods) {
      // Scoped to a single neighborhood: Google Places has coverage here.
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'google_places',
          partial: false,
          providers: ['google_places'],
          listings: [{
            id: 'google-shop',
            locationId: 'dhg',
            category: 'Businesses',
            businessCategory: 'Health & Wellness',
            name: 'Centrum Coffee House',
            description: 'Cozy coffee shop in the city centre',
            details: 'Open now',
            address: 'Centrum, Den Haag',
            neighborhood: 'Centrum',
            x: 50,
            y: 50,
            lat: 52.078,
            lng: 4.31,
            source: 'google_maps',
            sourceName: 'Google Maps',
          }],
        }),
      });
      return;
    }

    // "Select all" broadens the query to the whole city. Google Places
    // comes back empty for this broader area, so the backend falls back
    // to OpenStreetMap (top-level source becomes "live").
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'live',
        partial: true,
        providers: ['openstreetmap'],
        listings: [{
          id: 'osm-shop',
          locationId: 'dhg',
          category: 'Businesses',
          businessCategory: 'Retail & Shopping',
          name: 'Reliable Local Shop',
          description: 'Neighborhood shop found via OpenStreetMap',
          details: 'Open now',
          address: 'Scheveningen, Den Haag',
          neighborhood: 'Scheveningen',
          x: 55,
          y: 55,
          lat: 52.09,
          lng: 4.32,
          source: 'openstreetmap',
          sourceName: 'OpenStreetMap',
        }],
      }),
    });
  });

  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg', locationName: 'Den Haag', fetchedAt: new Date().toISOString(),
        current: { temperature: 18, apparentTemperature: 18, precipitation: 0, windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true },
        forecast: [], provider: 'open-meteo',
      }),
    });
  });
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });

  // Land directly on the businesses discovery screen scoped to a single
  // neighborhood, so Google Places has a result to show before "Select all"
  // is exercised.
  await page.goto('/activiteiten/den-haag?section=businesses&neighborhood=Centrum');

  const listingList = page.locator('[data-event-list]');
  await expect(listingList.getByText('Centrum Coffee House')).toBeVisible();
  await expect(page.getByText('Google Places', { exact: true })).toBeVisible();
  await expect(listingList.getByText('Google Maps', { exact: true })).toBeVisible();

  const neighborhoodPanel = page.getByRole('group', { name: 'Neighborhoods' }).locator('..');
  await neighborhoodPanel.getByRole('button', { name: 'Select all', exact: true }).click();

  // The "all neighborhoods" checkbox reflects the broadened selection.
  await expect(page.getByRole('checkbox', { name: /All neighborhoods/i })).toBeChecked();

  await expect(listingList.getByText('Reliable Local Shop')).toBeVisible();
  await expect(listingList.getByText('Centrum Coffee House')).toHaveCount(0);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('Google Places', { exact: true })).toHaveCount(0);
  await expect(listingList.getByText('OpenStreetMap', { exact: true })).toBeVisible();

  expect(listingsRequests.length).toBeGreaterThanOrEqual(2);
  expect(listingsRequests[0].searchParams.get('neighborhoods')).toBe('Centrum');
  expect(listingsRequests[listingsRequests.length - 1].searchParams.get('neighborhoods')).toBeNull();
});

// Regression coverage for a bug where "Select all" (and the equivalent
// default state on a fresh page load) produced zero results even though
// the backend had data available. Root cause: `hasSearchArea` only
// checked `selectedNeighborhoods.length > 0`, but "Select all" clears
// that array to [] and instead sets `neighborhoodSelection` to 'all'.
// On a clean initial load (no ?neighborhood=/?postcode= param) the app
// defaults `neighborhoodSelection` to 'all' too, so this bug blocked the
// very first render, not just the explicit button click.
test('Businesses listings load with OpenStreetMap fallback from a clean initial state', async ({ page }) => {
  const listingsRequests: URL[] = [];

  await page.route('**/api/listings*', async (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('section') !== 'businesses') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ source: 'curated', listings: [] }),
      });
      return;
    }

    listingsRequests.push(url);

    // Google Places is disabled/unavailable for this query; only
    // OpenStreetMap has coverage for the whole city.
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'live',
        partial: true,
        providers: ['openstreetmap'],
        listings: [{
          id: 'osm-clean-shop',
          locationId: 'dhg',
          category: 'Businesses',
          businessCategory: 'Retail & Shopping',
          name: 'Fresh Start Bakery',
          description: 'Neighborhood bakery found via OpenStreetMap',
          details: 'Open now',
          address: 'Centrum, Den Haag',
          neighborhood: 'Centrum',
          x: 40,
          y: 40,
          lat: 52.08,
          lng: 4.31,
          source: 'openstreetmap',
          sourceName: 'OpenStreetMap',
        }],
      }),
    });
  });

  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg', locationName: 'Den Haag', fetchedAt: new Date().toISOString(),
        current: { temperature: 18, apparentTemperature: 18, precipitation: 0, windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true },
        forecast: [], provider: 'open-meteo',
      }),
    });
  });
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });

  // Clean initial state: no ?neighborhood= or ?postcode= param, and no
  // manual interaction with the filters at all.
  await page.goto('/activiteiten/den-haag?section=businesses');

  const listingList = page.locator('[data-event-list]');

  // "All neighborhoods" must be checked by default without any click.
  await expect(page.getByRole('checkbox', { name: /All neighborhoods/i })).toBeChecked();

  // The businesses query must fire automatically (no neighborhoods filter)
  // and fall back to OpenStreetMap results — this is the exact path that
  // regressed to "Choose a search area first" with zero requests fired.
  await expect(listingList.getByText('Fresh Start Bakery')).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(listingList.getByText('OpenStreetMap', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose a search area first')).toHaveCount(0);

  expect(listingsRequests.length).toBeGreaterThanOrEqual(1);
  expect(listingsRequests[0].searchParams.get('neighborhoods')).toBeNull();

  // Also exercise the explicit click-driven path: deselect everything
  // (forces "Choose a search area first"), then click "Select all" again
  // and confirm it recovers with a fresh OpenStreetMap-backed fetch.
  const neighborhoodPanel = page.getByRole('group', { name: 'Neighborhoods' }).locator('..');
  await neighborhoodPanel.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect(page.getByText('Choose a search area first')).toBeVisible();

  await neighborhoodPanel.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /All neighborhoods/i })).toBeChecked();
  await expect(listingList.getByText('Fresh Start Bakery')).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(listingList.getByText('OpenStreetMap', { exact: true })).toBeVisible();
});


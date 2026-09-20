import { expect, test, type Page } from '@playwright/test';
import { NEIGHBORHOOD_BOUNDARIES } from '@workspace/geo';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8XnWQAAAABJRU5ErkJggg==',
  'base64',
);

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function stubBoundaryDiscovery(page: Page, tilesAvailable: boolean) {
  // Keep this regression focused on the app-owned polygon layer. When a
  // browser key is available, block the Google loader so the same assertions
  // exercise the tile path and the coordinate fallback deterministically.
  await page.route('https://maps.googleapis.com/**', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/api/listings*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [
          {
            id: 'boundary-event',
            locationId: 'dhg',
            category: 'Family',
            name: 'Boundary test event',
            description: 'Event used to keep neighborhood map coverage stable.',
            details: 'Today',
            startsAt: todayAt(14),
            x: 50,
            y: 50,
            lat: 52.075,
            lng: 4.312,
            neighborhood: 'Centrum',
            activityKind: 'family',
            priceType: 'free',
            isIndoor: true,
            openNow: true,
          },
          {
            id: 'stationsbuurt-boundary-event',
            locationId: 'dhg',
            category: 'Family',
            name: 'Stationsbuurt boundary test event',
            description: 'Second event used to verify multi-neighborhood map coverage.',
            details: 'Today',
            startsAt: todayAt(15),
            x: 55,
            y: 45,
            lat: 52.071,
            lng: 4.322,
            neighborhood: 'Stationsbuurt',
            activityKind: 'family',
            priceType: 'free',
            isIndoor: false,
            openNow: true,
          },
          {
            id: 'bezuidenhout-boundary-event',
            locationId: 'dhg',
            category: 'Family',
            name: 'Bezuidenhout boundary test event',
            description: 'Third event used to verify multi-neighborhood map coverage.',
            details: 'Today',
            startsAt: todayAt(16),
            x: 60,
            y: 40,
            lat: 52.085,
            lng: 4.34,
            neighborhood: 'Bezuidenhout',
            activityKind: 'family',
            priceType: 'free',
            isIndoor: false,
            openNow: true,
          },
        ],
      }),
    });
  });
  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'Den Haag',
        fetchedAt: new Date().toISOString(),
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
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    if (!tilesAvailable) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });
  await page.goto('/activiteiten/den-haag?neighborhood=Centrum');
}

function pointOutsideNeighborhood(name: string) {
  const boundary = NEIGHBORHOOD_BOUNDARIES[name];
  if (!boundary) return { lat: 53, lng: 3 };
  const points = boundary.flat();
  const minLat = Math.min(...points.map(([lat]) => lat));
  const minLng = Math.min(...points.map(([, lng]) => lng));
  const maxLng = Math.max(...points.map(([, lng]) => lng));
  return {
    lat: minLat - 0.002,
    lng: (minLng + maxLng) / 2,
  };
}

test('keeps discovery filters, map pins, routes, and translations in sync', async ({ page }) => {
  const listingsRequests: URL[] = [];
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => undefined;
  });

  await page.route('**/api/listings*', async (route) => {
    const requestUrl = new URL(route.request().url());
    listingsRequests.push(requestUrl);
    const requestedNeighborhoods = requestUrl.searchParams.get('neighborhoods');
    const listings = [
      {
        id: 'qualifying-event', locationId: 'dhg', category: 'Family',
        name: 'Qualifying family workshop', description: 'Indoor family workshop',
        details: 'Today', startsAt: todayAt(14), x: 50, y: 50,
        lat: 52.075, lng: 4.31, address: '2511 AB Den Haag',
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
      },
      {
        id: 'assigned-elsewhere-event', locationId: 'dhg', category: 'Family',
        name: 'Scheveningen family workshop', description: 'Assigned to another neighborhood',
        details: 'Today', startsAt: todayAt(14), x: 51, y: 51,
        lat: 52.075, lng: 4.31, address: '2511 AB Den Haag',
        neighborhood: 'Scheveningen',
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
      },
      {
        id: 'paid-event', locationId: 'dhg', category: 'Family',
        name: 'Paid family workshop', description: 'Paid event',
        details: 'Today', startsAt: todayAt(14), x: 52, y: 52,
        lat: 52.075, lng: 4.31, address: '2511 AB Den Haag',
        activityKind: 'family', priceType: 'paid', isIndoor: true, openNow: true,
      },
      {
        id: 'outdoor-event', locationId: 'dhg', category: 'Outdoors',
        name: 'Outdoor event', description: 'Outdoor event',
        details: 'Today', startsAt: todayAt(14), x: 55, y: 55,
        lat: 52.075, lng: 4.31, address: '2511 AB Den Haag',
        activityKind: 'outdoor', priceType: 'free', isIndoor: false, openNow: true,
      },
      {
        id: 'far-event', locationId: 'dhg', category: 'Family',
        name: 'Far family workshop', description: 'Far event',
        details: 'Today', startsAt: todayAt(14), x: 70, y: 70,
        lat: 52.11, lng: 4.35, address: '2511 AB Den Haag',
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
      },
      {
        id: 'approximate-event', locationId: 'dhg', category: 'Family',
        name: 'Approximate family workshop', description: 'Approximate event',
        details: 'Today', startsAt: todayAt(14), x: 48, y: 48,
        lat: 52.075, lng: 4.31, address: '2511 AB Den Haag',
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
        isApproximateLocation: true,
      },
      {
        id: 'outside-boundary-event', locationId: 'dhg', category: 'Family',
        name: 'Outside Centrum boundary', description: 'Outside the official boundary',
        details: 'Today', startsAt: todayAt(14), x: 49, y: 49,
        lat: 52.076, lng: 4.29, address: '2511 AB Den Haag',
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
      },
    ];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        // Model the API contract: an explicitly assigned event from another
        // neighborhood is removed before coordinate filtering reaches the UI.
        listings: requestedNeighborhoods === 'Centrum'
          ? listings.filter((listing) => listing.id !== 'assigned-elsewhere-event')
          : listings,
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

  await page.goto('/activiteiten/den-haag');
  await expect(page.getByText('Quick choices')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Centrum', exact: true }).check();
  await expect.poll(() => listingsRequests.some((request) => request.searchParams.get('neighborhoods') === 'Centrum')).toBe(true);
  for (const label of ['Family', 'Indoor', 'Today', 'Free']) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Nearby', exact: true }).click();
  await expect(page.getByText('Finding your location…')).toBeVisible();
  await expect(page.getByText('Within 2.5 km of the selected neighborhood or city centre.')).toBeVisible({ timeout: 7_000 });

  const eventList = page.locator('[data-event-list]');
  await expect(eventList.locator('[id^="event-"]')).toHaveCount(2);
  await expect(eventList.getByText('Qualifying family workshop')).toBeVisible();
  await expect(eventList.getByText('Approximate family workshop')).toBeVisible();
  await expect(eventList.getByText('Paid family workshop')).toHaveCount(0);
  await expect(eventList.getByText('Outdoor event')).toHaveCount(0);
  await expect(eventList.getByText('Far family workshop')).toHaveCount(0);
  await expect(eventList.getByText('Scheveningen family workshop')).toHaveCount(0);
  await expect(eventList.getByText('Outside Centrum boundary')).toHaveCount(0);

  const listIds = (await eventList.locator('[data-event-id]').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('data-event-id')).sort(),
  ));
  const showMap = page.getByRole('button', { name: 'Show Map', exact: true }).first();
  if (await showMap.isVisible()) await showMap.click();
  await page.mouse.move(5, 5);
  await expect(page.locator('[data-map-cluster]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('[data-map-cluster]')).toHaveText('2');
  await expect(page.locator('[data-map-cluster]')).toHaveAttribute(
    'aria-label',
    /^2 listings in this area/,
  );
  await expect(page.locator('[data-map-pin]')).toHaveCount(0);

  // Hovering the cluster reveals its contents without changing the map camera.
  await page.locator('[data-map-cluster]').hover();
  await expect(page.getByText('2 results here')).toBeVisible();
  await page.locator('[data-cluster-result-id="approximate-event"]').click();
  await expect(page.locator('[data-map-pin][data-event-id="approximate-event"]')).toHaveCount(1, { timeout: 10_000 });

  // Selecting a listing from the list pulls it out of the cluster so it is always visible.
  const qualifyingDisclosure = page.locator('#event-qualifying-event')
    .getByRole('button', { name: 'Qualifying family workshop', exact: true });
  await qualifyingDisclosure.focus();
  await page.keyboard.press('Enter');
  await expect(qualifyingDisclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-map-pin][data-event-id="qualifying-event"]')).toHaveCount(1, { timeout: 10_000 });
  // The remaining listing is alone, so it is drawn as a normal pin too.
  await expect(page.locator('[data-map-pin]')).toHaveCount(2);
  await expect(page.locator('[data-map-cluster]')).toHaveCount(0);
  expect(listIds).toContain('qualifying-event');

  const exactCard = page.locator('#event-qualifying-event');
  const routeLinks = exactCard.locator('a[href*="google.com/maps/dir"]');
  await expect(routeLinks).toHaveCount(4);
  expect((await routeLinks.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)))
    .map((href) => new URL(href).searchParams.get('travelmode')).sort())
    .toEqual(['bicycling', 'driving', 'transit', 'walking']);

  const approximateCard = page.locator('#event-approximate-event');
  await approximateCard.getByRole('button', { name: 'Approximate family workshop', exact: true }).click();
  await expect(approximateCard.locator('a[href*="google.com/maps/dir"]')).toHaveCount(0);
  await expect(approximateCard.getByText('Directions unavailable: this map point is approximate.')).toBeVisible();

  await page.getByLabel('Language').selectOption('nl');
  for (const label of ['Snel kiezen', 'Dichtbij', 'Binnen', 'Activiteitenkalender', 'Vandaag', 'Gratis']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Route niet beschikbaar: dit kaartpunt is een benadering.')).toBeVisible();
});

test('uses subcategory colors for individual pins and mixed clusters', async ({ page }) => {
  await page.route('https://maps.googleapis.com/**', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/api/listings*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [
          {
            id: 'retail-color',
            locationId: 'dhg',
            category: 'Businesses',
            businessCategory: 'Retail & Shopping',
            name: 'Retail color test',
            description: 'Retail listing used to verify map colors.',
            details: 'Open',
            lat: 52.075,
            lng: 4.312,
            x: 50,
            y: 50,
          },
          {
            id: 'health-color',
            locationId: 'dhg',
            category: 'Businesses',
            businessCategory: 'Health & Wellness',
            name: 'Health color test',
            description: 'Health listing used to verify map colors.',
            details: 'Open',
            lat: 52.075,
            lng: 4.312,
            x: 50,
            y: 50,
          },
        ],
      }),
    });
  });
  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'Den Haag',
        fetchedAt: new Date().toISOString(),
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
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });

  await page.goto('/activiteiten/den-haag?neighborhood=Centrum&section=businesses');
  const showMap = page.getByRole('button', { name: 'Show Map', exact: true }).first();
  if (await showMap.isVisible()) await showMap.click();
  await page.mouse.move(5, 5);
  const closeCluster = page.getByRole('button', { name: 'Close', exact: true });
  if (await closeCluster.isVisible()) {
    await closeCluster.click();
    await page.mouse.move(5, 5);
  }

  const cluster = page.locator('[data-map-cluster]');
  await expect(cluster).toHaveCount(1, { timeout: 10_000 });
  await expect(cluster).toHaveText('2');
  await expect(cluster).toHaveAttribute('data-cluster-colors', '#2563eb,#dc2626');
  await expect(cluster.locator(':scope > span').first()).toHaveCSS('background-image', /conic-gradient/);
  await expect(
    page.getByRole('checkbox', { name: 'Retail & shopping', exact: true })
      .locator('xpath=..')
      .locator('[data-subcategory-color]'),
  ).toHaveAttribute('data-subcategory-color', '#2563eb');

  const tileViewportSignature = () => page.locator('img[src*="tile.openstreetmap.org"]').evaluateAll(
    (tiles) => tiles.map((tile) => ({
      src: (tile as HTMLImageElement).src,
      left: (tile as HTMLElement).style.left,
      top: (tile as HTMLElement).style.top,
    })),
  );
  const viewportBeforeSelection = await tileViewportSignature();
  await cluster.hover();
  const retailResult = page.locator('[data-cluster-result-id="retail-color"]');
  await expect(retailResult).toBeVisible();
  await retailResult.hover();
  await page.waitForTimeout(250);
  await expect(retailResult).toBeVisible();
  await retailResult.click();
  await expect(page.locator('[data-cluster-result-id="retail-color"]')).toHaveCount(0);
  await expect(page.locator('[data-map-pin][data-event-id="retail-color"]')).toBeVisible();
  expect(await tileViewportSignature()).toEqual(viewportBeforeSelection);

  const retailFilter = page.getByRole('checkbox', { name: 'Retail & shopping', exact: true });
  const healthFilter = page.getByRole('checkbox', { name: 'Health & wellness', exact: true });
  await healthFilter.uncheck();
  await expect(page.locator('[data-map-pin][data-event-id="retail-color"]')).toHaveAttribute(
    'data-marker-color',
    '#2563eb',
  );
  await expect(page.locator('[data-map-pin][data-event-id="health-color"]')).toHaveCount(0);

  await healthFilter.check();
  await retailFilter.uncheck();
  await expect(page.locator('[data-map-pin][data-event-id="health-color"]')).toHaveAttribute(
    'data-marker-color',
    '#dc2626',
  );
  await expect(page.locator('[data-map-pin][data-event-id="retail-color"]')).toHaveCount(0);
});

test('restores discovery filters and map after returning from listing details', async ({ page }) => {
  await page.context().route('https://maps.googleapis.com/**', async (route) => {
    await route.abort('failed');
  });
  await page.context().route('**/api/listings*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [
          {
            id: 'return-state-retail',
            locationId: 'dhg',
            category: 'Businesses',
            businessCategory: 'Retail & Shopping',
            name: 'Return state shop',
            description: 'A listing used to verify discovery return state.',
            details: 'Open',
            neighborhood: 'Centrum',
            lat: 52.075,
            lng: 4.312,
            x: 50,
            y: 50,
          },
          {
            id: 'return-state-health',
            locationId: 'dhg',
            category: 'Businesses',
            businessCategory: 'Health & Wellness',
            name: 'Filtered health listing',
            description: 'This listing should remain filtered after returning.',
            details: 'Open',
            neighborhood: 'Centrum',
            lat: 52.078,
            lng: 4.315,
            x: 55,
            y: 45,
          },
        ],
      }),
    });
  });
  await page.context().route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'Den Haag',
        fetchedAt: new Date().toISOString(),
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
  await page.context().route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });

  await page.goto('/activiteiten/den-haag?neighborhood=Centrum&section=businesses');
  await page.getByRole('checkbox', { name: 'Health & wellness', exact: true }).uncheck();
  const showMap = page.getByRole('button', { name: 'Show Map', exact: true }).first();
  if (await showMap.isVisible()) await showMap.click();

  const retailPin = page.locator('[data-map-pin][data-event-id="return-state-retail"]');
  await expect(retailPin).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-map-pin][data-event-id="return-state-health"]')).toHaveCount(0);

  const detailPagePromise = page.waitForEvent('popup');
  await retailPin.click();
  const detailPage = await detailPagePromise;
  await expect(detailPage.getByRole('heading', { name: 'Return state shop' })).toBeVisible();
  await detailPage.getByRole('button', { name: 'Back to discoveries' }).click();

  await expect(detailPage.getByRole('checkbox', { name: 'Centrum', exact: true })).toBeChecked();
  await expect(detailPage.getByRole('checkbox', { name: 'Businesses', exact: true })).toBeChecked();
  await expect(detailPage.getByRole('checkbox', { name: 'Retail & shopping', exact: true })).toBeChecked();
  await expect(detailPage.getByRole('checkbox', { name: 'Health & wellness', exact: true })).not.toBeChecked();
  await expect(detailPage.locator('[data-map-pin][data-event-id="return-state-retail"]')).toBeVisible({ timeout: 10_000 });
  await expect(detailPage.getByRole('button', { name: 'Show Map', exact: true })).toHaveCount(0);
});

test('shows meaningful event context before opening the card', async ({ page }) => {
  await stubBoundaryDiscovery(page, true);
  await page.goto('/activiteiten/den-haag');

  const card = page.locator('#event-boundary-event');
  const disclosure = card.getByRole('button', { name: 'Boundary test event', exact: true });
  const title = page.getByTestId('listing-title-boundary-event');
  const summary = page.getByTestId('listing-summary-boundary-event');

  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(title).toHaveClass(/line-clamp-2/);
  await expect(title).not.toHaveClass(/\btruncate\b/);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText('Event used to keep neighborhood map coverage stable.');
  await expect(summary).toHaveClass(/line-clamp-2/);
  await expect(card.getByText('Add to your calendar')).toHaveCount(0);

  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(summary).not.toHaveClass(/line-clamp-2/);
  await expect(card.getByText('Add to your calendar')).toBeVisible();
});

for (const [mapPath, tilesAvailable] of [['tile map', true], ['coordinate fallback', false]] as const) {
  test(`keeps homepage neighborhood hover state aligned with the second map in the ${mapPath}`, async ({ page }) => {
    await stubBoundaryDiscovery(page, tilesAvailable);
    await page.goto('/');

    const centrumBoundary = page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true });
    const scheveningenBoundary = page.getByRole('button', { name: 'Select neighborhood: Scheveningen', exact: true });
    const neighborhoodLabel = (name: string) => page.locator('[data-neighborhood-label]').filter({ hasText: new RegExp(`^${name}$`) });

    await expect(centrumBoundary).toHaveCount(1);
    await expect(scheveningenBoundary).toHaveCount(1);
    await expect(centrumBoundary).toHaveClass(/stroke-teal-700/);
    await expect(centrumBoundary).toHaveCSS('stroke-opacity', '0.2');

    await centrumBoundary.dispatchEvent('mouseover');
    await expect(centrumBoundary).toHaveClass(/stroke-primary/);
    await expect(centrumBoundary).toHaveCSS('stroke-opacity', '1');
    await expect(neighborhoodLabel('Centrum')).toBeVisible();
    await expect(neighborhoodLabel('Centrum')).toHaveText('Centrum');

    await centrumBoundary.dispatchEvent('mouseout');
    await expect(neighborhoodLabel('Centrum')).toHaveCount(0);
    await expect(centrumBoundary).toHaveClass(/stroke-teal-700/);
    await expect(centrumBoundary).toHaveCSS('stroke-opacity', '0.2');

    await centrumBoundary.click();
    await expect(neighborhoodLabel('Centrum')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select neighborhood', exact: true })).toBeVisible();

    await scheveningenBoundary.dispatchEvent('mouseover');
    await expect(scheveningenBoundary).toHaveClass(/stroke-primary/);
    await expect(neighborhoodLabel('Scheveningen')).toBeVisible();
    await expect(neighborhoodLabel('Centrum')).toHaveCount(0);

    await scheveningenBoundary.dispatchEvent('mouseout');
    await expect(neighborhoodLabel('Scheveningen')).toHaveCount(0);
    await expect(neighborhoodLabel('Centrum')).toBeVisible();
    await expect(centrumBoundary).toHaveClass(/stroke-primary/);
    await expect(centrumBoundary).toHaveCSS('stroke-opacity', '1');

    await page.getByRole('button', { name: 'Select neighborhood', exact: true }).click();
    await expect(page).toHaveURL(/\/activiteiten\/den-haag\?neighborhood=Centrum/);
    await expect(page.getByRole('checkbox', { name: 'Centrum', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toHaveCount(1);
    expect(await page.locator('[data-neighborhood-boundary]').count()).toBeGreaterThan(1);
  });

  test(`keeps neighborhood polygon selection aligned in the ${mapPath}`, async ({ page }) => {
    await stubBoundaryDiscovery(page, tilesAvailable);
    await page.getByRole('button', { name: 'Show Map', exact: true }).first().click();

    const neighborhoodControl = page.getByRole('checkbox', { name: 'Centrum', exact: true });
    await expect(neighborhoodControl).toBeChecked();

    const boundary = page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true });
    await expect(boundary).toHaveCount(1);
    await expect(boundary).toBeVisible();

    const geometry = await boundary.evaluate((node) => {
      const polygon = node as SVGPolygonElement;
      const points = Array.from(polygon.points).map((point) => ({ x: point.x, y: point.y }));
      const viewBox = polygon.ownerSVGElement?.viewBox.baseVal;
      return {
        pointCount: points.length,
        firstPoint: points[0],
        lastPoint: points.at(-1),
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y)),
        viewBox: viewBox
          ? { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
          : null,
      };
    });

    expect(geometry.pointCount).toBeGreaterThan(20);
    expect(geometry.firstPoint).toEqual(geometry.lastPoint);
    expect(geometry.viewBox).not.toBeNull();
    expect(geometry.minX).toBeGreaterThanOrEqual((geometry.viewBox?.x ?? 0) - 1);
    expect(geometry.maxX).toBeLessThanOrEqual((geometry.viewBox?.x ?? 0) + (geometry.viewBox?.width ?? 0) + 1);
    expect(geometry.minY).toBeGreaterThanOrEqual((geometry.viewBox?.y ?? 0) - 1);
    expect(geometry.maxY).toBeLessThanOrEqual((geometry.viewBox?.y ?? 0) + (geometry.viewBox?.height ?? 0) + 1);

    await boundary.click();
    await expect(neighborhoodControl).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toHaveCount(1);
    await expect(boundary).toHaveCSS('stroke-opacity', '0.2');
    await neighborhoodControl.check();
    await expect(neighborhoodControl).toBeChecked();
    await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-map-pin][data-event-id="boundary-event"]')).toHaveCount(1);
    await expect(page.locator('[data-map-pin][data-event-id="stationsbuurt-boundary-event"]')).toHaveCount(0);
    await expect(page.locator('[data-map-pin][data-event-id="bezuidenhout-boundary-event"]')).toHaveCount(0);

    const stationsbuurtControl = page.getByRole('checkbox', { name: 'Stationsbuurt', exact: true });
    const stationsbuurtBoundary = page.getByRole('button', { name: 'Select neighborhood: Stationsbuurt', exact: true });
    await stationsbuurtBoundary.evaluate((node) => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    });
    await expect(neighborhoodControl).toBeChecked();
    await expect(stationsbuurtControl).toBeChecked();
    await expect(page.getByRole('button', { name: 'Show Map', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-map-pin][data-event-id="boundary-event"]')).toHaveCount(1);
    await expect(page.locator('[data-map-pin][data-event-id="stationsbuurt-boundary-event"]')).toHaveCount(1);
    await expect(boundary).toHaveCSS('stroke-opacity', '1');
    await expect(stationsbuurtBoundary).toHaveCSS('stroke-opacity', '1');

    const bezuidenhoutControl = page.getByRole('checkbox', { name: 'Bezuidenhout', exact: true });
    const bezuidenhoutBoundary = page.getByRole('button', { name: 'Select neighborhood: Bezuidenhout', exact: true });
    await bezuidenhoutBoundary.evaluate((node) => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    });
    await expect(neighborhoodControl).toBeChecked();
    await expect(stationsbuurtControl).toBeChecked();
    await expect(bezuidenhoutControl).toBeChecked();
    await expect(page.getByRole('button', { name: 'Show Map', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-map-pin][data-event-id="boundary-event"]')).toHaveCount(1);
    await expect(page.locator('[data-map-pin][data-event-id="stationsbuurt-boundary-event"]')).toHaveCount(1);
    await expect(page.locator('[data-map-pin][data-event-id="bezuidenhout-boundary-event"]')).toHaveCount(1);
    await expect(bezuidenhoutBoundary).toHaveCSS('stroke-opacity', '1');

    await stationsbuurtBoundary.dispatchEvent('click');
    await expect(neighborhoodControl).not.toBeChecked();
    await expect(stationsbuurtControl).toBeChecked();
    await expect(bezuidenhoutControl).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Show Map', exact: true })).toHaveCount(0);
  });
}

test('homepage map keeps the user zoom level when hovering neighborhoods', async ({ page }) => {
  await stubBoundaryDiscovery(page, true);
  await page.addInitScript(() => {
    localStorage.setItem('buurtplaza-discovery-live-mode', 'true');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Show Map' })).toBeVisible();
  await expect(page.getByLabel('Interactive activity map')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Map' }).click();
  // The map legitimately refits its camera when data arrives or the container
  // is resized. Under a loaded full run those refits can land after the user
  // zoom below, so wait for them to finish before touching the zoom.
  await page.waitForLoadState('networkidle');

  const centrumBoundary = page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true });
  await expect(centrumBoundary).toHaveCount(1);
  const tileZoom = () => page.locator('img[src*="tile.openstreetmap.org"]').first()
    .getAttribute('src').then((src) => Number(new URL(src ?? '').pathname.split('/')[1]));
  // Flush any pending React commits and layout work before reading the zoom.
  const flushFrames = () => page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const zoomIsSettled = async () => {
    const before = await tileZoom();
    await flushFrames();
    return (await tileZoom()) === before;
  };
  await expect.poll(zoomIsSettled, { message: 'homepage map zoom should settle after initial load' }).toBe(true);

  const initialZoom = await tileZoom();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(tileZoom).toBe(initialZoom + 2);
  await expect.poll(zoomIsSettled).toBe(true);

  await centrumBoundary.dispatchEvent('mouseover');
  await expect(centrumBoundary).toHaveCSS('stroke-opacity', '1');
  await flushFrames();
  expect(await tileZoom(), 'hovering a neighborhood must not refit the camera').toBe(initialZoom + 2);
  await centrumBoundary.dispatchEvent('mouseout');
  await expect(centrumBoundary).toHaveCSS('stroke-opacity', '0.2');
  await page.mouse.move(700, 300);
  await page.mouse.move(720, 320);
  await flushFrames();
  expect(await tileZoom(), 'leaving a neighborhood must not refit the camera').toBe(initialZoom + 2);
  await expect.poll(zoomIsSettled).toBe(true);
  expect(await tileZoom()).toBe(initialZoom + 2);
});

test('main search external-source setting controls discovery mode and persists', async ({ page }) => {
  let listingsRequests: URL[] = [];

  await page.route('**/api/listings*', async (route) => {
    const url = new URL(route.request().url());
    listingsRequests.push(url);
    const mode = url.searchParams.get('mode');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: mode === 'stored_only' ? 'stored' : 'curated',
        cacheMiss: mode === 'stored_only',
        listings: [{
          id: 'postcode-result',
          locationId: 'dhg',
          category: 'Businesses',
          businessCategory: 'Retail & Shopping',
          name: 'Stored postcode result',
          description: 'A stored neighborhood listing',
          details: '2511 AB Den Haag',
          address: '2511 AB Den Haag',
          x: 50,
          y: 50,
          lat: 52.071,
          lng: 4.301,
          source: 'google_places',
          officialUrl: 'https://example.com/stored-postcode-result',
          facebookUrl: 'https://www.facebook.com/stored-postcode-result',
          instagramUrl: 'https://www.instagram.com/stored-postcode-result',
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

  await page.goto('/');

  // Fresh sessions default to stored/local data until the user opts in.
  const toggle = page.getByRole('checkbox', { name: 'Include web results' });
  await expect(toggle).not.toBeChecked();
  await page.getByText('What changes?').click();
  await expect(page.getByText(/not endorsed or verified by MarqtPlaza/)).toBeVisible();
  await page.getByRole('textbox').fill('2511');
  await page.getByRole('button', { name: 'Explore' }).click();

  await expect(async () => {
    expect(listingsRequests.length).toBeGreaterThan(0);
  }).toPass();
  expect(listingsRequests[0].searchParams.get('mode')).toBe('stored_only');
  const anonId = listingsRequests[0].searchParams.get('anonymousId');
  expect(anonId).toBeTruthy();
  expect(anonId).toMatch(/^anon_|^[0-9a-f-]{36}$/i);
  await expect(page.getByText('Stored postcode result').first()).toBeVisible();
  await expect(page.getByTestId('results-group-local')).toContainText('Stored postcode result');
  await expect(page.getByTestId('results-group-web')).toHaveCount(0);
  await expect(page.getByTestId('listing-website-postcode-result')).toHaveAttribute(
    'href',
    'https://example.com/stored-postcode-result',
  );
  await expect(page.getByRole('link', { name: 'Facebook: Stored postcode result' })).toHaveAttribute(
    'href',
    'https://www.facebook.com/stored-postcode-result',
  );
  await expect(page.getByRole('link', { name: 'Instagram: Stored postcode result' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/stored-postcode-result',
  );
  await page.getByRole('button', { name: /Stored postcode result/ }).click();
  const carRoute = page.getByRole('link', { name: 'Directions by Car: Stored postcode result' });
  await expect(carRoute).toBeVisible();
  await expect(carRoute).toHaveText('');
  await expect(carRoute).toHaveAttribute('title', 'Car');
  await expect(page.getByTestId('listing-evidence-postcode-result')).toHaveCount(0);
  await page.getByLabel('UserRole').selectOption('designer');
  await page.getByText('Source and check by field').click();
  await expect(page.getByTestId('listing-evidence-postcode-result')).toContainText('Source, checked date, and status are unknown.');
  await expect(page.getByTestId('trust-badge-postcode-result')).toHaveCount(0);
  await expect(page.getByText('Stored data')).toBeVisible();
  await expect(page.getByText('No saved results exist for this search.')).toBeVisible();
  const liveSearchButton = page.getByRole('button', { name: 'Switch to live mode to search external sources' });
  await expect(liveSearchButton).toBeVisible();
  const resultsScopeToggle = page.getByRole('checkbox', { name: 'Include web results' });
  await expect(resultsScopeToggle).not.toBeChecked();
  await liveSearchButton.click();
  await expect(resultsScopeToggle).toBeChecked();
  await expect.poll(() => listingsRequests.at(-1)?.searchParams.get('mode')).toBe('live');
  await expect(page.getByTestId('results-group-local')).toContainText('Stored postcode result');
  await expect(page.getByTestId('results-group-web')).toContainText('Additional web results');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('true');
  const requestCountBeforeDisable = listingsRequests.length;
  await resultsScopeToggle.uncheck();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('false');
  await expect(page.getByText('Local-only search.')).toBeVisible();
  await expect(page.getByTestId('results-group-web')).toHaveCount(0);
  expect(listingsRequests.slice(requestCountBeforeDisable).some((url) => url.searchParams.get('mode') === 'live')).toBe(false);
  await expect(page.getByText('Stored postcode result').first()).toBeVisible();
  await resultsScopeToggle.check();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('true');
  await expect(page.getByText('Local search with additional web results.')).toBeVisible();

  // The single top-level setting persists when returning to the main search page.
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Include web results' })).toBeChecked();
});

test('guest correction retry preserves the draft and idempotency key', async ({ page }) => {
  const submissions: Array<{ idempotencyKey: string | undefined; body: Record<string, unknown> }> = [];
  await page.route(/\/api\/places\/dhg\/openstreetmap\/corrections$/, async (route) => {
    const request = route.request();
    submissions.push({
      idempotencyKey: request.headers()['idempotency-key'],
      body: request.postDataJSON() as Record<string, unknown>,
    });
    if (submissions.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Temporarily unavailable' }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        receipt: 'correction-public-receipt',
        status: 'pending_review',
        cityId: 'dhg',
        listingSource: 'openstreetmap',
        listingId: 'node/1',
        fieldKey: 'address',
        submittedAt: new Date().toISOString(),
      }),
    });
  });

  await page.goto('/correctie?cityId=dhg&listingSource=openstreetmap&listingId=node%2F1&name=Testplaats&locale=en');
  await expect(page.getByRole('heading', { name: 'Report a correction' })).toBeVisible();
  await page.getByLabel('Which field is incorrect?').click();
  await page.getByRole('option', { name: 'Address' }).click();
  await page.getByLabel('Proposed correct value').fill('Correct street 12');
  await page.getByLabel('Explanation (optional)').fill('The public address has changed.');
  await page.getByLabel(/I understand that my correction/).check();
  await page.getByRole('button', { name: 'Submit correction' }).click();

  await expect(page.getByRole('alert')).toContainText('Your input is preserved');
  await expect(page.getByLabel('Proposed correct value')).toHaveValue('Correct street 12');
  await page.getByRole('button', { name: 'Submit correction' }).click();

  await expect(page.getByRole('heading', { name: 'Correction received' })).toBeVisible();
  await expect(page.getByText(/correction-public-receipt/)).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0].idempotencyKey).toBeTruthy();
  expect(submissions[1].idempotencyKey).toBe(submissions[0].idempotencyKey);
  expect(submissions[1].body).toEqual(submissions[0].body);
  expect(submissions[0].body).toMatchObject({
    listingId: 'node/1',
    fieldKey: 'address',
    proposedValue: 'Correct street 12',
    locale: 'en',
    consentNoticeVersion: '2026-09-18',
  });
});

test('keeps every selected neighborhood free of out-of-boundary listings', async ({ page }) => {
  await page.route('**/api/listings*', async (route) => {
    const url = new URL(route.request().url());
    const requestedNeighborhoods = url.searchParams.get('neighborhoods');
    const requestedName = requestedNeighborhoods?.split(',')[0];
    const point = requestedName ? pointOutsideNeighborhood(requestedName) : { lat: 53, lng: 3 };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [{
          id: 'outside-boundary-event',
          locationId: 'dhg',
          category: 'Family',
          name: 'Outside selected boundary',
          description: 'This item must never be displayed.',
          details: 'Today',
          startsAt: todayAt(14),
          x: 50,
          y: 50,
          lat: point.lat,
          lng: point.lng,
          activityKind: 'family',
          priceType: 'free',
          isIndoor: true,
          openNow: true,
        }],
      }),
    });
  });
  await page.route('**/api/weather*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cityId: 'dhg',
        locationName: 'Den Haag',
        fetchedAt: new Date().toISOString(),
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
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });

  await page.goto('/activiteiten/den-haag');
  const neighborhoodNames = await page.locator('[data-neighborhood-list] label').evaluateAll((labels) =>
    labels
      .map((label) => label.textContent?.trim() ?? '')
      .filter((name) => name && !name.toLowerCase().includes('all neighborhoods')),
  );

  let previousName: string | null = null;
  for (const name of neighborhoodNames) {
    if (previousName) {
      const previousCheckbox = page.getByRole('checkbox', { name: previousName, exact: true });
      await previousCheckbox.uncheck();
    }

    const checkbox = page.getByRole('checkbox', { name, exact: true });
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.includes('/api/listings') && url.searchParams.get('neighborhoods') === name;
    });
    await checkbox.check();
    await responsePromise;
    await expect(page.locator('[data-event-list]')).toBeVisible();
    await expect(page.locator('[data-event-id="outside-boundary-event"]')).toHaveCount(0);
    await expect(page.locator('[data-map-pin][data-event-id="outside-boundary-event"]')).toHaveCount(0);
    previousName = name;
  }
});

test('renders an OSM food listing immediately from the selected map snapshot', async ({ page }) => {
  const listingId = 'osm-detail-regression';
  const requestedIds: Array<string | null> = [];
  await page.addInitScript(({ id }) => {
    localStorage.setItem(`buurtplaza-detail-listing:${id}`, JSON.stringify({
      savedAt: Date.now(),
      listing: {
        id,
        locationId: 'dhg',
        category: 'Food & Drink',
        foodType: 'restaurant',
        name: 'Stored map restaurant',
        description: 'A selected map result should render without live rediscovery.',
        details: 'Open today',
        x: 50,
        y: 50,
        lat: 52.075,
        lng: 4.312,
        source: 'openstreetmap',
        sourceName: 'OpenStreetMap',
      },
    }));
  }, { id: listingId });
  await page.route('**/api/listing*', async (route) => {
    const url = new URL(route.request().url());
    requestedIds.push(url.searchParams.get('listingId'));
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Not found' }),
    });
  });

  await page.goto(`/activiteiten/den-haag/${listingId}?section=food-drink`);

  await expect(page.getByRole('heading', { name: 'Stored map restaurant' })).toBeVisible();
  await expect(page.getByText('A selected map result should render without live rediscovery.')).toBeVisible();
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
  await expect.poll(() => requestedIds).toContain(listingId);
});

test('opens a shared event URL from a clean context using the stored listing lookup', async ({ page }) => {
  const listingId = 'source-4242';
  let requestUrl: URL | null = null;
  await page.route('**/api/listing*', async (route) => {
    requestUrl = new URL(route.request().url());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'stored',
        listing: {
          id: listingId,
          locationId: 'dhg',
          category: 'Family',
          name: 'Shared stored workshop',
          description: 'Loaded by ID without a prior map selection.',
          details: 'Today at 14:00',
          startsAt: todayAt(14),
          x: 50,
          y: 50,
          lat: 52.075,
          lng: 4.312,
          source: 'source_scan',
          sourceName: 'Local agenda',
        },
      }),
    });
  });

  await page.goto(`/activiteiten/den-haag/${listingId}?section=events`);

  await expect(page.getByRole('heading', { name: 'Shared stored workshop' })).toBeVisible();
  await expect(page.getByText('Loaded by ID without a prior map selection.')).toBeVisible();
  await expect.poll(() => requestUrl?.searchParams.get('listingId') ?? null).toBe(listingId);
  expect(requestUrl?.searchParams.get('section')).toBe('events');
  expect(await page.evaluate(() => localStorage.getItem('buurtplaza-detail-listing:source-4242'))).toBeNull();
});

for (const listing of [
  {
    id: 'google-business-detail',
    section: 'businesses',
    category: 'Businesses',
    source: 'google_maps',
    name: 'Stored Google shop',
  },
  {
    id: 'osm-food-detail',
    section: 'food-drink',
    category: 'Food & Drink',
    source: 'openstreetmap',
    name: 'Stored OSM cafe',
  },
] as const) {
  test(`opens a direct ${listing.source} ${listing.section} listing by ID`, async ({ page }) => {
    let requestedSection: string | null = null;
    await page.route('**/api/listing*', async (route) => {
      requestedSection = new URL(route.request().url()).searchParams.get('section');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'stored',
          listing: {
            id: listing.id,
            locationId: 'dhg',
            category: listing.category,
            name: listing.name,
            description: 'Stored provider result',
            details: 'Open today',
            x: 50,
            y: 50,
            lat: 52.075,
            lng: 4.312,
            source: listing.source,
            sourceName: listing.source === 'google_maps' ? 'Google Maps' : 'OpenStreetMap',
          },
        }),
      });
    });

    await page.goto(`/activiteiten/den-haag/${listing.id}?section=${listing.section}`);

    await expect(page.getByRole('heading', { name: listing.name })).toBeVisible();
    await expect.poll(() => requestedSection).toBe(listing.section);
  });
}
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
        listings: [{
          id: 'boundary-event',
          locationId: 'dhg',
          category: 'Family',
          name: 'Boundary test event',
          description: 'Event used to keep neighborhood map coverage stable.',
          details: 'Today',
          startsAt: todayAt(14),
          x: 50,
          y: 50,
          lat: 52.071,
          lng: 4.301,
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
  await expect(page.locator('[data-map-cluster]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('[data-map-cluster]')).toHaveText('2');
  await expect(page.locator('[data-map-cluster]')).toHaveAttribute(
    'aria-label',
    /^2 listings in this area/,
  );
  await expect(page.locator('[data-map-pin]')).toHaveCount(0);

  // Activating the cluster reveals its contents.
  await page.locator('[data-map-cluster]').click();
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
  });
}

test('homepage map keeps the user zoom level when hovering neighborhoods', async ({ page }) => {
  await stubBoundaryDiscovery(page, true);
  await page.goto('/');
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

  // default mode=live
  const toggle = page.getByRole('checkbox', { name: 'Include external sources' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
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
  await expect(page.getByText('Stored data')).toBeVisible();
  await expect(page.getByText('No saved results exist for this search.')).toBeVisible();
  const liveSearchButton = page.getByRole('button', { name: 'Switch to live mode to search external sources' });
  await expect(liveSearchButton).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include external sources' })).toHaveCount(0);
  await liveSearchButton.click();
  await expect.poll(() => listingsRequests.at(-1)?.searchParams.get('mode')).toBe('live');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('true');

  // The single top-level setting persists when returning to the main search page.
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Include external sources' })).toBeChecked();
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
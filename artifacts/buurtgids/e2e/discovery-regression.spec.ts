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
           lat: 52.07860321,
           lng: 4.30803492,
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
  await expect(page.getByText('Quick filters')).toBeVisible();
  await page.locator('[data-neighborhood-list]').getByRole('button', { name: 'Centrum', exact: true }).click();
  await expect.poll(() => listingsRequests.some((request) => request.searchParams.get('neighborhoods') === 'Centrum')).toBe(true);
  for (const label of ['Family', 'Indoor', 'Today', 'Free']) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  await page.getByRole('checkbox', { name: 'Nearby', exact: true }).check();
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
  await expect(page.getByRole('button', { name: 'Show map' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show list' })).toHaveCount(0);
  await expect(page.locator('[data-map-cluster]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('[data-map-cluster]')).toHaveText('2');
  await expect(page.locator('[data-map-cluster]')).toHaveAttribute(
    'aria-label',
    /^2 listings in this area/,
  );
  await expect(page.locator('[data-map-pin]')).toHaveCount(0);

  // Selecting a listing must pull it out of the cluster so it is always visible.
  await page.locator('#event-qualifying-event')
    .getByRole('button', { name: 'Qualifying family workshop', exact: true })
    .click();
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
  for (const label of ['Snelle filters', 'Dichtbij', 'Binnen', 'Vandaag', 'Dit weekend', 'Deze week', 'Gratis', 'Laag tarief', 'Maaltijden']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Activiteitenkalender', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Route niet beschikbaar: dit kaartpunt is een benadering.')).toBeVisible();
});

test('does not mount a map provider on the homepage', async ({ page }) => {
  let mapRequests = 0;
  await page.route(/(maps\.googleapis\.com|tile\.openstreetmap\.org)/, async (route) => {
    mapRequests += 1;
    await route.abort('blockedbyclient');
  });

  await page.goto('/');
  await expect(page.getByText('Neighborhoods on the map')).toBeVisible();
  await expect.poll(() => mapRequests).toBeGreaterThan(0);
});

test('adding a third neighborhood never decreases the visible results', async ({ page }) => {
  const listingsByNeighborhood = {
    Centrum: {
      id: 'centrum-cafe',
      locationId: 'dhg',
      category: 'Food & Drink',
      foodType: 'cafe',
      name: 'Centrum cafe',
      description: 'Cafe in Centrum',
      details: 'Centrum',
      address: '2511 AB Den Haag',
      x: 50,
      y: 50,
      lat: 52.07860321,
      lng: 4.30803492,
      source: 'openstreetmap',
    },
    Bezuidenhout: {
      id: 'bezuidenhout-cafe',
      locationId: 'dhg',
      category: 'Food & Drink',
      foodType: 'cafe',
      name: 'Bezuidenhout cafe',
      description: 'Cafe in Bezuidenhout',
      details: 'Bezuidenhout',
      address: '2595 AA Den Haag',
      x: 55,
      y: 45,
      lat: 52.08124098,
      lng: 4.33381478,
      source: 'openstreetmap',
    },
    Stationsbuurt: {
      id: 'stationsbuurt-cafe',
      locationId: 'dhg',
      category: 'Food & Drink',
      foodType: 'cafe',
      name: 'Stationsbuurt cafe',
      description: 'Cafe in Stationsbuurt',
      details: 'Stationsbuurt',
      address: '2515 AA Den Haag',
      x: 53,
      y: 55,
      lat: 52.07498918,
      lng: 4.32281084,
      source: 'openstreetmap',
    },
  } as const;

  await page.route('https://maps.googleapis.com/**', async (route) => route.abort('failed'));
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: transparentPng });
  });
  await page.route('**/api/listings*', async (route) => {
    const url = new URL(route.request().url());
    const requested = (url.searchParams.get('neighborhoods') ?? '')
      .split(',')
      .filter((name): name is keyof typeof listingsByNeighborhood => name in listingsByNeighborhood);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'stored',
        listings: requested.map((name) => listingsByNeighborhood[name]),
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

  await page.goto('/activiteiten/den-haag?section=food-drink&neighborhood=Centrum');
  const visibleResults = page.locator('[data-event-list] [data-event-id]');
  await expect(visibleResults).toHaveCount(1);

  const counts = [await visibleResults.count()];
  for (const neighborhood of ['Bezuidenhout', 'Stationsbuurt']) {
    await page.getByRole('button', { name: `Select neighborhood: ${neighborhood}`, exact: true })
      .dispatchEvent('click', { shiftKey: true });
    await expect(page.getByRole('button', { name: `Select neighborhood: ${neighborhood}`, exact: true }))
      .toHaveCSS('stroke-opacity', '1');
    await expect(visibleResults).toHaveCount(counts.length + 1);
    counts.push(await visibleResults.count());
  }

  expect(counts).toEqual([1, 2, 3]);
  expect(counts[1]).toBeGreaterThanOrEqual(counts[0]);
  expect(counts[2]).toBeGreaterThanOrEqual(counts[1]);
});

test('restores the exact map camera after opening a detail and returning', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: () => null,
    });
  });
  await stubBoundaryDiscovery(page, true);

  const map = page.getByLabel('Interactive activity map');
  await expect(map).toBeVisible();
  const initialZoom = Number(await map.getAttribute('data-map-zoom'));
  await map.dispatchEvent('wheel', { deltaY: -100 });
  await map.dispatchEvent('wheel', { deltaY: -100 });
  await expect(map).toHaveAttribute('data-map-zoom', String(initialZoom + 2));

  const cameraBeforeDetail = {
    lat: await map.getAttribute('data-map-center-lat'),
    lng: await map.getAttribute('data-map-center-lng'),
    zoom: await map.getAttribute('data-map-zoom'),
  };
  await page.locator('[data-map-pin]').click();

  const storedCamera = await page.evaluate(() => {
    const value = JSON.parse(
      window.localStorage.getItem('buurtplaza-discovery-return-state') ?? 'null',
    ) as { mapViewport?: { center?: { lat?: number; lng?: number }; zoom?: number } } | null;
    return value?.mapViewport;
  });
  expect(storedCamera).toEqual({
    center: {
      lat: Number(cameraBeforeDetail.lat),
      lng: Number(cameraBeforeDetail.lng),
    },
    zoom: Number(cameraBeforeDetail.zoom),
  });

  await page.goto('/activiteiten/den-haag?restore=1');
  const restoredMap = page.getByLabel('Interactive activity map');
  await expect(restoredMap).toHaveAttribute('data-map-center-lat', cameraBeforeDetail.lat ?? '');
  await expect(restoredMap).toHaveAttribute('data-map-center-lng', cameraBeforeDetail.lng ?? '');
  await expect(restoredMap).toHaveAttribute('data-map-zoom', cameraBeforeDetail.zoom ?? '');
});

for (const [mapPath, tilesAvailable] of [['tile map', true], ['coordinate fallback', false]] as const) {

  test(`keeps neighborhood polygon selection aligned in the ${mapPath}`, async ({ page }) => {
    await stubBoundaryDiscovery(page, tilesAvailable);

    const neighborhoodControl = page.locator('[data-neighborhood-list]').getByRole('button', { name: 'Centrum', exact: true });
    await expect(neighborhoodControl).toHaveAttribute('aria-pressed', 'true');

    const boundary = page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true });
    await expect(boundary).toHaveCount(1);
    await expect(boundary).toBeVisible();
    const bezuidenhoutBoundary = page.getByRole('button', { name: 'Select neighborhood: Bezuidenhout', exact: true });
    await expect(bezuidenhoutBoundary).toBeVisible();
    await expect(bezuidenhoutBoundary).toHaveCSS('stroke-opacity', '0.72');

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

    const bezuidenhoutControl = page.locator('[data-neighborhood-list]').getByRole('button', { name: 'Bezuidenhout', exact: true });
    await bezuidenhoutBoundary.click();
    await expect(neighborhoodControl).toHaveAttribute('aria-pressed', 'false');
    await expect(bezuidenhoutControl).toHaveAttribute('aria-pressed', 'true');
    await expect(boundary).toHaveCSS('stroke-opacity', '0.72');
    await expect(bezuidenhoutBoundary).toHaveCSS('stroke-opacity', '1');

    await boundary.dispatchEvent('click', { shiftKey: true });
    await expect(neighborhoodControl).toHaveAttribute('aria-pressed', 'true');
    await expect(bezuidenhoutControl).toHaveAttribute('aria-pressed', 'true');
    await expect(bezuidenhoutBoundary).toHaveCSS('stroke-opacity', '1');
    await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toHaveCSS('stroke-opacity', '1');
    await expect(page.getByRole('button', { name: 'Select neighborhood: Bezuidenhout', exact: true })).toHaveCSS('stroke-opacity', '1');
  });
}

test('homepage neighborhood picker keeps every boundary visible', async ({ page }) => {
  await stubBoundaryDiscovery(page, true);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select neighborhood: Bezuidenhout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select neighborhood: Scheveningen', exact: true })).toBeVisible();
});

test('discovery map keeps the user zoom level when hovering neighborhoods', async ({ page }) => {
  await stubBoundaryDiscovery(page, true);
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
  await expect(centrumBoundary).toHaveCSS('stroke-opacity', '1');
  await page.mouse.move(700, 300);
  await page.mouse.move(720, 320);
  await flushFrames();
  expect(await tileZoom(), 'leaving a neighborhood must not refit the camera').toBe(initialZoom + 2);

  await page.getByRole('checkbox', { name: 'Family', exact: true }).check();
  await flushFrames();
  expect(await tileZoom(), 'changing a non-neighborhood filter must not refit the camera').toBe(initialZoom + 2);

  await page.getByRole('button', { name: 'Select neighborhood: Bezuidenhout', exact: true }).click();
  await flushFrames();
  expect(await tileZoom(), 'changing neighborhood selection must not refit the camera').toBe(initialZoom + 2);

  await expect.poll(zoomIsSettled).toBe(true);
  expect(await tileZoom()).toBe(initialZoom + 2);
});

test('mobile discovery keeps the map and compact results visible together', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubBoundaryDiscovery(page, true);

  await expect(page.getByRole('button', { name: 'Show list' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show map' })).toHaveCount(0);
  const mapRegion = page.getByLabel('Interactive activity map');
  await expect(mapRegion).toBeVisible();
  const mapBox = await mapRegion.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.height).toBeGreaterThan(300);
  expect(mapBox!.y).toBeLessThan(844);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Filters and search area' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /Results/ })).toBeVisible();
});

test('main search external-source setting controls discovery mode and persists', async ({ page }) => {
  let listingsRequests: URL[] = [];

  await page.route('https://maps.googleapis.com/**', async (route) => {
    await route.abort('failed');
  });
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

  // The homepage map is independent from discovery listings: it always shows
  // neighborhood boundaries and never listing pins.
  await expect(page.getByText('Neighborhoods on the map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select neighborhood: Centrum', exact: true })).toBeVisible();
  await expect(page.locator('[data-map-pin]')).toHaveCount(0);
  await page.getByRole('textbox').fill('2511');
  await page.getByRole('button', { name: 'Explore' }).click();
  await page.getByRole('button', { name: 'Search scope' }).click();
  const toggle = page.getByRole('checkbox', { name: 'Include web results' });
  await expect(toggle).not.toBeChecked();

  await expect(async () => {
    expect(listingsRequests.length).toBeGreaterThan(0);
  }).toPass();
  const discoveryRequest = listingsRequests.find((request) => request.searchParams.has('anonymousId'));
  expect(discoveryRequest).toBeDefined();
  expect(discoveryRequest!.searchParams.get('mode')).toBe('stored_only');
  const anonId = discoveryRequest!.searchParams.get('anonymousId');
  expect(anonId).toBeTruthy();
  expect(anonId).toMatch(/^anon_|^[0-9a-f-]{36}$/i);
  await expect(page.getByText('Stored postcode result').first()).toBeVisible();
  await expect(page.getByText('Local-only search.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Stored postcode result', exact: true }).click();
  const carRoute = page.getByRole('link', { name: 'Directions by Car: Stored postcode result' });
  await expect(carRoute).toBeVisible();
  await expect(carRoute).toHaveText('');
  await expect(carRoute).toHaveAttribute('title', 'Car');
  await expect(page.getByTestId('listing-evidence-postcode-result')).toHaveCount(1);
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
  await expect(page.getByText('Stored postcode result').first()).toBeVisible();
  await expect(page.getByText('Local search with additional web results.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('true');
  const requestCountBeforeDisable = listingsRequests.length;
  await resultsScopeToggle.uncheck();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('false');
  await expect(page.getByText('Local-only search.')).toBeVisible();
  expect(listingsRequests.slice(requestCountBeforeDisable).some((url) => url.searchParams.get('mode') === 'live')).toBe(false);
  await expect(page.getByText('Stored postcode result').first()).toBeVisible();
  await resultsScopeToggle.check();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buurtplaza-discovery-live-mode'))).toBe('true');
  await expect(page.getByText('Local search with additional web results.')).toBeVisible();

  // The discovery source mode persists across navigation.
  await page.goto('/activiteiten/den-haag?postcode=2511');
  await page.getByRole('button', { name: 'Search scope' }).click();
  await expect(page.getByRole('checkbox', { name: 'Include web results' })).toBeChecked();
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
      const previousButton = page.locator('[data-neighborhood-list]').getByRole('button', { name: previousName, exact: true });
      await previousButton.click();
    }

    const neighborhoodButton = page.locator('[data-neighborhood-list]').getByRole('button', { name, exact: true });
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.includes('/api/listings') && url.searchParams.get('neighborhoods') === name;
    });
    await neighborhoodButton.click();
    await responsePromise;
    await expect(page.locator('[data-event-list]')).toBeVisible();
    await expect(page.locator('[data-event-id="outside-boundary-event"]')).toHaveCount(0);
    previousName = name;
  }

  await expect(page.getByRole('button', { name: 'Show map' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show list' })).toHaveCount(0);
  await expect(page.locator('[data-map-pin][data-event-id="outside-boundary-event"]')).toHaveCount(0);
});

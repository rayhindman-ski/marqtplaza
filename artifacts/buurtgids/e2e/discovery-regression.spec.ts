import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8XnWQAAAABJRU5ErkJggg==',
  'base64',
);

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

test('keeps discovery filters, map pins, routes, and translations in sync', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => undefined;
  });

  await page.route('**/api/listings*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'curated',
        listings: [
          {
            id: 'qualifying-event', locationId: 'dhg', category: 'Family',
            name: 'Qualifying family workshop', description: 'Indoor family workshop',
            details: 'Today', startsAt: todayAt(14), x: 50, y: 50,
            lat: 52.071, lng: 4.301, address: '2511 AB Den Haag',
            activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
          },
          {
            id: 'paid-event', locationId: 'dhg', category: 'Family',
            name: 'Paid family workshop', description: 'Paid event',
            details: 'Today', startsAt: todayAt(14), x: 52, y: 52,
            lat: 52.071, lng: 4.301, address: '2511 AB Den Haag',
            activityKind: 'family', priceType: 'paid', isIndoor: true, openNow: true,
          },
          {
            id: 'outdoor-event', locationId: 'dhg', category: 'Outdoors',
            name: 'Outdoor event', description: 'Outdoor event',
            details: 'Today', startsAt: todayAt(14), x: 55, y: 55,
            lat: 52.071, lng: 4.301, address: '2511 AB Den Haag',
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
            lat: 52.071, lng: 4.301, address: '2511 AB Den Haag',
            activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
            isApproximateLocation: true,
          },
        ],
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

  const listIds = (await eventList.locator('[id^="event-"]').evaluateAll(
    (nodes) => nodes.map((node) => node.id.replace(/^event-/, '')).sort(),
  ));
  await expect(page.locator('[data-map-pin]')).toHaveCount(2, { timeout: 10_000 });
  const pinIds = await page.locator('[data-map-pin]').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('data-event-id')).sort(),
  );
  expect(pinIds).toEqual(listIds);

  const exactCard = page.locator('#event-qualifying-event');
  const routeLinks = exactCard.locator('a[href*="google.com/maps/dir"]');
  await expect(routeLinks).toHaveCount(4);
  expect((await routeLinks.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)))
    .map((href) => new URL(href).searchParams.get('travelmode')).sort())
    .toEqual(['bicycling', 'driving', 'transit', 'walking']);

  const approximateCard = page.locator('#event-approximate-event');
  await expect(approximateCard.locator('a[href*="google.com/maps/dir"]')).toHaveCount(0);
  await expect(approximateCard.getByText('Directions unavailable: this map point is approximate.')).toBeVisible();

  await page.getByRole('combobox').selectOption('nl');
  for (const label of ['Snel kiezen', 'Dichtbij', 'Binnen', 'Activiteitenkalender', 'Vandaag', 'Gratis']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Route niet beschikbaar: dit kaartpunt is een benadering.')).toBeVisible();
});
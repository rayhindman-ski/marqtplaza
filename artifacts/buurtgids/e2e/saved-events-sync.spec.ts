import { expect, test, type Page, type Route } from '@playwright/test';

type EventSnapshot = {
  id: string;
  locationId: string;
  category: 'Family';
  name: string;
  description: string;
  details: string;
  startsAt: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  address: string;
  source: 'source_scan';
};

type SyncBody = {
  events?: Array<{ eventId: string; snapshot: EventSnapshot }>;
  migrationEvents?: Array<{ eventId: string; snapshot: EventSnapshot }>;
  removeEventIds?: string[];
};

const makeEvent = (id: string, name: string): EventSnapshot => ({
  id,
  locationId: 'dhg',
  category: 'Family',
  name,
  description: `${name} description`,
  details: 'Today',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  x: 50,
  y: 50,
  lat: 52.071,
  lng: 4.301,
  address: '2511 AB Den Haag',
  source: 'source_scan',
});

async function mockListings(page: Page, events: EventSnapshot[]) {
  await page.route('**/api/listings*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ source: 'curated', listings: events }),
  }));
  await page.route('**/api/weather*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      cityId: 'dhg',
      locationName: 'Den Haag',
      fetchedAt: new Date().toISOString(),
      current: {
        temperature: 18, apparentTemperature: 18, precipitation: 0,
        windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true,
      },
      forecast: [],
      provider: 'open-meteo',
    }),
  }));
}

function userFrom(route: Route) {
  return route.request().headers().authorization?.replace('Bearer e2e-token:', '') ?? '';
}

function installSyncServer(page: Page, initial: Record<string, EventSnapshot[]> = {}) {
  const accounts = new Map(
    Object.entries(initial).map(([userId, events]) => [
      userId,
      new Map(events.map(event => [event.id, event])),
    ]),
  );
  const tombstones = new Map<string, Set<string>>();
  const requests: Array<{ userId: string; body: SyncBody }> = [];

  const handler = async (route: Route) => {
    const userId = userFrom(route);
    const body = route.request().postDataJSON() as SyncBody;
    requests.push({ userId, body });
    const events = accounts.get(userId) ?? new Map<string, EventSnapshot>();
    const deleted = tombstones.get(userId) ?? new Set<string>();
    accounts.set(userId, events);
    tombstones.set(userId, deleted);

    for (const eventId of body.removeEventIds ?? []) {
      events.delete(eventId);
      deleted.add(eventId);
    }
    for (const item of body.migrationEvents ?? []) {
      if (!deleted.has(item.eventId)) events.set(item.eventId, item.snapshot);
    }
    for (const item of body.events ?? []) {
      deleted.delete(item.eventId);
      events.set(item.eventId, item.snapshot);
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        events: [...events].map(([eventId, snapshot]) => ({ eventId, snapshot })),
        alerts: [],
      }),
    });
  };
  return { accounts, requests, handler };
}

async function setAccount(page: Page, userId: string | null) {
  await page.evaluate(id => window.__setSavedEventsTestAuth?.({ userId: id }), userId);
}

async function openSaved(page: Page) {
  await page.getByRole('button', { name: /saved places/i }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('heading', { name: 'Saved Places', exact: true })).toBeVisible();
}

test('switches directly between accounts without exposing the previous account', async ({ page }) => {
  const eventA = makeEvent('account-a-event', 'Account A workshop');
  const eventB = makeEvent('account-b-event', 'Account B concert');
  await mockListings(page, [eventA, eventB]);
  const server = installSyncServer(page, { accountA: [eventA], accountB: [eventB] });
  await page.route('**/api/saved-events/sync', server.handler);

  await page.goto('/activiteiten/den-haag?e2eSavedEventsAuth=1');
  await setAccount(page, 'accountA');
  await openSaved(page);
  await expect(page.getByRole('heading', { name: eventA.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: eventB.name, exact: true })).toHaveCount(0);

  await setAccount(page, 'accountB');
  await expect(page.getByRole('heading', { name: eventB.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: eventA.name, exact: true })).toHaveCount(0);
});

test('preserves a save and a removal while initial hydration is pending', async ({ page }) => {
  const removed = makeEvent('remove-during-hydration', 'Remove during hydration');
  const added = makeEvent('add-during-hydration', 'Add during hydration');
  await mockListings(page, [removed, added]);
  await page.addInitScript(event => {
    localStorage.setItem('buurtgids_saved_places', JSON.stringify([event]));
  }, removed);

  const server = installSyncServer(page, { accountA: [removed] });
  let releaseHydration!: () => void;
  const hydrationGate = new Promise<void>(resolve => { releaseHydration = resolve; });
  let callCount = 0;
  await page.route('**/api/saved-events/sync', async route => {
    callCount += 1;
    if (callCount === 1) await hydrationGate;
    await server.handler(route);
  });

  await page.goto('/activiteiten/den-haag?e2eSavedEventsAuth=1');
  await setAccount(page, 'accountA');
  await page.locator('#event-remove-during-hydration').getByRole('button', { name: /saved/i }).click();
  await page.locator('#event-add-during-hydration').getByRole('button', { name: /save this place/i }).click();
  releaseHydration();

  await expect.poll(() => server.requests.length).toBeGreaterThanOrEqual(2);
  const mutations = server.requests.slice(1).map(request => request.body);
  expect(mutations.some(body => body.removeEventIds?.includes(removed.id))).toBe(true);
  expect(mutations.some(body => body.events?.some(item => item.eventId === added.id))).toBe(true);
  expect(server.accounts.get('accountA')?.has(removed.id)).toBe(false);
  expect(server.accounts.get('accountA')?.has(added.id)).toBe(true);
});

test('a stale second device cannot resurrect an event removed on the first device', async ({ browser }) => {
  const event = makeEvent('cross-device-event', 'Cross-device event');
  const serverState = new Map([['accountA', new Map([[event.id, event]])]]);
  const deleted = new Map<string, Set<string>>();
  const requests: Array<{ userId: string; body: SyncBody }> = [];

  const sync = async (route: Route) => {
    const userId = userFrom(route);
    const body = route.request().postDataJSON() as SyncBody;
    requests.push({ userId, body });
    const events = serverState.get(userId) ?? new Map<string, EventSnapshot>();
    const tombstones = deleted.get(userId) ?? new Set<string>();
    serverState.set(userId, events);
    deleted.set(userId, tombstones);
    for (const id of body.removeEventIds ?? []) {
      events.delete(id);
      tombstones.add(id);
    }
    for (const item of body.migrationEvents ?? []) {
      if (!tombstones.has(item.eventId)) events.set(item.eventId, item.snapshot);
    }
    for (const item of body.events ?? []) events.set(item.eventId, item.snapshot);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        events: [...events].map(([eventId, snapshot]) => ({ eventId, snapshot })),
        alerts: [],
      }),
    });
  };

  const deviceA = await browser.newPage();
  const deviceB = await browser.newPage();
  for (const device of [deviceA, deviceB]) {
    await mockListings(device, [event]);
    await device.route('**/api/saved-events/sync', sync);
    await device.addInitScript(stale => {
      localStorage.setItem('buurtgids_saved_places', JSON.stringify([stale]));
    }, event);
    await device.goto('/activiteiten/den-haag?e2eSavedEventsAuth=1');
  }

  await setAccount(deviceA, 'accountA');
  await openSaved(deviceA);
  await deviceA.getByRole('button', { name: `Remove ${event.name}` }).click();
  await expect.poll(() => serverState.get('accountA')?.has(event.id)).toBe(false);

  await openSaved(deviceB);
  await expect(deviceB.getByRole('heading', { name: event.name, exact: true })).toBeVisible();
  await setAccount(deviceB, 'accountA');
  await expect.poll(() => requests.some(request =>
    request.userId === 'accountA'
    && request.body.migrationEvents?.some(item => item.eventId === event.id),
  )).toBe(true);
  await expect(deviceB.getByRole('heading', { name: event.name, exact: true })).toHaveCount(0);
  await expect(deviceB.getByText('No saved places yet')).toBeVisible();
  expect(serverState.get('accountA')?.has(event.id)).toBe(false);
});

test('anonymous saves persist locally without authenticated API calls', async ({ page }) => {
  const event = makeEvent('anonymous-event', 'Anonymous workshop');
  await mockListings(page, [event]);
  let authenticatedCalls = 0;
  await page.route('**/api/saved-events**', route => {
    authenticatedCalls += 1;
    return route.abort();
  });

  await page.goto('/activiteiten/den-haag');
  await page.locator('#event-anonymous-event').getByRole('button', { name: /save this place/i }).click();
  await page.reload();
  await openSaved(page);
  await expect(page.getByRole('heading', { name: event.name, exact: true })).toBeVisible();
  expect(authenticatedCalls).toBe(0);
});
import { expect, test, type Route } from '@playwright/test';

const NOW = new Date().toISOString();
const TODAY = NOW.slice(0, 10);
const END = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const profile = {
  id: 41, slug: 'message-bakery', cityId: 'dhg', listingSource: 'openstreetmap', listingId: '41',
  name: 'Message Bakery', address: 'Main street 1', neighborhood: 'Centrum', latitude: null, longitude: null,
  sourceUrl: null, tagline: 'Local bakery', description: 'Baking every morning', websiteUrl: null, phone: null,
  email: null, openingHours: null, logoUrl: null, coverUrl: null, isClaimed: true,
  claimedAt: NOW, publicationStatus: 'published', approvedRevisionVersion: null,
  createdAt: NOW, updatedAt: NOW,
};

test('owner creates a pending message; only approved messages appear publicly', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: 'owner-e2e' };
    window.localStorage.setItem('buurtplaza-language', 'nl');
  });
  type Message = { id: number; businessProfileId: number; cityId: string; kind: 'announcement' | 'special'; title: string; body: string; startsOn: string; endsOn: string; status: 'pending' | 'approved'; createdAt: string; updatedAt: string; reviewNote: null; reviewedAt: null };
  const messages: Message[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/\/api\/business-profiles\/mine(\?.*)?$/, (route) => json(route, [{ ...profile, role: 'owner', deals: [], messages }]));
  await page.route(/\/api\/business-claims(\?.*)?$/, (route) => json(route, []));
  await page.route(/\/api\/business-profiles\/41\/messages(\/\d+)?(\?.*)?$/, (route) => {
    const request = route.request();
    if (request.method() === 'GET') return json(route, messages);
    const body = request.postDataJSON();
    const message: Message = { id: messages.length + 1, businessProfileId: 41, cityId: 'dhg',
      kind: body.kind, title: body.title, body: body.body, startsOn: body.startsOn, endsOn: body.endsOn,
      status: 'pending', reviewNote: null, reviewedAt: null, createdAt: NOW, updatedAt: NOW };
    messages.push(message);
    return json(route, message, 201);
  });
  await page.route(/\/api\/business-profiles\/public\/message-bakery(\?.*)?$/, (route) => json(route, {
    ...profile, deals: [], messages: messages.filter((message) => message.status === 'approved'),
    content: null, provenance: null,
  }));
  await page.goto('/mijn-bedrijf?e2eAccountAuth=1');
  await page.getByTestId('tab-owner-messages').click();
  await page.getByTestId('create-message').click();
  await page.getByTestId('message-title').fill('Weekend opening');
  await page.getByTestId('message-body').fill('Visit us this weekend.');
  await page.getByTestId('message-start').fill(TODAY);
  await page.getByTestId('message-end').fill(END);
  await page.getByTestId('save-message').click();
  await expect(page.getByTestId('message-status-1')).toHaveText('In behandeling');
  await page.goto('/bedrijf/message-bakery');
  await expect(page.getByTestId('public-messages')).toHaveCount(0);
  messages[0].status = 'approved';
  await page.reload();
  await expect(page.getByTestId('public-messages')).toContainText('Weekend opening');
});
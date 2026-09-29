import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function stub(page: Page) {
  let entries: Array<Record<string, unknown>> = [];
  let stepUp = false;
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string } }).__accountTestAuth = { userId: 'export-e2e' };
  });
  await page.route('**/api/account/me', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      id: 1, status: 'active', role: 'user', locale: 'nl', onboardingCompleted: true,
      onboardingCompletedAt: null, createdAt: '2026-09-01T00:00:00Z',
      capabilities: { isVerified: true, isEditor: false, canReview: false, isBusinessMember: false, canClaimBusiness: false, canPublishBusiness: false },
      hasResearchRegistration: false, businessMembershipCount: 0, businesses: [], preferences: null,
    }),
  }));
  await page.route('**/api/account/export-requests**', route => {
    const url = new URL(route.request().url());
    const response = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/download')) return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="bundle.json"' },
      body: JSON.stringify({ schemaVersion: '1', profile: { id: 1 } }),
    });
    if (route.request().method() === 'POST') {
      if (stepUp) return response({ code: 'RECENT_AUTH_REQUIRED', error: 'recent_authentication_required' }, 401);
      entries = [{
        reference: 1, status: 'requested', requestedAt: '2026-09-29T07:00:00Z',
        availableAt: null, expiresAt: null, downloadedAt: null, downloads: [],
      }];
      return response({ reference: 1, status: 'requested' }, 202);
    }
    return response({ requests: entries });
  });
  return {
    ready: () => {
      entries = [{
        reference: 1, status: 'available', requestedAt: '2026-09-29T07:00:00Z',
        availableAt: '2026-09-29T07:01:00Z', expiresAt: '2026-10-02T07:01:00Z',
        downloadedAt: null, downloads: [{ file: 'bundle.json', size: 20, url: '/api/account/export-requests/1/download?file=bundle.json' }],
      }];
    },
    requireRecentAuth: () => { stepUp = true; },
  };
}

test('request, status, expiring download, NL/EN and accessibility', async ({ page }) => {
  const server = await stub(page);
  await page.goto('/account/data-export?e2eAccountAuth=1');
  await page.getByTestId('button-language-nl').click();
  await expect(page.getByText('Dit verwijdert je account niet.', { exact: false })).toBeVisible();
  await page.getByTestId('button-request-export').click();
  await expect(page.getByTestId('export-1')).toContainText('Aangevraagd');
  server.ready();
  await page.reload();
  await expect(page.getByTestId('export-1')).toContainText('Beschikbaar');
  await expect(page.getByRole('link', { name: 'bundle.json' })).toHaveAttribute('href', /download\?file=bundle.json/);
  await page.getByTestId('button-language-en').click();
  await expect(page.getByTestId('export-1')).toContainText('Available');
  expect((await new AxeBuilder({ page }).include('[data-testid="account-export-content"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('recent-auth rejection offers step-up without creating an export', async ({ page }) => {
  const server = await stub(page);
  server.requireRecentAuth();
  await page.goto('/account/data-export?e2eAccountAuth=1');
  await page.getByTestId('button-request-export').click();
  await expect(page.getByTestId('prompt-recent-auth')).toBeVisible();
  await expect(page.getByTestId('export-1')).toHaveCount(0);
});
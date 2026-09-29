import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const scopes = ['account_profile', 'preferences', 'consents', 'saved_events', 'business_memberships'];
async function stub(page: Page) {
  let requests: Record<string, unknown>[] = [];
  let recentAuth = false;
  await page.addInitScript(() => {
    (window as Window & { __accountTestAuth?: { userId: string } }).__accountTestAuth = { userId: 'deletion-e2e' };
  });
  await page.route('**/api/account/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    id: 1, status: 'active', role: 'user', locale: 'nl', onboardingCompleted: true,
    onboardingCompletedAt: null, createdAt: '2026-09-01T00:00:00Z',
    capabilities: { isVerified: true, isEditor: false, canReview: false, isBusinessMember: false, canClaimBusiness: false, canPublishBusiness: false },
    hasResearchRegistration: false, businessMembershipCount: 0, businesses: [], preferences: null,
  }) }));
  await page.route('**/api/account/deletion-policy', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    waitingDays: 14, cutoff: 'execution', order: ['app_disable', 'clerk_sessions', 'clerk_user', 'app_anonymisation', 'processors'],
    categories: { deleted: ['consumer_preferences'], anonymised: ['app_users'], retained: ['account_consent_events'] },
    labels: {
      nl: { waiting: 'Uitvoering na 14 dagen; annuleren tot uitvoering.', retained: 'Toestemmingsbewijs blijft minimaal bewaard.' },
      en: { waiting: 'Execution after 14 days; cancel until execution.', retained: 'Consent evidence is minimally retained.' },
    },
  }) }));
  await page.route(/\/api\/account\/requests(\/|\?|$)/, route => {
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (route.request().method() === 'GET') return reply({ requests });
    if (route.request().url().endsWith('/withdraw')) {
      requests = requests.map(item => ({ ...item, status: 'withdrawn', version: 2 }));
      return reply(requests[0]);
    }
    return reply({ code: 'NOT_FOUND' }, 404);
  });
  await page.route('**/api/account/deletion-requests', route => {
    if (recentAuth) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'RECENT_AUTH_REQUIRED', error: 'recent_authentication_required' }) });
    requests = [{
      id: 91, scope: 'account', type: 'deletion', status: 'received', version: 1, acknowledgedScopes: scopes,
      blocker: null, resolutionCode: null, deadlineAt: null, createdAt: '2026-09-29T00:00:00Z',
      updatedAt: '2026-09-29T00:00:00Z', resolvedAt: null, withdrawnAt: null,
      scheduledFor: '2026-10-13T00:00:00Z', cancelUntil: '2026-10-13T00:00:00Z', resultReport: null,
    }];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(requests[0]) });
  });
  return { stepUp: () => { recentAuth = true; }, cutoff: () => { requests = requests.map(item => ({ ...item, cancelUntil: '2026-09-01T00:00:00Z' })); } };
}

test('policy from API, confirmation, status, cutoff, cancellation and NL/EN', async ({ page }) => {
  const server = await stub(page);
  await page.goto('/account/deletion?e2eAccountAuth=1');
  await page.getByTestId('button-language-nl').click();
  await expect(page.getByTestId('deletion-policy')).toContainText('14 dagen');
  await expect(page.getByTestId('deletion-policy')).toContainText('Persoonlijke voorkeuren');
  await expect(page.getByTestId('deletion-policy')).not.toContainText('consumer_preferences');
  for (const scope of scopes) await page.getByTestId(`checkbox-scope-${scope}`).check();
  await expect(page.getByTestId('button-request-deletion')).toBeDisabled();
  await page.getByTestId('checkbox-deletion-confirm').check();
  await page.getByTestId('button-request-deletion').click();
  await expect(page.getByTestId('request-schedule-91')).toContainText('13 okt');
  await page.getByTestId('button-language-en').click();
  await expect(page.getByTestId('deletion-policy')).toContainText('14 days');
  await expect(page.getByTestId('deletion-policy')).toContainText('Personal preferences');
  await expect(page.getByTestId('deletion-policy')).not.toContainText('consumer_preferences');
  expect((await new AxeBuilder({ page }).include('[data-testid="account-deletion-panel"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  server.cutoff();
  await page.reload();
  await expect(page.getByTestId('button-withdraw-91')).toHaveCount(0);
});

test('recent authentication error offers the step-up path', async ({ page }) => {
  const server = await stub(page);
  server.stepUp();
  await page.goto('/account/deletion?e2eAccountAuth=1');
  for (const scope of scopes) await page.getByTestId(`checkbox-scope-${scope}`).check();
  await page.getByTestId('checkbox-deletion-confirm').check();
  await page.getByTestId('button-request-deletion').click();
  await expect(page.getByTestId('prompt-recent-auth')).toBeVisible();
});

test('cancellation is available until cutoff', async ({ page }) => {
  await stub(page);
  await page.goto('/account/deletion?e2eAccountAuth=1');
  await page.getByTestId('button-language-nl').click();
  for (const scope of scopes) await page.getByTestId(`checkbox-scope-${scope}`).check();
  await page.getByTestId('checkbox-deletion-confirm').check();
  await page.getByTestId('button-request-deletion').click();
  await page.getByTestId('button-withdraw-91').click();
  await expect(page.getByTestId('request-status-91')).toContainText('Ingetrokken');
});
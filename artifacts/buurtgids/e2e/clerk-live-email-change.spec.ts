import { expect, test } from '@playwright/test';

/**
 * PROF-004 live walk-through: a real Clerk development-instance identity
 * changes its e-mail address through /account/change-email. Uses the same
 * testing-token + Turnstile-block recipe as clerk-live-signup.spec.ts and
 * Clerk test identities (`+clerk_test`, code 424242) as the controlled inbox,
 * so it proves the Clerk address lifecycle (create → verify → primary) and the
 * app's start/confirm bookkeeping, not SMTP delivery.
 *
 * Opt-in: CLERK_LIVE_SIGNUP=1 CLERK_LIVE_BASE_URL=https://<dev domain>.
 */
const LIVE = process.env.CLERK_LIVE_SIGNUP === '1';
const TEST_CODE = '424242';

test.describe('live Clerk e-mail change', () => {
  test.skip(!LIVE, 'set CLERK_LIVE_SIGNUP=1 to run against the Clerk development instance');
  test.setTimeout(180_000);

  test('a fresh identity changes its primary e-mail and the account row follows', async ({ page }) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    const liveBase = (process.env.CLERK_LIVE_BASE_URL ?? '').replace(/\/$/, '');
    if (!secretKey || !publishableKey) throw new Error('CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY are required');
    if (!liveBase) throw new Error('CLERK_LIVE_BASE_URL is required: the e-mail change needs the real API behind the page');
    if (!publishableKey.startsWith('pk_test_')) throw new Error('refusing to create identities on a non-development Clerk instance');

    const frontendApiHost = Buffer.from(publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '');
    const tokenResponse = await fetch('https://api.clerk.com/v1/testing_tokens', { method: 'POST', headers: { Authorization: `Bearer ${secretKey}` } });
    if (!tokenResponse.ok) throw new Error(`testing token request failed: ${tokenResponse.status}`);
    const { token: testingToken } = (await tokenResponse.json()) as { token: string };

    const fapiRequests: string[] = [];
    await page.route(`https://${frontendApiHost}/**`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('__clerk_testing_token', testingToken);
      fapiRequests.push(`${(url.searchParams.get('_method') ?? route.request().method()).toUpperCase()} ${url.pathname}`);
      await route.continue({ url: url.toString() });
    });
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());

    const stamp = Date.now();
    const oldEmail = `buurtplaza.e2e.mail.${stamp}+clerk_test@example.com`;
    const newEmail = `buurtplaza.e2e.mail.${stamp}.new+clerk_test@example.com`;
    const password = `Bp!${stamp}-Zeehelden-${stamp % 9973}`;

    // Sign up (fresh session = recent authentication for the step-up guard).
    await page.goto(`${liveBase}/sign-up`);
    const emailInput = page.locator('input[name="emailAddress"]');
    await expect(emailInput).toBeVisible({ timeout: 30_000 });
    await emailInput.fill(oldEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('.cl-formButtonPrimary').click();
    await page.waitForURL((url) => url.pathname === '/sign-up/verify-email-address', { timeout: 30_000 });
    const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
    await expect(codeInput).toBeVisible({ timeout: 30_000 });
    await codeInput.click();
    await page.keyboard.type(TEST_CODE, { delay: 40 });
    await page.waitForURL((url) => url.pathname === '/account/preferences', { timeout: 60_000 });

    const readMe = () => page.evaluate(async (base) => {
      const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> }; user?: { id: string } } }).Clerk;
      const token = await clerk?.session?.getToken();
      const res = await fetch(`${base}/api/account/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = (await res.json()) as { id?: string; capabilities?: { isVerified?: boolean } };
      return { status: res.status, accountId: body.id ?? null, isVerified: body.capabilities?.isVerified, userId: clerk?.user?.id ?? null };
    }, liveBase);
    const before = await readMe();
    expect(before.status).toBe(200);
    expect(before.isVerified).toBe(true);
    expect(before.userId).toBeTruthy();

    // The e-mail change page: new address → Clerk code → primary switched → app confirm.
    const appCalls: string[] = [];
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/account/email-change/')) appCalls.push(`${url.pathname} ${response.status()}`);
    });
    await page.goto(`${liveBase}/account/change-email`);
    await expect(page.getByTestId('heading-account-email-change')).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="email"]').fill(newEmail);
    await page.getByRole('button').filter({ hasText: /code|verstuur|send|start/i }).first().click();
    const changeCode = page.locator('input[autocomplete="one-time-code"]');
    await expect(changeCode).toBeVisible({ timeout: 30_000 });
    expect(fapiRequests.some((r) => /^POST \/v1\/me\/email_addresses\/?$/.test(r)), `address created at the identity provider: ${fapiRequests.filter((r) => r.includes('email')).join(', ')}`).toBe(true);
    expect(fapiRequests.some((r) => /POST \/v1\/me\/email_addresses\/[^/]+\/prepare_verification/.test(r))).toBe(true);
    await changeCode.fill(TEST_CODE);
    await page.getByRole('button', { name: /bevestigen|confirm|verify/i }).click();
    await expect(page.getByTestId('page-account-email-change').getByRole('status')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('page-account-email-change').getByRole('alert')).toHaveCount(0);
    expect(fapiRequests.some((r) => /POST \/v1\/me\/email_addresses\/[^/]+\/attempt_verification/.test(r))).toBe(true);
    expect(fapiRequests.some((r) => /^PATCH \/v1\/me\/?$/.test(r)), `primary address updated: ${fapiRequests.filter((r) => r.startsWith('PATCH')).join(', ')}`).toBe(true);

    // Identity provider: the new address is primary and verified.
    const userResponse = await fetch(`https://api.clerk.com/v1/users/${before.userId}`, { headers: { Authorization: `Bearer ${secretKey}` } });
    expect(userResponse.status).toBe(200);
    const clerkUser = (await userResponse.json()) as {
      primary_email_address_id: string;
      email_addresses: { id: string; email_address: string; verification: { status: string } | null }[];
    };
    const primary = clerkUser.email_addresses.find((entry) => entry.id === clerkUser.primary_email_address_id);
    expect(primary?.email_address.toLowerCase()).toBe(newEmail.toLowerCase());
    expect(primary?.verification?.status).toBe('verified');

    // App bookkeeping: start (pending, notice to the old address) and confirm both succeeded.
    expect(appCalls).toContain('/api/account/email-change/start 204');
    expect(appCalls).toContain('/api/account/email-change/confirm 204');
    // The identity is left in place so the app_users row can be inspected afterwards.
    test.info().annotations.push({ type: 'email-change', description: JSON.stringify({ userId: before.userId, accountId: before.accountId, from: oldEmail, to: newEmail, appCalls }) });
    console.log(`EMAIL_CHANGE ${JSON.stringify({ userId: before.userId, accountId: before.accountId, from: oldEmail, to: newEmail })}`);
  });
});

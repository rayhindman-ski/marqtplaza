import { expect, test } from '@playwright/test';

/**
 * Live Clerk sign-up journey against the real development instance.
 *
 * Opt in with `CLERK_LIVE_SIGNUP=1`; the run needs `CLERK_SECRET_KEY` and
 * `VITE_CLERK_PUBLISHABLE_KEY` (development instance) and outbound network.
 * Set `CLERK_LIVE_BASE_URL` (for example the workspace dev domain) to run the
 * journey against a server that also serves the account API; the isolated
 * Playwright server has no `/api`, so the landing page cannot load `me` there.
 *
 * Bot protection: Clerk's Backend API issues a short-lived testing token
 * (`POST /v1/testing_tokens`). Frontend API requests that carry it as
 * `__clerk_testing_token` are accepted without a solved Turnstile challenge.
 * This is the same mechanism `@clerk/testing` uses. The development instance
 * still reports `captcha_enabled`, so the widget renders an interactive
 * "Verify you are human" checkbox that headless Chromium cannot pass; the spec
 * therefore blocks the Turnstile script, which makes clerk-js submit the
 * sign-up with a `captcha_error` that the testing token then waives.
 *
 * Verification inbox: development instances accept Clerk test identities
 * (`<local>+clerk_test@example.com`). No e-mail leaves Clerk for them; the
 * e-mail verification step accepts the fixed code `424242` instead, so the
 * verification screen and redirect-after-verification are exercised without a
 * third-party inbox. Real e-mail transport is *not* covered by this spec.
 */
const LIVE = process.env.CLERK_LIVE_SIGNUP === '1';
const TEST_CODE = '424242';

test.describe('live Clerk sign-up', () => {
  test.skip(!LIVE, 'set CLERK_LIVE_SIGNUP=1 to run against the Clerk development instance');
  test.setTimeout(120_000);

  test('new test identity signs up, verifies its e-mail, and lands on the preference step', async ({ page }) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!secretKey || !publishableKey) throw new Error('CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY are required');
    if (!publishableKey.startsWith('pk_test_')) throw new Error('refusing to create sign-ups on a non-development Clerk instance');

    const frontendApiHost = Buffer.from(publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '');
    const tokenResponse = await fetch('https://api.clerk.com/v1/testing_tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!tokenResponse.ok) throw new Error(`testing token request failed: ${tokenResponse.status}`);
    const { token: testingToken } = (await tokenResponse.json()) as { token: string };

    const fapiRequests: string[] = [];
    await page.route(`https://${frontendApiHost}/**`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('__clerk_testing_token', testingToken);
      fapiRequests.push(`${route.request().method()} ${url.pathname}`);
      await route.continue({ url: url.toString() });
    });
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());

    const stamp = Date.now();
    const email = `buurtplaza.e2e.${stamp}+clerk_test@example.com`;
    const password = `Bp!${stamp}-Zeehelden-${stamp % 9973}`;
    const returnPath = '/activiteiten/den-haag/zeeheldenkwartier?bron=e2e';
    const terug = encodeURIComponent(returnPath);

    const liveBase = (process.env.CLERK_LIVE_BASE_URL ?? '').replace(/\/$/, '');
    // Anonymous first: the homepage must work without an account and offer an
    // explicit "create account" entry that leads to the Clerk sign-up card.
    await page.goto(`${liveBase}/`);
    const createAccount = page.getByTestId('link-create-account');
    await expect(createAccount).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('link-create-account')).toHaveAttribute('href', /^\/sign-up\?terug=/);
    await page.goto(`${liveBase}/sign-up?terug=${terug}`);
    const emailInput = page.locator('input[name="emailAddress"]');
    await expect(emailInput).toBeVisible({ timeout: 30_000 });
    await emailInput.fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('.cl-formButtonPrimary').click();

    await page.waitForURL((url) => url.pathname === '/sign-up/verify-email-address', { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('terug'), 'verification step keeps terug').toBe(returnPath);
    const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
    await expect(codeInput).toBeVisible({ timeout: 30_000 });
    expect(fapiRequests.some((r) => r === 'POST /v1/client/sign_ups')).toBe(true);
    expect(fapiRequests.some((r) => /POST \/v1\/client\/sign_ups\/[^/]+\/prepare_verification/.test(r))).toBe(true);
    await codeInput.click();
    await page.keyboard.type(TEST_CODE, { delay: 40 });

    await page.waitForURL((url) => url.pathname === '/account/voorkeuren', { timeout: 60_000 });
    const landed = new URL(page.url());
    expect(landed.searchParams.get('terug')).toBe(returnPath);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (liveBase) {
      // With a real API behind the page, the new identity must resolve to a verified account.
      await expect(page.getByRole('button', { name: /opslaan|save/i })).toBeVisible({ timeout: 30_000 });
      const me = await page.evaluate(async (base) => {
        const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }).Clerk;
        const token = await clerk?.session?.getToken();
        const res = await fetch(`${base}/api/account/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const body = (await res.json()) as { capabilities?: { isVerified?: boolean }; onboardingCompleted?: boolean };
        return { status: res.status, isVerified: body.capabilities?.isVerified, onboardingCompleted: body.onboardingCompleted };
      }, liveBase);
      test.info().annotations.push({ type: 'account-me', description: JSON.stringify(me) });
      expect(me.status).toBe(200);
      expect(me.isVerified).toBe(true);
      expect(me.onboardingCompleted).toBe(false);

      // The new account must reach a usable account page: no "accounts are not
      // available" dead end, the header switches to "my account", and the Clerk
      // profile panel renders at panel width with its own navigation.
      await page.goto(`${liveBase}/account`);
      await expect(page.getByTestId('heading-account')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('status-account-unavailable')).toHaveCount(0);
      await expect(page.getByTestId('account-preferences-panel')).toBeVisible({ timeout: 30_000 });
      const profileNav = page.locator('[data-testid="account-profile-panel"] .cl-navbar');
      await expect(profileNav).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('account-profile-panel').scrollIntoViewIfNeeded();
      await page.getByTestId('account-profile-panel').screenshot({ path: test.info().outputPath('account-profile.png') });
      const profileBox = await page.locator('[data-testid="account-profile-panel"] .cl-cardBox').boundingBox();
      const panelBox = await page.getByTestId('account-profile-panel').boundingBox();
      expect(profileBox && panelBox && profileBox.width >= panelBox.width - 4, 'profile uses the full panel width').toBe(true);
      await page.goto(`${liveBase}/`);
      await expect(page.getByRole('link', { name: /my account|mijn account/i })).toBeVisible({ timeout: 30_000 });
    }

    if (liveBase) {
      // v0.5.2 credential lifecycle on the same identity: change the password
      // (current password = recent-auth proof), sign out, recover with the
      // reset code, and confirm the retired password no longer signs in.
      const changed = `${password}-v2`;
      await page.goto(`${liveBase}/account/beveiliging`);
      await expect(page.getByTestId('heading-account-security')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('input-current-password').fill(password);
      await page.getByTestId('input-new-password').fill(changed);
      await page.getByTestId('input-confirm-password').fill(changed);
      await page.getByTestId('button-change-password-submit').click();
      await expect(page.getByTestId('status-change-password-done')).toBeVisible({ timeout: 30_000 });
      expect(fapiRequests.some((r) => /POST \/v1\/me\/change_password/.test(r)), 'password change went to the identity provider').toBe(true);

      // A wrong current password is refused with the app's own copy.
      await page.getByTestId('input-current-password').fill('definitely-not-it');
      await page.getByTestId('input-new-password').fill(`${changed}-x`);
      await page.getByTestId('input-confirm-password').fill(`${changed}-x`);
      await page.getByTestId('button-change-password-submit').click();
      await expect(page.getByTestId('input-current-password-error').or(page.getByTestId('error-change-password'))).toBeVisible({ timeout: 30_000 });

      await page.evaluate(async () => {
        const clerk = (window as unknown as { Clerk?: { signOut(): Promise<void> } }).Clerk;
        await clerk?.signOut();
      });

      await page.goto(`${liveBase}/account/wachtwoord-vergeten?terug=${terug}`);
      await expect(page.getByTestId('heading-forgot-password')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('input-forgot-email').fill(email);
      await page.getByTestId('button-forgot-password-submit').click();
      await expect(page.getByTestId('status-forgot-password-sent')).toBeVisible({ timeout: 30_000 });
      expect(page.url()).not.toContain('clerk_test');
      await page.getByTestId('button-forgot-password-enter-code').click();
      await expect(page.getByTestId('form-reset-password')).toBeVisible({ timeout: 30_000 });

      // Wrong code first: field-level error, form keeps its state.
      const recovered = `${password}-v3`;
      await page.getByTestId('input-reset-code').fill('000000');
      await page.getByTestId('input-reset-password').fill(recovered);
      await page.getByTestId('input-reset-password-confirm').fill(recovered);
      await page.getByTestId('button-reset-password-submit').click();
      await expect(page.getByTestId('error-reset-code')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('input-reset-password')).toHaveValue(recovered);

      await page.getByTestId('input-reset-code').fill(TEST_CODE);
      await page.getByTestId('button-reset-password-submit').click();
      await expect(page.getByTestId('status-reset-password-done')).toBeVisible({ timeout: 60_000 });
      await page.getByTestId('button-reset-password-continue').click();
      await page.waitForURL((url) => url.pathname === '/activiteiten/den-haag/zeeheldenkwartier', { timeout: 30_000 });

      // The reset signed this browser in; other sessions were revoked on request.
      await page.goto(`${liveBase}/account/beveiliging`);
      await expect(page.getByTestId('heading-account-security')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('status-sessions-count')).toBeVisible({ timeout: 30_000 });
      await page.evaluate(async () => {
        const clerk = (window as unknown as { Clerk?: { signOut(): Promise<void> } }).Clerk;
        await clerk?.signOut();
      });

      // The retired password is refused; the recovered one signs in.
      await page.goto(`${liveBase}/sign-in`);
      const identifier = page.locator('input[name="identifier"]');
      await expect(identifier).toBeVisible({ timeout: 30_000 });
      await identifier.fill(email);
      await page.locator('.cl-formButtonPrimary').click();
      const pwd = page.locator('input[name="password"]');
      await expect(pwd).toBeVisible({ timeout: 30_000 });
      await pwd.fill(changed);
      await page.locator('.cl-formButtonPrimary').click();
      await expect(page.locator('.cl-formFieldErrorText, .cl-alertText').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.cl-formButtonPrimary')).toBeEnabled({ timeout: 30_000 });
      await pwd.fill(recovered);
      await pwd.press('Enter');
      await page.waitForURL((url) => url.pathname === '/account', { timeout: 60_000 });
      await expect(page.getByTestId('heading-account')).toBeVisible({ timeout: 30_000 });

      const bodies = fapiRequests.join('\n');
      expect(bodies).not.toContain(password);
      expect(bodies).not.toContain(recovered);
    }

    const attempt = fapiRequests.find((r) => /POST \/v1\/client\/sign_ups\/[^/]+\/attempt_verification/.test(r));
    expect(attempt, 'e-mail code verification was attempted through the Clerk sign-up').toBeTruthy();
    test.info().annotations.push(
      { type: 'clerk-identity', description: email },
      { type: 'clerk-frontend-api', description: frontendApiHost },
      { type: 'landing-url', description: `${landed.pathname}${landed.search}` },
    );
  });
});

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Expired and already-consumed Clerk credentials opened against the development app.
 *
 * Opt in with `CLERK_LIVE_RECOVERY=1`; needs `CLERK_SECRET_KEY`, a `pk_test_`
 * `VITE_CLERK_PUBLISHABLE_KEY`, outbound network, and `CLERK_LIVE_BASE_URL`
 * pointing at a server that also serves `/api` (the isolated Playwright server
 * does not). Screenshots land in `test-results/clerk-recovery/`.
 *
 * This instance verifies e-mail addresses with a one-time *code*
 * (`user_settings.attributes.email_address.verifications: ["email_code"]`), so
 * the only Clerk-issued *links* are sign-in tickets (`?__clerk_ticket=`) and the
 * verification step itself lives at `/sign-up/verify-email-address`. The spec
 * therefore covers three genuine edge cases:
 *
 *   1. an expired sign-in link (Backend API sign-in token, 1 s lifetime),
 *   2. an already-consumed sign-in link (used once in a fresh context, reopened),
 *   3. a consumed and stale e-mail verification step (verify, sign out, reopen).
 *
 * Each case asserts the visible Clerk state, a recovery action, and that the
 * browser ends without a Clerk session. Database rows are checked from outside
 * the spec (see convergence.md).
 */
const LIVE = process.env.CLERK_LIVE_RECOVERY === '1';
/** UI language the app is opened in; Clerk cards must follow it (`nl` proves the Dutch localization). */
const LANGUAGE: 'nl' | 'en' = process.env.CLERK_LIVE_LANGUAGE === 'nl' ? 'nl' : 'en';
const TEST_CODE = '424242';
const SHOTS = 'test-results/clerk-recovery';

/** Stores the app language before any page script runs, the same way the in-app toggle would. */
async function seedLanguage(context: BrowserContext): Promise<void> {
  await context.addInitScript((language) => {
    window.localStorage.setItem('buurtplaza-language', language);
  }, LANGUAGE);
}

/** Language-specific expectation for an expired/invalid link message. */
const EXPIRED_LINK_TEXT = LANGUAGE === 'nl' ? /verlopen|ongeldig|niet meer geldig|al gebruikt/i : /expired|invalid|already/i;

type ClerkWindow = Window & { Clerk?: { loaded?: boolean; session?: { id: string } | null; user?: { id: string } | null; signOut(): Promise<void> } };

async function clerkSessionId(page: Page): Promise<string | null> {
  await page.waitForFunction(() => (window as ClerkWindow).Clerk?.loaded === true, null, { timeout: 30_000 });
  return page.evaluate(() => (window as ClerkWindow).Clerk?.session?.id ?? null);
}

/** Waits for the Clerk card to leave its loading state (or 45 s), then returns its visible text. */
async function visibleClerkText(page: Page): Promise<string> {
  const card = page.locator('.cl-rootBox').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const settled = await page
    .waitForFunction(() => {
      const root = document.querySelector('.cl-rootBox');
      const text = root?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text.replace('Development mode', '').trim().length > 0 && !root?.querySelector('.cl-spinner');
    }, null, { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
  return settled ? text : `[still loading after 45 s] ${text}`;
}

/** Records Frontend API ticket sign-in responses so the Clerk error code is part of the evidence. */
function recordTicketResponses(page: Page, host: string, into: string[]): void {
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (url.host !== host || !/\/v1\/client\/sign_ins/.test(url.pathname)) return;
    let detail = '';
    try {
      const body = (await res.json()) as { errors?: Array<{ code: string; long_message?: string }>; response?: { status?: string } };
      detail = body.errors ? body.errors.map((e) => `${e.code}: ${e.long_message ?? ''}`).join('; ') : `status=${body.response?.status}`;
    } catch {
      detail = '(no json)';
    }
    into.push(`${res.request().method()} ${url.pathname} -> ${res.status()} ${detail}`);
  });
}

test.describe('live Clerk expired and consumed credentials', () => {
  test.skip(!LIVE, 'set CLERK_LIVE_RECOVERY=1 to run against the Clerk development instance');
  test.setTimeout(180_000);

  const secretKey = process.env.CLERK_SECRET_KEY ?? '';
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';
  const liveBase = (process.env.CLERK_LIVE_BASE_URL ?? '').replace(/\/$/, '');
  const returnPath = '/deals';
  const frontendApiHost = Buffer.from(publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '');
  const backend = async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`https://api.clerk.com/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Clerk Backend API ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  test.beforeEach(async ({ context }) => {
    await seedLanguage(context);
  });

  test.beforeAll(() => {
    if (!LIVE) return;
    if (!secretKey || !publishableKey) throw new Error('CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY are required');
    if (!publishableKey.startsWith('pk_test_')) throw new Error('refusing to run against a non-development Clerk instance');
    if (!liveBase) throw new Error('CLERK_LIVE_BASE_URL is required so /api is reachable');
    mkdirSync(SHOTS, { recursive: true });
  });

  async function firstTestUserId(): Promise<string> {
    const res = await fetch('https://api.clerk.com/v1/users?limit=50', { headers: { Authorization: `Bearer ${secretKey}` } });
    const users = (await res.json()) as Array<{ id: string; email_addresses: Array<{ email_address: string }> }>;
    const user = users.find((u) => u.email_addresses.some((e) => e.email_address.endsWith('+clerk_test@example.com')));
    if (!user) throw new Error('no Clerk test identity available; run clerk-live-signup first');
    return user.id;
  }

  test('expired sign-in link shows an error and a way back to sign in, without a session', async ({ page }) => {
    const userId = await firstTestUserId();
    const token = await backend<{ id: string; token: string }>('/sign_in_tokens', { user_id: userId, expires_in_seconds: 1 });
    await new Promise((r) => setTimeout(r, 3_000));
    const fapi: string[] = [];
    recordTicketResponses(page, frontendApiHost, fapi);

    await page.goto(`${liveBase}/sign-in?__clerk_ticket=${encodeURIComponent(token.token)}&terug=${encodeURIComponent(returnPath)}`);
    const text = await visibleClerkText(page);
    await page.screenshot({ path: `${SHOTS}/expired-sign-in-link.png`, fullPage: true });
    test.info().annotations.push({ type: 'language', description: LANGUAGE }, { type: 'clerk-state', description: text }, { type: 'url', description: page.url() }, { type: 'fapi', description: fapi.join(' | ') });

    expect(text).toMatch(EXPIRED_LINK_TEXT);
    // Recovery: the sign-in card with an e-mail field (or a sign-up link) is reachable from this screen.
    const recovery = page.locator('input[name="identifier"], a.cl-footerActionLink, .cl-formButtonPrimary').first();
    await expect(recovery).toBeVisible();
    expect(await clerkSessionId(page)).toBeNull();
    expect(new URL(page.url()).pathname).toMatch(/^\/sign-in/);
  });

  test('already-consumed sign-in link cannot sign in a second time', async ({ browser }) => {
    const userId = await firstTestUserId();
    const token = await backend<{ id: string; token: string }>('/sign_in_tokens', { user_id: userId, expires_in_seconds: 600 });
    const link = `${liveBase}/sign-in?__clerk_ticket=${encodeURIComponent(token.token)}&terug=${encodeURIComponent(returnPath)}`;

    // First use: consumes the ticket in an isolated context, then signs out again.
    const first = await browser.newContext();
    await seedLanguage(first);
    const firstPage = await first.newPage();
    await firstPage.goto(link);
    await firstPage.waitForURL((url) => url.pathname === returnPath, { timeout: 60_000 });
    const firstSession = await clerkSessionId(firstPage);
    test.info().annotations.push({ type: 'first-use', description: `landed ${firstPage.url()} session=${firstSession}` });
    expect(firstSession).not.toBeNull();
    await firstPage.evaluate(() => (window as ClerkWindow).Clerk!.signOut());
    await firstPage.waitForFunction(() => (window as ClerkWindow).Clerk?.session == null);
    await first.close();

    // Second use: a fresh browser opens the same link.
    const second = await browser.newContext();
    await seedLanguage(second);
    const page = await second.newPage();
    const fapi: string[] = [];
    recordTicketResponses(page, frontendApiHost, fapi);
    await page.goto(link);
    const text = await visibleClerkText(page);
    await page.screenshot({ path: `${SHOTS}/consumed-sign-in-link.png`, fullPage: true });
    test.info().annotations.push({ type: 'language', description: LANGUAGE }, { type: 'clerk-state', description: text }, { type: 'url', description: page.url() }, { type: 'fapi', description: fapi.join(' | ') });

    expect(text).toMatch(EXPIRED_LINK_TEXT);
    await expect(page.locator('input[name="identifier"], a.cl-footerActionLink, .cl-formButtonPrimary').first()).toBeVisible();
    expect(await clerkSessionId(page)).toBeNull();
    expect(new URL(page.url()).pathname).toMatch(/^\/sign-in/);
    await second.close();
  });

  test('consumed e-mail verification step cannot be replayed after sign-out', async ({ page }) => {
    const { token: testingToken } = await backend<{ token: string }>('/testing_tokens');
    await page.route(`https://${frontendApiHost}/**`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('__clerk_testing_token', testingToken);
      await route.continue({ url: url.toString() });
    });
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());

    const stamp = Date.now();
    const email = `buurtplaza.recovery.${stamp}+clerk_test@example.com`;
    await page.goto(`${liveBase}/sign-up?terug=${encodeURIComponent(returnPath)}`);
    await page.locator('input[name="emailAddress"]').fill(email);
    await page.locator('input[name="password"]').fill(`Bp!${stamp}-Zeehelden-${stamp % 9973}`);
    await page.locator('.cl-formButtonPrimary').click();
    await page.waitForURL((url) => url.pathname === '/sign-up/verify-email-address', { timeout: 30_000 });
    const verifyUrl = page.url();

    // A wrong code first: the step must stay recoverable (error + resend action) rather than dead-end.
    const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
    await codeInput.click();
    await page.keyboard.type('000000', { delay: 40 });
    const wrongCode = page.getByText(LANGUAGE === 'nl' ? /onjuist/i : /incorrect code/i).first();
    await expect(wrongCode).toBeVisible({ timeout: 30_000 });
    const wrongText = await visibleClerkText(page);
    await page.screenshot({ path: `${SHOTS}/wrong-code-recovery.png`, fullPage: true });
    const resend = page.getByRole('button', { name: /resend|opnieuw|didn.t receive/i }).or(page.locator('.cl-resendCodeLink'));
    await expect(resend.first()).toBeVisible();
    test.info().annotations.push({ type: 'wrong-code-state', description: wrongText });

    // Genuine completion with the test-identity code, then sign out.
    await codeInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(TEST_CODE, { delay: 40 });
    await page.waitForURL((url) => url.pathname === '/account/voorkeuren', { timeout: 60_000 });
    await page.evaluate(() => (window as ClerkWindow).Clerk!.signOut());
    await page.waitForFunction(() => (window as ClerkWindow).Clerk?.session == null);

    // Replay the consumed verification step.
    await page.goto(verifyUrl);
    await page.waitForFunction(() => (window as ClerkWindow).Clerk?.loaded === true, null, { timeout: 30_000 });
    // Clerk either shows the start of sign-up or a redirect; give it time to settle and record what it did.
    const startVisible = await page
      .locator('input[name="emailAddress"]')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const text = `${startVisible ? '' : '[no sign-up start form] '}${(await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()}`.slice(0, 600);
    await page.screenshot({ path: `${SHOTS}/consumed-verification-step.png`, fullPage: true });
    test.info().annotations.push(
      { type: 'clerk-identity', description: email },
      { type: 'clerk-state', description: text },
      { type: 'url', description: page.url() },
    );
    expect(await clerkSessionId(page)).toBeNull();
    // No code input for a sign-up attempt that no longer exists; the start of sign-up is offered instead.
    await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
    await expect(page.locator('input[name="emailAddress"]')).toBeVisible();
    const recovered = new URL(page.url());
    expect(recovered.pathname).toBe('/sign-up');
    expect(recovered.searchParams.get('terug'), 'return path survives the recovery redirect').toBe(returnPath);
  });
});

import { expect, test, type Page, type Route } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import environmentFixture from './fixtures/clerk-environment.json' with { type: 'json' };

/**
 * Offline regression for the stale sign-up step guard (`useStaleSignUpStepRecovery`).
 *
 * The Clerk Frontend API is stubbed entirely: `/v1/environment` answers with a
 * recorded development-instance payload (captcha disabled) and `/v1/client`
 * answers with a client that has no sign-up in progress. Only the two static
 * clerk-js / clerk-ui bundles are fetched from the CDN, and they are cached on
 * disk after the first run so repeat runs need no network at all.
 */

const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';
const frontendApiHost = Buffer.from(publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '');
const SCRIPT_CACHE = join(process.cwd(), 'node_modules', '.cache', 'clerk-scripts');

type StubbedClient = {
  id: string;
  signUp: null | { id: string; emailAddress: string };
};

function clientPayload(client: StubbedClient) {
  const now = 1_789_454_114_826;
  return {
    object: 'client',
    id: client.id,
    sessions: [],
    sign_in: null,
    sign_up: client.signUp
      ? {
          object: 'sign_up_attempt',
          id: client.signUp.id,
          status: 'missing_requirements',
          required_fields: ['email_address', 'password'],
          optional_fields: [],
          missing_fields: [],
          unverified_fields: ['email_address'],
          verifications: {
            email_address: {
              status: 'unverified',
              strategy: 'email_code',
              attempts: 0,
              expire_at: now + 600_000,
              next_action: 'needs_attempt',
              supported_strategies: ['email_code'],
            },
            phone_number: null,
            web3_wallet: null,
            external_account: null,
          },
          username: null,
          email_address: client.signUp.emailAddress,
          phone_number: null,
          web3_wallet: null,
          password_enabled: true,
          first_name: null,
          last_name: null,
          unsafe_metadata: {},
          public_metadata: {},
          custom_action: false,
          external_id: null,
          created_session_id: null,
          created_user_id: null,
          abandon_at: now + 86_400_000,
          legal_accepted_at: null,
        }
      : null,
    last_active_session_id: null,
    last_authentication_strategy: null,
    cookie_expires_at: null,
    captcha_bypass: false,
    created_at: now,
    updated_at: now,
  };
}

type FrontendApiLog = string[];

/** Answers every Clerk Frontend API call locally; serves the two CDN bundles from a disk cache. */
async function stubClerkFrontendApi(page: Page, client: StubbedClient): Promise<FrontendApiLog> {
  const log: FrontendApiLog = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/^https:\/\/challenges\.cloudflare\.com\//, (route) => route.abort());

  await page.route(new RegExp(`^https://${frontendApiHost.replace(/\./g, '\\.')}/`), async (route) => {
    const url = new URL(route.request().url());
    log.push(`${route.request().method()} ${url.pathname}`);

    if (url.pathname.startsWith('/npm/')) {
      mkdirSync(SCRIPT_CACHE, { recursive: true });
      const cached = join(SCRIPT_CACHE, `${createHash('sha1').update(url.pathname).digest('hex')}.js`);
      if (!existsSync(cached)) {
        const response = await route.fetch();
        if (!response.ok()) throw new Error(`clerk bundle ${url.pathname} responded ${response.status()}`);
        writeFileSync(cached, await response.body());
      }
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(cached) });
    }

    if (url.pathname === '/v1/environment') return json(route, { response: environmentFixture, client: null });
    if (url.pathname === '/v1/client') return json(route, { response: clientPayload(client), client: null });
    if (url.pathname === '/v1/dev_browser') return json(route, { id: 'dvb_offline_stub' });
    if (url.pathname.startsWith('/v1/client/')) {
      // Any mutation against the stubbed client (e.g. code submission) is out of scope for this spec.
      return json(route, { errors: [{ code: 'offline_stub', message: 'not available in the offline regression' }] }, 422);
    }
    return json(route, { errors: [{ code: 'offline_stub', message: `unstubbed ${url.pathname}` }] }, 404);
  });

  return log;
}

test.describe('stale sign-up verification step (offline)', () => {
  test.skip(!frontendApiHost, 'VITE_CLERK_PUBLISHABLE_KEY is required to derive the Clerk Frontend API host');

  test('opening the verification step without a sign-up in progress returns to the sign-up form', async ({ page }) => {
    const log = await stubClerkFrontendApi(page, { id: 'client_offline_empty', signUp: null });

    await page.goto('/sign-up/verify-email-address?terug=%2Fdeals');

    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe('/sign-up');
    expect(new URL(page.url()).searchParams.get('terug'), 'return path survives the recovery redirect').toBe('/deals');

    await expect(page.locator('input[name="emailAddress"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
    expect(log.some((entry) => /\/v1\/environment$/.test(entry)), 'environment came from the stub').toBe(true);
    expect(log).toContain('GET /v1/client');
  });

  test('a sign-up in progress keeps the verification step', async ({ page }) => {
    const log = await stubClerkFrontendApi(page, {
      id: 'client_offline_pending',
      signUp: { id: 'sua_offline_pending', emailAddress: 'buur+clerk_test@example.com' },
    });

    await page.goto('/sign-up/verify-email-address?terug=%2Fdeals');

    await expect(page.locator('input[autocomplete="one-time-code"]').first()).toBeVisible({ timeout: 20_000 });
    const current = new URL(page.url());
    expect(current.pathname).toBe('/sign-up/verify-email-address');
    expect(current.searchParams.get('terug')).toBe('/deals');
    await expect(page.locator('input[name="emailAddress"]')).toHaveCount(0);
    expect(log).toContain('GET /v1/client');
  });
});

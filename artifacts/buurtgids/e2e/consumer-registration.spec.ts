import { expect, test, type Route } from '@playwright/test';

/**
 * v0.5.1 consumer registration screens (§12.6, §12.7 A11Y) against a
 * route-mocked API: focus management after failed submits, error
 * association on the resend field, explicit-continue link consumption, and
 * the token never staying in the address bar or history.
 */

const TOKEN = 'A'.repeat(43);

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const apiError = (route: Route, code: string, status: number, extra: Record<string, unknown> = {}) =>
  json(route, { code, messageKey: `errors.${code.toLowerCase()}`, correlationId: 'e2e', ...extra }, status);

test.describe('consumer registration (v0.5.1)', () => {
  test('a failed submit moves focus to the first invalid field and announces it', async ({ page }) => {
    await page.route(/\/api\/consumer-registration$/, (route) =>
      apiError(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'email', code: 'invalid' }] }),
    );
    await page.goto('/account/register');
    await expect(page.getByTestId('heading-register')).toBeVisible();
    await page.getByTestId('input-register-name').fill('Test Persoon');
    await page.getByTestId('input-register-email').fill('not-an-address');
    await page.getByTestId('input-register-phone').fill('0612345678');
    await page.getByTestId('button-register-submit').click();

    const email = page.getByTestId('input-register-email');
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'register-email-error');
    await expect(page.getByTestId('error-register-email')).toBeVisible();
  });

  test('a server-side field error is mapped back to its field; a neutral 202 leads to check-email without the address in the URL', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route(/\/api\/consumer-registration$/, (route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) {
        return apiError(route, 'VALIDATION_FAILED', 400, { fieldErrors: [{ field: 'phone', code: 'invalid' }] });
      }
      return json(route, { status: 'accepted', linkLifetimeMinutes: 60 }, 202);
    });
    await page.goto('/account/register');
    await page.getByTestId('input-register-name').fill('Test Persoon');
    await page.getByTestId('input-register-email').fill('iemand@example.org');
    await page.getByTestId('input-register-phone').fill('+31612345678');
    await page.getByTestId('button-register-submit').click();
    await expect(page.getByTestId('input-register-phone')).toBeFocused();
    await expect(page.getByTestId('error-register-phone')).toBeVisible();

    await page.getByTestId('button-register-submit').click();
    await expect(page).toHaveURL(/\/account\/register\/check-email$/);
    expect(page.url()).not.toContain('example.org');
    await expect(page.getByTestId('heading-register-check-email')).toBeVisible();
    // The address is carried over for the resend form without appearing in the URL.
    await expect(page.getByTestId('input-resend-email')).toHaveValue('iemand@example.org');
    expect(bodies).toHaveLength(2);
    expect(Object.keys(bodies[1] as object).sort()).toEqual(['email', 'locale', 'name', 'phone']);
  });

  test('resend: an empty field is announced and focused; a 429 is a localized error, a 202 is a neutral notice', async ({ page }) => {
    let calls = 0;
    await page.route(/\/api\/consumer-registration\/resend$/, (route) => {
      calls += 1;
      return calls === 1
        ? apiError(route, 'RATE_LIMITED', 429)
        : json(route, { status: 'accepted', linkLifetimeMinutes: 60 }, 202);
    });
    await page.goto('/account/register/check-email');
    const input = page.getByTestId('input-resend-email');
    await page.getByTestId('button-register-resend').click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', 'resend-email-error');
    await expect(page.getByTestId('error-register-resend')).toBeVisible();

    await input.fill('iemand@example.org');
    await page.getByTestId('button-register-resend').click();
    await expect(page.getByTestId('error-register-resend')).toBeVisible();
    await expect(input).toBeFocused();

    await page.getByTestId('button-register-resend').click();
    const notice = page.getByTestId('status-register-resent');
    await expect(notice).toBeVisible();
    await expect(notice).toBeFocused();
    await expect(page.getByTestId('error-register-resend')).toHaveCount(0);
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('opening a link only inspects it; consumption needs an explicit action; the token leaves the address bar', async ({ page }) => {
    const seen: string[] = [];
    await page.route(/\/api\/consumer-registration\/verify(\?.*)?$/, (route) => {
      seen.push(route.request().method());
      if (route.request().method() === 'GET') {
        return json(route, { state: 'valid', canResend: false, locale: 'en', expiresAt: '2030-01-01T00:00:00.000Z' });
      }
      return json(route, { state: 'valid', canResend: false, locale: 'en' });
    });
    await page.goto(`/account/register/complete?token=${TOKEN}`);
    await expect(page.getByTestId('status-register-link-ready')).toBeVisible();
    await expect(page.getByTestId('status-register-link-ready')).toBeFocused();
    expect(page.url()).not.toContain(TOKEN);
    expect(seen).toEqual(['GET']);
    // The email's locale drives the screen language.
    await expect(page.getByTestId('heading-register-complete')).toHaveText('Continue registration');

    await page.getByTestId('button-register-continue').click();
    await expect(page.getByTestId('status-register-link-done')).toBeVisible();
    await expect(page.getByTestId('status-register-link-done')).toBeFocused();
    expect(seen).toEqual(['GET', 'POST']);
  });

  test('used, expired and superseded links show their own state with the right follow-up', async ({ page }) => {
    const states = ['used', 'expired', 'superseded'] as const;
    for (const state of states) {
      await page.route(/\/api\/consumer-registration\/verify(\?.*)?$/, (route) =>
        json(route, { state, canResend: state === 'expired', locale: 'nl' }),
      );
      await page.goto(`/account/register/complete?token=${TOKEN}`);
      await expect(page.getByTestId(`status-register-link-${state}`)).toBeVisible();
      await expect(page.getByTestId('button-register-continue')).toHaveCount(0);
      if (state === 'expired') await expect(page.getByTestId('link-register-request-new')).toBeVisible();
      await page.unroute(/\/api\/consumer-registration\/verify(\?.*)?$/);
    }
  });

  test('a missing or malformed token never calls the API', async ({ page }) => {
    let called = false;
    await page.route(/\/api\/consumer-registration\/verify/, (route) => {
      called = true;
      return json(route, { state: 'invalid', canResend: true });
    });
    await page.goto('/account/register/complete');
    await expect(page.getByTestId('status-register-link-invalid')).toBeVisible();
    expect(called).toBe(false);
  });
});

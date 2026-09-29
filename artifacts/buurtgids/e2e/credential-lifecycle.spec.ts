import { expect, test } from '@playwright/test';

/**
 * v0.5.2 credential lifecycle screens (REC-001–REC-013, AUTH-013/014) without
 * network access to the identity provider: the app-framed forgot/reset pages
 * validate locally, never place addresses in the URL, keep Dutch copy, and the
 * reset step explains itself when no request is active in this browser.
 */

test.describe('credential lifecycle (v0.5.2)', () => {
  test.beforeEach(async ({ page }) => {
    // Dutch first, like a returning visitor; the EN switch is exercised explicitly.
    await page.addInitScript(() => {
      if (!localStorage.getItem('buurtplaza-language')) localStorage.setItem('buurtplaza-language', 'nl');
    });
  });

  test('sign-in offers "forgot password" and the forgot page validates the address field in Dutch', async ({ page }) => {
    await page.goto('/sign-in?terug=%2Fdeals');
    const forgot = page.getByTestId('link-forgot-password');
    await expect(forgot).toHaveText('Wachtwoord vergeten?');
    await forgot.click();
    await expect(page).toHaveURL(/\/account\/wachtwoord-vergeten\?terug=%2Fdeals$/);
    await expect(page.getByTestId('heading-forgot-password')).toHaveText('Wachtwoord opnieuw instellen');
    await page.getByTestId('button-forgot-password-submit').click();
    const error = page.getByTestId('error-forgot-email');
    await expect(error).toHaveText('Dit veld is verplicht.');
    await expect(page.getByTestId('input-forgot-email')).toHaveAttribute('aria-describedby', 'forgot-email-error');
    await expect(page.getByTestId('input-forgot-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('link-forgot-password-sign-in')).toHaveAttribute('href', /\/sign-in\?terug=%2Fdeals$/);
  });

  test('the reset step without an active request explains how to restart; language switch keeps the state', async ({ page }) => {
    await page.goto('/account/wachtwoord-herstellen');
    await expect(page.getByTestId('status-reset-password-no-flow')).toContainText('Er is geen herstelaanvraag actief');
    await expect(page.getByTestId('link-reset-password-restart')).toHaveAttribute('href', /\/account\/wachtwoord-vergeten$/);
    await page.getByTestId('button-language-en').click();
    await expect(page.getByTestId('status-reset-password-no-flow')).toContainText('No reset request is active');
    await expect(page.getByTestId('heading-reset-password')).toHaveText('Choose a new password');
  });

  test('the security page requires a session and returns to itself after sign-in', async ({ page }) => {
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/sign-in\?terug=%2Faccount%2Fsecurity$/);
    await expect(page.getByTestId('link-forgot-password')).toHaveAttribute('href', /wachtwoord-vergeten\?terug=%2Faccount%2Fsecurity$/);
  });

  test('the sign-up card is prefilled from the tab-scoped handoff and never from the URL', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('buurtplaza.credential-handoff', JSON.stringify({ email: 'noor@example.com' })));
    await page.goto('/sign-up');
    const email = page.locator('input[name="emailAddress"]');
    await expect(email).toHaveValue('noor@example.com', { timeout: 20_000 });
    expect(page.url()).not.toContain('noor');
  });
});

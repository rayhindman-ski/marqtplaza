import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('email-change page frames provider verification in Dutch and English', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('buurtplaza-language', 'nl');
    (window as any).__accountTestAuth = { userId: 'email-e2e' };
  });
  await page.goto('/account/e-mail-wijzigen?e2eAccountAuth=1');
  await expect(page.getByTestId('heading-account-email-change')).toHaveText('E-mailadres wijzigen');
  await expect(page.getByLabel('Nieuw e-mailadres')).toBeVisible();
  await page.getByTestId('button-language-en').click();
  await expect(page.getByTestId('heading-account-email-change')).toHaveText('Change email address');
  await expect(page.getByLabel('New email address')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
  expect(results.violations.find((violation) => violation.id === 'color-contrast')?.nodes.filter((node) =>
    !node.any.some((check) => {
      const data = check.data as { fgColor?: string; bgColor?: string } | undefined;
      return data?.fgColor === '#f26a21' || data?.bgColor === '#f26a21';
    }) ) ?? []).toEqual([]);
});

test('recent-auth API denial presents a localized return-to-sign-in prompt', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('buurtplaza-language', 'nl');
    (window as any).__accountTestAuth = { userId: 'email-e2e' };
  });
  await page.route(/\/api\/account\/email-change\/start$/, (route) =>
    route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ error: 'recent_authentication_required', code: 'RECENT_AUTH_REQUIRED' }) }));
  await page.goto('/account/e-mail-wijzigen?e2eAccountAuth=1');
  await page.getByLabel('Nieuw e-mailadres').fill('new@example.test');
  await page.getByRole('button', { name: 'Verificatiecode versturen' }).click();
  await expect(page.getByTestId('prompt-recent-auth')).toContainText('Log opnieuw in');
  await expect(page.getByTestId('prompt-recent-auth').getByRole('link')).toHaveAttribute('href', /\/sign-in\?terug=/);
  await page.getByTestId('button-language-en').click();
  await expect(page.getByTestId('prompt-recent-auth')).toContainText('Sign in again');
});
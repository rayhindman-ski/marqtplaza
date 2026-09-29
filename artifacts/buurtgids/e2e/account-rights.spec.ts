import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('privacy rights are linked in both languages', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('buurtplaza-language', 'nl');
    (window as any).__accountTestAuth = { userId: 'rights-e2e' };
  });
  await page.goto('/account/privacy/rechten?e2eAccountAuth=1');
  await expect(page.getByTestId('heading-account-rights')).toHaveText('Jouw privacyrechten');
  for (const right of ['access', 'correction', 'export', 'deletion', 'restriction', 'objection', 'contact']) {
    await expect(page.getByTestId(`link-right-${right}`)).toBeVisible();
  }
  await page.getByTestId('button-language-en').click();
  await expect(page.getByTestId('heading-account-rights')).toHaveText('Your privacy rights');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
  expect(results.violations.find((violation) => violation.id === 'color-contrast')?.nodes.filter((node) =>
    !node.any.some((check) => {
      const data = check.data as { fgColor?: string; bgColor?: string } | undefined;
      return data?.fgColor === '#f26a21' || data?.bgColor === '#f26a21';
    }) ) ?? []).toEqual([]);
});
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const { route, title, banner, date } of [
  { route: '/voorwaarden', title: 'Voorwaarden', banner: 'Concepttekst — nog niet goedgekeurd', date: 'Ingangsdatum: nog niet vastgesteld' },
  { route: '/privacy', title: 'Privacyverklaring', banner: 'Concepttekst — nog niet goedgekeurd', date: 'Ingangsdatum: nog niet vastgesteld' },
  { route: '/terms', title: 'Terms', banner: 'Draft — not yet approved', date: 'Effective date: not yet set' },
  { route: '/privacy-notice', title: 'Privacy notice', banner: 'Draft — not yet approved', date: 'Effective date: not yet set' },
]) {
  test(`${route} renders the versioned draft and prints the same document`, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('buurtplaza-language', 'nl');
      (window as any).__printCalled = false;
      window.print = () => { (window as any).__printCalled = true; };
    });
    await page.goto(route);
    await expect(page.getByTestId('heading-legal-document')).toHaveText(title);
    await expect(page.getByTestId('legal-version')).toContainText('draft-2026-09');
    await expect(page.getByTestId('legal-effective-date')).toHaveText(date);
    await expect(page.getByTestId('legal-draft-banner')).toHaveText(banner);
    await page.getByTestId('button-legal-print').click();
    expect(await page.evaluate(() => (window as any).__printCalled)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
    expect(results.violations.find((violation) => violation.id === 'color-contrast')?.nodes.filter((node) =>
      !node.any.some((check) => {
        const data = check.data as { fgColor?: string; bgColor?: string } | undefined;
        return data?.fgColor === '#f26a21' || data?.bgColor === '#f26a21';
      }) ) ?? []).toEqual([]);
  });
}
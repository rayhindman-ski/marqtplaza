import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const { route, title, banner, date } of [
  { route: '/privacy', title: 'Privacyverklaring', banner: 'Concepttekst — nog niet goedgekeurd', date: 'Ingangsdatum: nog niet vastgesteld' },
  { route: '/terms', title: 'Voorwaarden', banner: 'Concepttekst — nog niet goedgekeurd', date: 'Ingangsdatum: nog niet vastgesteld' },
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
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('button-legal-pdf').click(),
    ]);
    const documentId = route === '/terms' ? 'voorwaarden'
      : route === '/privacy' ? 'privacyverklaring' : 'privacy-notice';
    const locale = route === '/privacy-notice' ? 'en' : 'nl';
    expect(download.suggestedFilename()).toBe(`buurtplaza-${documentId}-draft-2026-09-${locale}.pdf`);
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let prefix = '';
    for await (const chunk of stream!) { prefix += chunk.toString('latin1'); if (prefix.length >= 5) break; }
    expect(prefix.slice(0, 5)).toBe('%PDF-');
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

test('Dutch terms path redirects to the canonical terms URL', async ({ page }) => {
  await page.goto('/voorwaarden?terug=/account');
  await expect(page).toHaveURL(/\/terms\?terug=\/account$/);
});
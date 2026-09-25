import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Usability and readability gate.
 *
 * Every screen in SCREENS is scored with axe-core (WCAG 2.1 A/AA rules) at a
 * desktop and a phone viewport. A run fails on any "serious" or "critical"
 * violation; the complete violation list is attached to the report so the
 * score is inspectable, not just pass/fail.
 *
 * On top of the automated audit, the spec pins the readability rules that
 * axe cannot judge: every navigation entry in the stacked (phone) menu must
 * show its text label, the header may not push the map below the fold, and
 * no interactive control may be left without an accessible name.
 */

type Screen = { name: string; path: string; ready: string };

const SCREENS: Screen[] = [
  // The create-account entry lives inside the collapsed menu on phones, so the
  // search form is the visible readiness signal there.
  { name: 'homepage', path: '/', ready: 'input-postcode-search' },
  { name: 'discovery', path: '/activiteiten/den-haag', ready: 'discovery-results-map' },
  { name: 'consumer-register', path: '/account/register', ready: 'page-register' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * Known debt, budgeted so it cannot grow: the brand orange (#f26a21) on white
 * measures 3.06:1, below the 4.5:1 AA threshold for normal text. Lifting it is
 * a brand decision (it recolours every primary button, pin and badge), so the
 * gate records the count per screen and fails only when a screen gets worse.
 * Lower a number here when the debt is paid; never raise one.
 */
const BRAND_ORANGE = '#f26a21';
const COLOR_CONTRAST_BUDGET: Record<string, number> = {
  'homepage@desktop': 2,
  'homepage@phone': 2,
  'discovery@desktop': 4,
  'discovery@phone': 2,
  'consumer-register@desktop': 5,
  'consumer-register@phone': 5,
};

async function stubNetwork(page: Page) {
  await page.route('https://maps.googleapis.com/**', (route) => route.abort('failed'));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort('failed'));
  // A representative listing so cards, badges and the results list are audited too.
  await page.route('**/api/listings*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'curated',
      listings: [{
        id: 'a11y-event', locationId: 'dhg', category: 'Family', name: 'Readability test event',
        description: 'Listing used to audit card readability.', details: 'Today',
        startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(), x: 50, y: 50, lat: 52.0786, lng: 4.308,
        activityKind: 'family', priceType: 'free', isIndoor: true, openNow: true,
        website: 'https://example.org',
      }],
    }),
  }));
  await page.route('**/api/weather*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      cityId: 'dhg', locationName: 'Den Haag', fetchedAt: new Date().toISOString(),
      current: { temperature: 18, apparentTemperature: 18, precipitation: 0, windSpeed: 5, weatherCode: 0, condition: 'clear', isDay: true },
      forecast: [], provider: 'open-meteo',
    }),
  }));
}

async function open(page: Page, screen: Screen) {
  await stubNetwork(page);
  await page.goto(`${screen.path}${screen.path.includes('?') ? '&' : '?'}e2eAccountAuth=1`);
  await page.getByTestId(screen.ready).first().waitFor({ state: 'visible', timeout: 20_000 });
  if (screen.name === 'discovery') {
    await page.locator('[data-event-list] [data-event-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
  }
  // Let async widgets (weather, auth, map fallback) settle before scoring.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

test.describe('usability and readability gate', () => {
  for (const viewport of VIEWPORTS) {
    for (const screen of SCREENS) {
      test(`${screen.name} @ ${viewport.name}: no serious or critical accessibility violations`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await open(page, screen);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          // Third-party map canvases and the Clerk iframe are outside app control.
          .exclude('.gm-style')
          .exclude('iframe')
          .analyze();

        const summary = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
        }));
        await testInfo.attach(`axe-${screen.name}-${viewport.name}.json`, {
          contentType: 'application/json',
          body: JSON.stringify({ passes: results.passes.length, incomplete: results.incomplete.length, violations: summary }, null, 2),
        });
        testInfo.annotations.push({
          type: 'a11y-score',
          description: `${screen.name}@${viewport.name}: ${results.passes.length} rules pass, ${summary.length} violations (${summary.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? '')).length} blocking)`,
        });

        const key = `${screen.name}@${viewport.name}`;
        const contrast = results.violations.find((v) => v.id === 'color-contrast');
        const contrastNodes = contrast?.nodes.length ?? 0;
        // Only the documented brand-orange pair is tolerated; any other unreadable
        // colour combination fails immediately, whatever the count.
        const foreign = (contrast?.nodes ?? [])
          .filter((n) => !n.any.some((check) => {
            const data = check.data as { fgColor?: string; bgColor?: string } | undefined;
            return data?.fgColor === BRAND_ORANGE || data?.bgColor === BRAND_ORANGE;
          }))
          .map((n) => ({ target: n.target.join(' '), summary: n.failureSummary }));
        expect(foreign, `${key}: unreadable colour pairs outside the brand-orange exception`).toEqual([]);
        testInfo.annotations.push({ type: 'color-contrast', description: `${key}: ${contrastNodes} nodes (budget ${COLOR_CONTRAST_BUDGET[key]})` });
        expect(contrastNodes, `${key}: colour-contrast debt grew beyond its budget`).toBeLessThanOrEqual(COLOR_CONTRAST_BUDGET[key]);

        const blocking = summary.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? '') && v.id !== 'color-contrast');
        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      });
    }
  }

  test('phone: the stacked navigation menu shows a readable text label for every entry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, SCREENS[1]);
    const nav = page.getByRole('navigation', { name: /primary navigation|hoofdnavigatie/i });
    await nav.getByRole('button', { name: /open menu|menu openen/i }).click();
    const entries = nav.locator('#primary-navigation-links a, #primary-navigation-links button');
    const count = await entries.count();
    expect(count).toBeGreaterThan(5);
    for (let index = 0; index < count; index += 1) {
      const entry = entries.nth(index);
      const text = (await entry.innerText()).trim();
      expect(text, `navigation entry ${index} must show a visible label on phones`).not.toEqual('');
      const box = await entry.boundingBox();
      expect(box && box.height >= 44, `navigation entry "${text}" must keep a 44px tap target`).toBe(true);
    }
    // Two entries with the same word (or the same glyph) cannot be told apart.
    const labels = await entries.allInnerTexts();
    const duplicates = labels.map((l) => l.trim()).filter((l, i, all) => all.indexOf(l) !== i);
    expect(duplicates, 'navigation labels must be unique').toEqual([]);
    const glyphs = await entries.locator('svg').evaluateAll((svgs) => svgs.map((svg) => svg.innerHTML));
    const dupGlyphs = glyphs.filter((g, i, all) => all.indexOf(g) !== i);
    expect(dupGlyphs.length, 'navigation icons must be unique').toBe(0);
    const menu = nav.locator('#primary-navigation-links');
    const menuBox = await menu.boundingBox();
    expect(menuBox && menuBox.width <= 390, 'the phone menu must not overflow the viewport').toBe(true);
  });

  test('phone: the discovery header keeps the map in the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, SCREENS[1]);
    const map = page.getByTestId('discovery-results-map').first();
    const box = await map.boundingBox();
    expect(box, 'map is rendered').not.toBeNull();
    expect(box!.y, 'the map must start inside the first viewport height').toBeLessThan(844 * 0.5);
  });

  test('desktop: every interactive control has an accessible name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const screen of SCREENS) {
      await open(page, screen);
      const unnamed = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, select, input:not([type="hidden"]), textarea'));
        return controls
          .filter((el) => !el.closest('iframe') && el.offsetParent !== null)
          .filter((el) => {
            const name = el.getAttribute('aria-label')
              || el.getAttribute('aria-labelledby')
              || el.getAttribute('title')
              || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent)
              || el.closest('label')?.textContent
              || (el as HTMLInputElement).placeholder
              || el.textContent;
            return !name || !name.trim();
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`);
      });
      expect(unnamed, `${screen.name}: controls without an accessible name`).toEqual([]);
    }
  });
});

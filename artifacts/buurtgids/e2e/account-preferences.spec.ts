import { expect, test, type Page, type Route } from '@playwright/test';

type Preferences = {
  revision: number;
  neighborhoodIds: string[];
  interestIds: string[];
  unresolvedNeighborhoodIds?: string[];
  unresolvedInterestIds?: string[];
  updatedAt: string;
};
type Me = {
  id: number;
  status: 'active';
  role: 'user';
  locale: 'nl' | 'en';
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  capabilities: Record<string, boolean>;
  hasResearchRegistration: boolean;
  businessMembershipCount: number;
  preferences: Preferences | null;
  createdAt: string;
};

const OPTIONS = {
  taxonomyVersion: 'provisional-2026-09',
  neighborhoods: [
    { id: 'dhg:zeeheldenkwartier', label: { nl: 'Zeeheldenkwartier', en: 'Zeeheldenkwartier' } },
    { id: 'dhg:statenkwartier', label: { nl: 'Statenkwartier', en: 'Statenkwartier' } },
  ],
  interests: [
    { id: 'category:food-and-drink', label: { nl: 'Eten & drinken', en: 'Food & drink' } },
    { id: 'category:family', label: { nl: 'Gezin', en: 'Family' } },
  ],
};

const capabilities = (verified = true) => ({
  isVerified: verified,
  isEditor: false,
  canReview: false,
  isBusinessMember: false,
  canClaimBusiness: false,
  canPublishBusiness: false,
});

function baseMe(overrides: Partial<Me> = {}): Me {
  return {
    id: 1,
    status: 'active',
    role: 'user',
    locale: 'nl',
    onboardingCompleted: false,
    onboardingCompletedAt: null,
    capabilities: capabilities(),
    hasResearchRegistration: false,
    businessMembershipCount: 0,
    preferences: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

type Recorded = { method: string; path: string; body: unknown; auth: string | undefined };

type FakeAccountServer = {
  me: Me;
  requests: Recorded[];
  nextPatch?: (body: any) => { status: number; body: unknown } | null;
  consentHistory: Array<{ id: number; consentType: string; noticeVersion: string; granted: boolean; source: string; createdAt: string }>;
};

async function installAccountServer(page: Page, initial: Partial<Me> = {}): Promise<FakeAccountServer> {
  const state: FakeAccountServer = { me: baseMe(initial), requests: [], consentHistory: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const record = (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData() ? request.postDataJSON() : null,
      auth: request.headers().authorization,
    });
  };
  const consentsBody = () => {
    const latest = new Map<string, (typeof state.consentHistory)[number]>();
    for (const event of state.consentHistory) latest.set(event.consentType, event);
    return {
      currentNoticeVersion: 'draft-2026-09',
      purposes: ['marketing_updates', 'research_contact'],
      current: [...latest.values()].map((event) => ({
        consentType: event.consentType,
        granted: event.granted,
        noticeVersion: event.noticeVersion,
        recordedAt: event.createdAt,
      })),
      history: state.consentHistory,
    };
  };

  await page.route('**/api/account/**', async (route) => {
    record(route);
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!request.headers().authorization?.startsWith('Bearer e2e-token:')) {
      return json(route, { code: 'AUTH_REQUIRED', messageKey: 'errors.auth_required', correlationId: 'e2e' }, 401);
    }
    if (path.endsWith('/account/options')) return json(route, OPTIONS);
    if (path.endsWith('/account/me')) return json(route, state.me);
    if (path.endsWith('/account/onboarding/complete')) {
      state.me = { ...state.me, onboardingCompleted: true, onboardingCompletedAt: state.me.onboardingCompletedAt ?? new Date().toISOString() };
      return json(route, state.me);
    }
    if (path.endsWith('/account/preferences') && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      const override = state.nextPatch?.(body);
      if (override) return json(route, override.body, override.status);
      const current = state.me.preferences?.revision ?? 0;
      if (body.expectedRevision !== current) {
        return json(route, { code: 'VERSION_CONFLICT', messageKey: 'errors.version_conflict', correlationId: 'e2e', expectedVersion: current }, 409);
      }
      state.me = {
        ...state.me,
        locale: body.locale ?? state.me.locale,
        preferences: {
          revision: current + 1,
          neighborhoodIds: body.neighborhoodIds ?? state.me.preferences?.neighborhoodIds ?? [],
          interestIds: body.interestIds ?? state.me.preferences?.interestIds ?? [],
          unresolvedNeighborhoodIds: (body.neighborhoodIds ?? state.me.preferences?.neighborhoodIds ?? []).filter(
            (id: string) => !OPTIONS.neighborhoods.some((option) => option.id === id),
          ),
          unresolvedInterestIds: (body.interestIds ?? state.me.preferences?.interestIds ?? []).filter(
            (id: string) => !OPTIONS.interests.some((option) => option.id === id),
          ),
          updatedAt: new Date().toISOString(),
        },
      };
      return json(route, state.me);
    }
    if (path.endsWith('/account/consents') && request.method() === 'GET') return json(route, consentsBody());
    if (path.endsWith('/account/consents') && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.consentHistory.push({ id: state.consentHistory.length + 1, ...body, createdAt: new Date().toISOString() });
      return json(route, consentsBody());
    }
    return json(route, { code: 'NOT_FOUND', messageKey: 'errors.not_found', correlationId: 'e2e' }, 404);
  });
  await page.route('**/api/registration', (route) => json(route, { registered: false, registration: null }));
  return state;
}

async function signIn(page: Page, userId = 'user-e2e') {
  await page.addInitScript((id) => {
    (window as Window & { __accountTestAuth?: { userId: string | null } }).__accountTestAuth = { userId: id };
  }, userId);
}

test.describe('consumer account journey', () => {
  test('anonymous discovery never prompts for an account', async ({ page }) => {
    await page.route('**/api/listings*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ source: 'curated', listings: [] }) }));
    await page.goto('/activiteiten/den-haag');
    await expect(page).toHaveURL(/\/activiteiten\/den-haag/);
    await expect(page.getByTestId('page-account')).toHaveCount(0);
    await expect(page.getByTestId('page-account-preferences')).toHaveCount(0);
  });

  test('signed-out visitors are sent to sign-in with a safe return path', async ({ page }) => {
    await page.goto('/account/voorkeuren?e2eAccountAuth=1&terug=%2Fdeals');
    await expect(page).toHaveURL(/\/sign-in\?terug=%2Faccount%2Fvoorkeuren/);
  });

  test('keeps the originating route when account links open preferences', async ({ page }) => {
    await signIn(page);
    await installAccountServer(page);
    await page.goto('/?e2eAccountAuth=1');

    const accountLink = page.getByRole('link', { name: /Mijn account|My account/ });
    await expect(accountLink).toHaveAttribute('href', '/account?terug=%2F%3Fe2eAccountAuth%3D1');
    await accountLink.click();
    await expect(page).toHaveURL(/\/account\?terug=%2F%3Fe2eAccountAuth%3D1$/);

    const preferencesLink = page.getByTestId('link-edit-preferences');
    await expect(preferencesLink).toHaveAttribute('href', '/account/voorkeuren?terug=%2F%3Fe2eAccountAuth%3D1');
    await preferencesLink.click();
    await expect(page).toHaveURL(/\/account\/voorkeuren\?terug=%2F%3Fe2eAccountAuth%3D1$/);
  });

  test('saves controlled preferences, keeps the draft across language switch and refresh, and resumes', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page);
    await page.goto('/account/voorkeuren?e2eAccountAuth=1&terug=%2Fdeals');

    await expect(page.getByTestId('heading-account-preferences')).toBeVisible();
    await page.getByTestId('button-language-nl').click();
    await expect(page.getByTestId('heading-account-preferences')).toHaveText('Wat wil je het eerst zien?');
    await page.getByTestId('checkbox-dhg:zeeheldenkwartier').check();
    await page.getByTestId('checkbox-category:food-and-drink').check();
    await page.getByTestId('radio-locale-en').check();

    await page.getByTestId('button-language-en').click();
    await expect(page.getByTestId('heading-account-preferences')).toHaveText('What would you like to see first?');
    await expect(page.getByTestId('page-account-preferences')).not.toContainText(/\b(Opslaan|Overslaan|Buurten|Interesses|Taal)\b/);
    await expect(page.getByTestId('checkbox-dhg:zeeheldenkwartier')).toBeChecked();
    await expect(page.getByTestId('count-neighborhoodIds')).toHaveText('1 selected');

    await page.reload();
    await expect(page.getByTestId('checkbox-dhg:zeeheldenkwartier')).toBeChecked();
    await expect(page.getByTestId('checkbox-category:food-and-drink')).toBeChecked();
    await expect(page.getByTestId('radio-locale-en')).toBeChecked();

    await page.getByTestId('button-preferences-save').click();
    await expect(page.getByTestId('status-preferences-saved')).toBeVisible();
    await expect(page.getByTestId('summary-neighborhoods')).toHaveText('Zeeheldenkwartier');
    await expect(page.getByTestId('summary-interests')).toHaveText('Food & drink');

    const patch = server.requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toEqual({
      expectedRevision: 0,
      locale: 'en',
      neighborhoodIds: ['dhg:zeeheldenkwartier'],
      interestIds: ['category:food-and-drink'],
    });
    expect(patch?.auth).toBe('Bearer e2e-token:user-e2e');
    expect(server.requests.some((request) => request.path.endsWith('/onboarding/complete'))).toBe(true);

    await page.getByTestId('button-preferences-continue').click();
    await expect(page).toHaveURL(/\/deals$/);
  });

  test('skipping completes onboarding without saving anything and ignores unsafe return URLs', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page);
    await page.goto('/account/voorkeuren?e2eAccountAuth=1&terug=https%3A%2F%2Fevil.example%2F');
    await page.getByTestId('button-preferences-skip').click();
    await expect(page.getByTestId('status-preferences-skipped')).toBeVisible();
    expect(server.requests.some((request) => request.method === 'PATCH')).toBe(false);
    expect(server.me.onboardingCompleted).toBe(true);
    expect(server.me.preferences).toBeNull();
    await page.getByTestId('button-preferences-continue').click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test('a stale revision keeps the draft, explains the conflict, and saves after reload', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page, {
      onboardingCompleted: true,
      onboardingCompletedAt: '2026-09-02T00:00:00.000Z',
      preferences: { revision: 2, neighborhoodIds: ['dhg:statenkwartier'], interestIds: [], updatedAt: '2026-09-02T00:00:00.000Z' },
    });
    await page.goto('/account/voorkeuren?e2eAccountAuth=1');
    await expect(page.getByTestId('heading-account-preferences')).toHaveText(/Edit preferences|Voorkeuren aanpassen/);
    await expect(page.getByTestId('checkbox-dhg:statenkwartier')).toBeChecked();
    await expect(page.getByTestId('button-preferences-cancel')).toBeVisible();

    // Another tab saved in between: bump the server revision under our feet.
    server.me = { ...server.me, preferences: { ...server.me.preferences!, revision: 3 } };
    await page.getByTestId('checkbox-category:family').check();
    await page.getByTestId('button-preferences-save').click();

    const conflict = page.getByTestId('status-preferences-conflict');
    await expect(conflict).toBeVisible();
    await expect(conflict).toBeFocused();
    await expect(page.getByTestId('checkbox-category:family')).toBeChecked();

    await page.getByTestId('button-preferences-reload').click();
    await expect(conflict).toHaveCount(0);
    await page.getByTestId('button-preferences-save').click();
    await expect(page.getByTestId('status-preferences-saved')).toBeVisible();
    const patches = server.requests.filter((request) => request.method === 'PATCH');
    expect(patches.map((request) => (request.body as any).expectedRevision)).toEqual([2, 3]);
    expect(server.me.preferences?.interestIds).toEqual(['category:family']);
  });

  test('shows legacy choices as unavailable and removes them explicitly', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page, {
      onboardingCompleted: true,
      onboardingCompletedAt: '2026-09-02T00:00:00.000Z',
      preferences: {
        revision: 4,
        neighborhoodIds: ['dhg:retired-neighborhood', 'dhg:statenkwartier'],
        interestIds: ['category:retired-interest'],
        unresolvedNeighborhoodIds: ['dhg:retired-neighborhood'],
        unresolvedInterestIds: ['category:retired-interest'],
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    });
    await page.goto('/account/voorkeuren?e2eAccountAuth=1');

    await expect(page.getByRole('checkbox', { name: /No longer available|Niet meer beschikbaar/ })).toHaveCount(2);
    await page.locator('input[value="dhg:retired-neighborhood"]').evaluate((element) => (element as HTMLInputElement).click());
    await expect(page.locator('input[value="dhg:retired-neighborhood"]')).toHaveCount(0);
    await page.getByTestId('button-preferences-save').click();
    await expect(page.getByTestId('status-preferences-saved')).toBeVisible();
    await expect(page.getByTestId('summary-neighborhoods')).toContainText('Statenkwartier');
    await expect(page.getByTestId('summary-neighborhoods')).not.toContainText('No longer available');
    await expect(page.getByTestId('summary-interests')).toContainText('No longer available');

    expect(server.me.preferences?.neighborhoodIds).toEqual(['dhg:statenkwartier']);
    expect(server.me.preferences?.interestIds).toEqual(['category:retired-interest']);
  });

  test('failed saves keep input and move focus to a localized error', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page);
    server.nextPatch = () => ({
      status: 400,
      body: {
        code: 'VALIDATION_FAILED',
        messageKey: 'errors.validation_failed',
        correlationId: 'e2e',
        fieldErrors: [{ field: 'neighborhoodIds.dhg:zeeheldenkwartier', code: 'not_in_controlled_list' }],
      },
    });
    await page.goto('/account/voorkeuren?e2eAccountAuth=1');
    await page.getByTestId('button-language-nl').click();
    await page.getByTestId('checkbox-dhg:zeeheldenkwartier').check();
    await page.getByTestId('button-preferences-save').click();
    const error = page.getByTestId('status-preferences-error');
    await expect(error).toBeVisible();
    await expect(error).toBeFocused();
    await expect(error).toContainText('Een of meer keuzes zijn niet geldig.');
    await expect(error).toContainText('staat niet in de keuzelijst');
    await expect(page.getByTestId('checkbox-dhg:zeeheldenkwartier')).toBeChecked();
  });

  test('the account page separates account, registration, saved data, and consents', async ({ page }) => {
    await signIn(page);
    const server = await installAccountServer(page, { onboardingCompleted: true, onboardingCompletedAt: '2026-09-02T00:00:00.000Z' });
    await page.goto('/account?e2eAccountAuth=1');
    // Full-screen NL/EN parity: no Dutch marker words remain in English and vice versa.
    const dutchMarkers = /\b(Registratie|Meedoen|voorkeuren|Toestemmingen|Uitloggen|Opgeslagen|Onderzoeksregistratie)\b/;
    const englishMarkers = /\b(Registration|Take part|preferences|Consents|Sign out|Saved|Research registration)\b/;
    await page.getByTestId('button-language-en').click();
    await expect(page.getByTestId('heading-account')).toHaveText('Your account');
    await expect(page.getByTestId('heading-registration')).toHaveText('Take part in MarqtPlaza');
    await expect(page.getByTestId('page-account')).not.toContainText(dutchMarkers);
    await page.getByTestId('button-language-nl').click();
    await expect(page.getByTestId('heading-account')).toHaveText('Jouw account');
    await expect(page.getByTestId('heading-registration')).toHaveText('Meedoen met MarqtPlaza');
    await expect(page.getByTestId('page-account')).not.toContainText(englishMarkers);
    await page.getByTestId('button-language-en').click();
    await expect(page.getByTestId('summary-none')).toBeVisible();
    await expect(page.getByTestId('scope-account')).toBeVisible();
    await expect(page.getByTestId('scope-registration')).toBeVisible();
    await expect(page.getByTestId('scope-saved')).toBeVisible();
    await expect(page.getByTestId('scope-consent')).toBeVisible();
    await expect(page.getByTestId('link-registration')).toBeVisible();
    await expect(page.getByTestId('consent-state-marketing_updates')).toHaveText('Not chosen yet');

    await page.getByTestId('button-consent-marketing_updates-on').click();
    await expect(page.getByTestId('consent-state-marketing_updates')).toContainText('On');
    const consent = server.requests.find((request) => request.method === 'POST' && request.path.endsWith('/consents'));
    expect(consent?.body).toEqual({ consentType: 'marketing_updates', noticeVersion: 'draft-2026-09', granted: true, source: 'account_settings' });

    await page.getByTestId('link-edit-preferences').click();
    await expect(page).toHaveURL(/\/account\/voorkeuren$/);
  });

  test('a disabled account gate shows an explicit unavailable state', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/account/**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'FEATURE_DISABLED', messageKey: 'errors.feature_disabled', correlationId: 'e2e' }) }));
    await page.route('**/api/registration', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ registered: false, registration: null }) }));
    await page.goto('/account/voorkeuren?e2eAccountAuth=1');
    await expect(page.getByTestId('status-account-unavailable')).toBeVisible();
  });
});

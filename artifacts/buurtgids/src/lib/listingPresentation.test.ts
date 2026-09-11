import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Marker } from './data';
import { translations } from './i18n';
import {
  formatEventTiming,
  freshnessBadge,
  isVerificationStale,
  lastVerifiedLabel,
  matchesDiscoveryQuickFilters,
  routeUrl,
} from './listingPresentation';

const marker: Marker = {
  id: 'event-1',
  locationId: 'dhg',
  category: 'Family',
  name: 'Family workshop',
  description: 'An indoor activity for families.',
  details: 'Today',
  startsAt: '2026-08-27T14:00:00Z',
  x: 50,
  y: 50,
  lat: 52.071,
  lng: 4.301,
  activityKind: 'family',
  priceType: 'free',
  isIndoor: true,
  openNow: true,
};

describe('listing presentation', () => {
  it('formats deterministic relative event timing in both languages', () => {
    const now = new Date('2026-08-27T12:00:00Z');
    assert.equal(formatEventTiming(marker.startsAt, 'en', now), 'Starts in 2 hours');
    assert.equal(formatEventTiming(marker.startsAt, 'nl', now), 'Start over 2 uur');
    assert.equal(
      formatEventTiming('2026-08-27T11:30:00Z', 'en', now),
      'Happening now',
    );
    assert.equal(formatEventTiming('2026-08-27', 'en', now), 'Today');
    assert.equal(formatEventTiming('2026-08-28', 'nl', now), 'Morgen');
  });

  it('combines quick filters instead of replacing earlier choices', () => {
    const filters = new Set(['today', 'free', 'family', 'indoor', 'open-now'] as const);
    assert.equal(
      matchesDiscoveryQuickFilters(marker, filters, {
        now: new Date('2026-08-27T10:00:00Z'),
      }),
      true,
    );
    assert.equal(
      matchesDiscoveryQuickFilters({ ...marker, priceType: 'paid' }, filters, {
        now: new Date('2026-08-27T10:00:00Z'),
      }),
      false,
    );
  });

  it('applies the nearby radius and refuses approximate route destinations', () => {
    const nearby = new Set(['nearby'] as const);
    assert.equal(
      matchesDiscoveryQuickFilters(marker, nearby, {
        nearbyOrigin: { lat: 52.0705, lng: 4.3007 },
      }),
      true,
    );
    const routeModes = ['driving', 'bicycling', 'walking', 'transit'] as const;
    for (const mode of routeModes) {
      const url = routeUrl(marker, mode);
      assert.ok(url, `expected a route URL for ${mode}`);
      assert.match(url, new RegExp(`travelmode=${mode}`));
      assert.match(url, /destination=Family%20workshop%2C%2052\.071%2C%204\.301/);
    }

    const approximateMarker = { ...marker, isApproximateLocation: true };
    for (const mode of routeModes) {
      assert.equal(routeUrl(approximateMarker, mode), null, `approximate marker exposed ${mode} directions`);
    }
  });

  it('keeps every active quick filter conjunctive', () => {
    const filters = new Set([
      'today',
      'week',
      'nearby',
      'free',
      'family',
      'indoor',
      'open-now',
    ] as const);
    const now = new Date('2026-08-27T10:00:00Z');

    assert.equal(
      matchesDiscoveryQuickFilters(marker, filters, {
        now,
        nearbyOrigin: { lat: 52.0705, lng: 4.3007 },
      }),
      true,
    );
    assert.equal(
      matchesDiscoveryQuickFilters(
        { ...marker, isIndoor: false },
        filters,
        { now, nearbyOrigin: { lat: 52.0705, lng: 4.3007 } },
      ),
      false,
    );
    assert.equal(
      matchesDiscoveryQuickFilters(
        { ...marker, lat: 52.11, lng: 4.35 },
        filters,
        { now, nearbyOrigin: { lat: 52.0705, lng: 4.3007 } },
      ),
      false,
    );
  });

  it('keeps discovery category labels available in English and Dutch', () => {
    assert.equal(translations.en.categories.Family, 'Family & Kids');
    assert.equal(translations.nl.categories.Family, 'Gezin & Kinderen');
  });

  it('only labels recent timestamps as fresh', () => {
    const now = new Date('2026-08-27T12:00:00Z');
    assert.equal(
      freshnessBadge({ updatedAt: '2026-08-26T12:00:00Z' }, 'en', now),
      'Updated recently',
    );
    assert.equal(
      freshnessBadge({ updatedAt: '2026-07-01T12:00:00Z' }, 'en', now),
      null,
    );
  });
});

describe('lastVerifiedLabel', () => {
  const now = new Date('2026-08-27T12:00:00Z');

  it('returns null when the listing has no source', () => {
    assert.equal(lastVerifiedLabel({ lastCheckedAt: now.toISOString() }, 'en', now), null);
  });

  it('returns null when a sourced listing has no timestamp at all', () => {
    assert.equal(lastVerifiedLabel({ source: 'google_maps' }, 'en', now), null);
  });

  it('labels a just-fetched live listing as verified just now', () => {
    assert.equal(
      lastVerifiedLabel({ source: 'google_maps', lastCheckedAt: now.toISOString() }, 'en', now),
      'Verified just now',
    );
  });

  it('labels timestamps a few hours old in hours (NL)', () => {
    const checked = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(
      lastVerifiedLabel({ source: 'openstreetmap', lastCheckedAt: checked }, 'nl', now),
      '3 uur geleden geverifieerd',
    );
  });

  it('labels timestamps a few days old in days', () => {
    const checked = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      lastVerifiedLabel({ source: 'openstreetmap', lastCheckedAt: checked }, 'en', now),
      'Verified 3 days ago',
    );
  });

  it('falls back to an absolute date once older than 30 days', () => {
    const checked = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      lastVerifiedLabel({ source: 'source_scan', lastCheckedAt: checked }, 'en', now),
      'Verified on 13 Jul 2026',
    );
  });

  it('prefers lastCheckedAt over updatedAt/snapshotDate when present', () => {
    assert.equal(
      lastVerifiedLabel(
        { source: 'google_maps', lastCheckedAt: now.toISOString(), updatedAt: '2020-01-01T00:00:00Z' },
        'en',
        now,
      ),
      'Verified just now',
    );
  });
});

describe('isVerificationStale', () => {
  const now = new Date('2026-08-27T12:00:00Z');

  it('is never stale for listings without a source', () => {
    assert.equal(isVerificationStale({}, now), false);
  });

  it('treats a sourced listing with no timestamp as stale', () => {
    assert.equal(isVerificationStale({ source: 'google_maps' }, now), true);
  });

  it('is not stale within the 30-day SLA', () => {
    const checked = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isVerificationStale({ source: 'openstreetmap', lastCheckedAt: checked }, now), false);
  });

  it('is stale once past the 30-day SLA', () => {
    const checked = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isVerificationStale({ source: 'openstreetmap', lastCheckedAt: checked }, now), true);
  });
});
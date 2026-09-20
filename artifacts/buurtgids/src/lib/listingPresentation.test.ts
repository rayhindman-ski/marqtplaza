import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Marker } from './data';
import { translations } from './i18n';
import {
  formatEventTiming,
  freshnessBadge,
  matchesDiscoveryQuickFilters,
  routeUrl,
} from './listingPresentation';
import { formatNewsPublishedAt } from './newsDate';
import { enUS, nl } from 'date-fns/locale';

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
  it('labels missing or malformed news dates honestly in both languages', () => {
    assert.equal(formatNewsPublishedAt(undefined, 'en', 'd MMM yyyy', enUS), 'Date unknown');
    assert.equal(formatNewsPublishedAt('not-a-date', 'nl', 'd MMM yyyy', nl), 'Datum onbekend');
    assert.equal(formatNewsPublishedAt('2026-09-15T10:00:00.000Z', 'en', 'd MMM yyyy', enUS), '15 Sep 2026');
  });

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

  it('uses exact coordinates for routes and refuses approximate destinations', () => {
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
      assert.equal(new URL(url).searchParams.get('destination'), '52.071,4.301');
    }

    const approximateMarker = { ...marker, isApproximateLocation: true };
    for (const mode of routeModes) {
      assert.equal(routeUrl(approximateMarker, mode), null, `approximate marker exposed ${mode} directions`);
    }
  });

  it('does not mix event names into Google Maps route destinations', () => {
    const url = routeUrl({
      ...marker,
      name: 'Golden Stage – The Indo on screen',
      lat: 52.086869,
      lng: 4.306416,
    }, 'driving');

    assert.ok(url);
    const destination = new URL(url).searchParams.get('destination');
    assert.equal(destination, '52.086869,4.306416');
    assert.equal(destination?.includes('Golden Stage'), false);
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
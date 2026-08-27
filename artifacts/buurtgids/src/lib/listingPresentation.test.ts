import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Marker } from './data';
import {
  formatEventTiming,
  freshnessBadge,
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
    assert.match(routeUrl(marker, 'bicycling') ?? '', /travelmode=bicycling/);
    assert.equal(routeUrl({ ...marker, isApproximateLocation: true }, 'walking'), null);
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
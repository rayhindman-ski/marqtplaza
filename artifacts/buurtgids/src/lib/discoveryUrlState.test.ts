import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalizeDiscoveryUrl,
  discoveryNeighborhoodSlugs,
  neighborhoodSlug,
  parseDiscoveryUrlState,
  resolveNeighborhood,
  serializeDiscoveryUrlState,
} from './discoveryUrlState';

describe('public discovery URL state', () => {
  it('parses the complete allowlisted state and resolves a slug to the data name', () => {
    const parsed = parseDiscoveryUrlState(
      '?locale=nl&city=den-haag&section=food-drink&neighborhood=laakkwartier-en-spoorwijk&postcode=2511%20ab&scope=web',
    );
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.state, {
      locale: 'nl',
      city: 'den-haag',
      section: 'food-drink',
      neighborhood: 'Laakkwartier en Spoorwijk',
      postcode: '2511AB',
      scope: 'web',
    });
    assert.equal(parsed.canonical, 'locale=nl&section=food-drink&neighborhood=laakkwartier-en-spoorwijk&postcode=2511AB&scope=web');
  });

  it('accepts old display-name neighbourhood and postcode inputs, then canonicalizes them', () => {
    const parsed = parseDiscoveryUrlState({
      neighborhood: '  Centrum ',
      postcode: '2511',
      section: 'businesses',
    });
    assert.equal(parsed.valid, true);
    assert.equal(parsed.state.neighborhood, 'Centrum');
    assert.equal(parsed.canonical, 'section=businesses&neighborhood=centrum&postcode=2511');
    assert.equal(canonicalizeDiscoveryUrl('?neighborhood=Centrum&postcode=2511&section=events'), 'neighborhood=centrum&postcode=2511');
  });

  it('uses deterministic slugs and canonical names for every Hague neighbourhood', () => {
    assert.equal(neighborhoodSlug('Laakkwartier en Spoorwijk'), 'laakkwartier-en-spoorwijk');
    assert.equal(resolveNeighborhood('laakkwartier-en-spoorwijk'), 'Laakkwartier en Spoorwijk');
    assert.equal(resolveNeighborhood('ZEEHELDENKWARTIER'), 'Zeeheldenkwartier');
    assert.equal(discoveryNeighborhoodSlugs['van-stolkpark-en-scheveningse-bosjes'], 'Van Stolkpark en Scheveningse Bosjes');
  });

  it('defaults to local English Hague events without exposing defaults in a URL', () => {
    const parsed = parseDiscoveryUrlState('');
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.state, { locale: 'en', city: 'den-haag', section: 'events', scope: 'local' });
    assert.equal(serializeDiscoveryUrlState(parsed.state), '');
  });

  it('accepts the app-owned restore flag without showing it as an invalid criterion', () => {
    const parsed = parseDiscoveryUrlState('?restore=1');
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.canonical, '');
  });

  it('rejects unknown and sensitive parameters while retaining safe criteria', () => {
    const parsed = parseDiscoveryUrlState(
      '?locale=nl&section=events&user_id=abc&lat=52.07&return_path=%2Fprivate&sort=name&postcode=2511',
    );
    assert.equal(parsed.valid, false);
    assert.equal(parsed.state.locale, 'nl');
    assert.equal(parsed.state.postcode, '2511');
    assert.deepEqual(
      parsed.errors.map(({ code, parameter }) => `${code}:${parameter}`),
      ['sensitive-parameter:user_id', 'sensitive-parameter:lat', 'sensitive-parameter:return_path', 'unknown-parameter:sort'],
    );
    assert.equal(parsed.canonical, 'locale=nl&postcode=2511');
  });

  it('rejects invalid values, duplicates, non-Hague postcodes, and unknown neighbourhoods', () => {
    const parsed = parseDiscoveryUrlState(
      '?locale=fr&city=amsterdam&section=unknown&scope=nearby&postcode=1011&neighborhood=centrum&neighborhood=other',
    );
    assert.equal(parsed.valid, false);
    assert.equal(parsed.state.neighborhood, undefined);
    assert.deepEqual(
      parsed.errors.map(({ code, parameter }) => `${code}:${parameter}`),
      [
        'duplicate-parameter:neighborhood',
        'invalid-locale:locale',
        'invalid-city:city',
        'invalid-section:section',
        'invalid-postcode:postcode',
        'invalid-scope:scope',
      ],
    );
  });

  it('never serializes private URL state, even if a caller provides extra object fields', () => {
    const state = {
      locale: 'en' as const,
      city: 'den-haag' as const,
      section: 'events' as const,
      scope: 'local' as const,
      neighborhood: 'Centrum',
      token: 'secret',
      userId: 'private',
    };
    assert.equal(serializeDiscoveryUrlState(state), 'neighborhood=centrum');
    assert.equal(canonicalizeDiscoveryUrl('?token=secret&coordinates=52,4&neighborhood=centrum'), 'neighborhood=centrum');
  });
});
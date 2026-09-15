import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_RETURN_PATH, carryReturnPath, resolveReturnPath, sanitizeReturnPath, withReturnPath } from './returnPath';

describe('sanitizeReturnPath', () => {
  it('accepts allowlisted local paths and keeps their query and hash', () => {
    assert.equal(sanitizeReturnPath('/'), '/');
    assert.equal(sanitizeReturnPath('/deals'), '/deals');
    assert.equal(sanitizeReturnPath('/activiteiten/den-haag?buurt=zeeheldenkwartier#kaart'), '/activiteiten/den-haag?buurt=zeeheldenkwartier#kaart');
    assert.equal(sanitizeReturnPath('/activiteiten/den-haag/evt-123'), '/activiteiten/den-haag/evt-123');
    assert.equal(sanitizeReturnPath('/bedrijf/koffie-huis'), '/bedrijf/koffie-huis');
    assert.equal(sanitizeReturnPath('/account/'), '/account');
  });

  it('rejects external, protocol-relative, and unknown destinations', () => {
    assert.equal(sanitizeReturnPath('https://evil.example/'), null);
    assert.equal(sanitizeReturnPath('//evil.example/account'), null);
    assert.equal(sanitizeReturnPath('/\\evil.example'), null);
    assert.equal(sanitizeReturnPath('javascript:alert(1)'), null);
    assert.equal(sanitizeReturnPath('/admin'), null);
    assert.equal(sanitizeReturnPath('/bedrijf/'), null);
    assert.equal(sanitizeReturnPath('/bedrijf/a/b'), null);
    assert.equal(sanitizeReturnPath('/deals\n'), null);
    assert.equal(sanitizeReturnPath(''), null);
    assert.equal(sanitizeReturnPath(undefined), null);
    assert.equal(sanitizeReturnPath(['/deals']), null);
  });

  it('strips a configured artifact base path before checking the allowlist', () => {
    assert.equal(sanitizeReturnPath('/buurtgids/deals', '/buurtgids'), '/deals');
    assert.equal(sanitizeReturnPath('/buurtgids', '/buurtgids/'), '/');
    assert.equal(sanitizeReturnPath('/deals', '/buurtgids'), null);
    assert.equal(sanitizeReturnPath('/buurtgids-evil/deals', '/buurtgids'), null);
  });
});

describe('resolveReturnPath', () => {
  it('reads the terug parameter and falls back to the account page', () => {
    assert.equal(resolveReturnPath('?terug=%2Fdeals'), '/deals');
    assert.equal(resolveReturnPath('terug=%2Fdeals'), '/deals');
    assert.equal(resolveReturnPath('?terug=https%3A%2F%2Fevil.example'), DEFAULT_RETURN_PATH);
    assert.equal(resolveReturnPath(''), DEFAULT_RETURN_PATH);
  });
});

describe('withReturnPath', () => {
  it('only appends safe destinations that differ from the default', () => {
    assert.equal(withReturnPath('/sign-in', '/deals'), '/sign-in?terug=%2Fdeals');
    assert.equal(withReturnPath('/sign-in?x=1', '/deals'), '/sign-in?x=1&terug=%2Fdeals');
    assert.equal(withReturnPath('/sign-in', '/account'), '/sign-in');
    assert.equal(withReturnPath('/sign-in', 'https://evil.example'), '/sign-in');
    assert.equal(withReturnPath('/sign-in', null), '/sign-in');
  });
});

describe('carryReturnPath', () => {
  it('re-attaches terug to Clerk step navigations inside sign-in and sign-up', () => {
    assert.equal(
      carryReturnPath('/sign-up/verify-email-address', '?terug=%2Factiviteiten%2Fden-haag%3Fq%3D1'),
      '/sign-up/verify-email-address?terug=%2Factiviteiten%2Fden-haag%3Fq%3D1',
    );
    assert.equal(carryReturnPath('/sign-in/factor-one', 'terug=%2Fdeals'), '/sign-in/factor-one?terug=%2Fdeals');
    assert.equal(carryReturnPath('/sign-in?x=1#/foo', '?terug=%2Fdeals'), '/sign-in?x=1&terug=%2Fdeals#/foo');
  });

  it('leaves other navigations, existing parameters, unsafe and default destinations alone', () => {
    assert.equal(carryReturnPath('/account/voorkeuren', '?terug=%2Fdeals'), '/account/voorkeuren');
    assert.equal(carryReturnPath('/sign-up-other', '?terug=%2Fdeals'), '/sign-up-other');
    assert.equal(carryReturnPath('/sign-up?terug=%2Fnieuws', '?terug=%2Fdeals'), '/sign-up?terug=%2Fnieuws');
    assert.equal(carryReturnPath('/sign-up/verify-email-address', '?terug=https%3A%2F%2Fevil.example'), '/sign-up/verify-email-address');
    assert.equal(carryReturnPath('/sign-up/verify-email-address', '?terug=%2Faccount'), '/sign-up/verify-email-address');
    assert.equal(carryReturnPath('/sign-up/verify-email-address', ''), '/sign-up/verify-email-address');
  });
});

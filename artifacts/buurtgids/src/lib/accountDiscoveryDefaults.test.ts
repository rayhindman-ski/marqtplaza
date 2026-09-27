import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountDiscoveryDefaults, slugifyOptionId } from './accountDiscoveryDefaults';

test('option id slug matches the server convention', () => {
  assert.equal(slugifyOptionId('Food & Drink'), 'food-and-drink');
  assert.equal(slugifyOptionId('Bohemen en Meer en Bos'), 'bohemen-en-meer-en-bos');
});

test('resolves saved neighborhoods and interests to discovery filters', () => {
  const defaults = accountDiscoveryDefaults({
    neighborhoodIds: ['dhg:zeeheldenkwartier', 'dhg:unknown-place', 'other:centrum'],
    interestIds: ['category:food-and-drink', 'category:retail-and-shopping', 'category:nope'],
  });
  assert.deepEqual(defaults?.neighborhoods, ['Zeeheldenkwartier']);
  assert.deepEqual(defaults?.sections, ['businesses', 'food-drink']);
  assert.ok(defaults?.subcategories.includes('Retail & Shopping'));
  assert.ok(defaults?.subcategories.includes('cafe'));
  assert.ok(!defaults?.subcategories.includes('Food & Drink'));
});

test('nothing usable means no defaults', () => {
  assert.equal(accountDiscoveryDefaults(null), null);
  assert.equal(accountDiscoveryDefaults({ neighborhoodIds: ['dhg:nowhere'], interestIds: [] }), null);
});

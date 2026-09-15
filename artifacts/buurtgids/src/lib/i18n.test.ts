import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  accountTranslations,
  businessIntakeTranslations,
  businessPublicationTranslations,
  businessReviewTranslations,
  newsTranslations,
  translations,
} from './i18n';

type Tree = Record<string, unknown>;

function collectKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  if (Array.isArray(value)) return [`${prefix}[]`];
  return Object.entries(value as Tree).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function collectEmptyLeaves(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [prefix] : [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Tree).flatMap(([key, child]) =>
    collectEmptyLeaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

const tables: Array<[string, { nl: unknown; en: unknown }]> = [
  ['translations', translations],
  ['newsTranslations', newsTranslations],
  ['accountTranslations', accountTranslations],
  ['businessIntakeTranslations', businessIntakeTranslations],
  ['businessPublicationTranslations', businessPublicationTranslations],
  ['businessReviewTranslations', businessReviewTranslations],
];

describe('Dutch and English copy parity', () => {
  for (const [name, table] of tables) {
    it(`${name} exposes the same key tree in nl and en`, () => {
      const nl = collectKeys(table.nl).sort();
      const en = collectKeys(table.en).sort();
      const missingInEn = nl.filter((key) => !en.includes(key));
      const missingInNl = en.filter((key) => !nl.includes(key));
      assert.deepEqual({ missingInEn, missingInNl }, { missingInEn: [], missingInNl: [] });
    });

    it(`${name} has no empty strings in either language`, () => {
      assert.deepEqual(collectEmptyLeaves(table.nl), []);
      assert.deepEqual(collectEmptyLeaves(table.en), []);
    });
  }
});

/** 1.10.0: "Recently used" and the list's totals. Using an entry is not an edit. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { getEntry, listRecent, markUsed, resetMetaConnection, saveEntry, vaultTotals } from '../src/db/database';
import { createVault } from '../src/security/keyHierarchy';

const mock = OpSqlite as unknown as { __reset: () => void };

beforeEach(() => {
  mock.__reset();
  resetMetaConnection();
});

const add = (db: Parameters<typeof saveEntry>[0], title: string, extra: Partial<Parameters<typeof saveEntry>[1]> = {}) =>
  saveEntry(db, { folder_id: null, title, username: 'me', password: 'S3cret!pass', url: '', notes: '', favorite: false, ...extra });

test('recently used: newest first, only entries that were used, and the edit time stays', async () => {
  const { db } = await createVault('purple mango river forty');
  const a = add(db, 'HDFC');
  const b = add(db, 'Gmail');
  add(db, 'Never opened');
  expect(listRecent(db)).toEqual([]);

  const editedAt = getEntry(db, a)!.updated_at;
  markUsed(db, a, 1000);
  markUsed(db, b, 2000);
  expect(listRecent(db).map(e => e.title)).toEqual(['Gmail', 'HDFC']);
  expect(getEntry(db, a)!.updated_at).toBe(editedAt); // the backup reminder goes by edits only

  markUsed(db, a, 3000);
  expect(listRecent(db, 1).map(e => e.title)).toEqual(['HDFC']);
});

test('totals for the list header', async () => {
  const { db } = await createVault('purple mango river forty');
  expect(vaultTotals(db)).toEqual({ entries: 0, pins: 0, cards: 0 });
  add(db, 'Phone', { password: '', pins: [{ label: 'Phone lock', value: '482913' }] });
  add(db, 'SBI', {
    type: 'banking',
    cards: [{ kind: 'debit', number: '4111111111111111', expiry: '01/28', name: '', pin: '', bank: 'SBI' }],
  });
  expect(vaultTotals(db)).toEqual({ entries: 2, pins: 1, cards: 1 });
});

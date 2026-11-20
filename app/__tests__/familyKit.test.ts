/** Family Kit (1.11.0): the checklist, nominees, where originals are kept, and backups of them. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { deleteEntry, getEntry, listEntries, listNominees, nomineesProblem, resetMetaConnection, saveEntry } from '../src/db/database';
import { getTypeFields } from '../src/customFields';
import { KIT_ITEMS, kitProgress, kitRows, notNeeded, setNotNeeded } from '../src/familyKit';
import { createBackup, openBackup, parseBackup, restoreInto } from '../src/security/backup';
import { createVault } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void };

beforeEach(() => {
  mock.__reset();
  resetMetaConnection();
});

type In = Parameters<typeof saveEntry>[1];
const base: In = { folder_id: null, title: 'x', username: '', password: '', url: '', notes: '', favorite: false };

test('a Family Kit record needs no password: details are enough', async () => {
  const { db } = await createVault(PW);
  expect(() => saveEntry(db, { ...base, type: 'will', title: 'Will (2025)' })).toThrow('Add a password, a PIN, a card or some details.');
  const id = saveEntry(db, { ...base, type: 'will', title: 'Will (2025)', kept_at: ' Blue file, bedroom cupboard ' });
  expect(getEntry(db, id)!.kept_at).toBe('Blue file, bedroom cupboard');
  expect(saveEntry(db, { ...base, type: 'property', title: 'Flat', fields: [{ name: 'Address', value: 'Whitefield', kind: 'text' }] })).toBeGreaterThan(0);
  expect(saveEntry(db, { ...base, type: 'wishes', title: 'My wishes', notes: 'Donate my eyes.' })).toBeGreaterThan(0);
});

test('the new types start with their own fields', async () => {
  const { db } = await createVault(PW);
  expect(getTypeFields(db, 'insurance').map(f => f.name)).toEqual([
    'Insurer',
    'Policy number',
    'Policy type',
    'Sum assured',
    'Agent',
    'Agent phone',
    'Group policy via employer',
  ]);
  expect(getTypeFields(db, 'retirement').map(f => f.name)).toContain('UAN');
  expect(getTypeFields(db, 'identity').find(f => f.name === 'Aadhaar')?.kind).toBe('hidden');
});

test('nominees: saved in order, checked, replaced, and deleted with the entry', async () => {
  const { db } = await createVault(PW);
  const id = saveEntry(db, {
    ...base,
    type: 'insurance',
    title: 'LIC term plan',
    nominees: [
      { name: ' Asha ', relation: 'Wife', share: '60%' },
      { name: '', relation: '', share: '' }, // an empty row is dropped
      { name: 'Ravi', relation: 'Son', share: '40' },
    ],
  });
  expect(listNominees(db, id)).toEqual([
    { name: 'Asha', relation: 'Wife', share: '60' },
    { name: 'Ravi', relation: 'Son', share: '40' },
  ]);

  expect(nomineesProblem([{ name: 'A', relation: '', share: '60' }, { name: 'B', relation: '', share: '30' }])).toBe(
    'The shares add up to 90%. Make them add up to 100%.',
  );
  expect(nomineesProblem([{ name: '', relation: 'Wife', share: '' }])).toBe('Give each nominee a name.');
  expect(nomineesProblem([{ name: 'A', relation: '', share: 'half' }])).toBe('Write each share as a percentage, like 50.');
  expect(nomineesProblem([{ name: 'A', relation: '', share: '' }, { name: 'B', relation: '', share: '50' }])).toBeNull(); // not all set
  expect(() => saveEntry(db, { ...base, title: 'Bad', type: 'banking', nominees: [{ name: 'A', relation: '', share: '150' }] })).toThrow(
    'A share can be at most 100%.',
  );

  saveEntry(db, { ...base, type: 'insurance', title: 'LIC term plan', nominees: [{ name: 'Asha', relation: 'Wife', share: '' }] }, id);
  expect(listNominees(db, id)).toHaveLength(1);
  deleteEntry(db, id);
  expect(listNominees(db, id)).toEqual([]);
});

test('backups carry nominees and where originals are kept', async () => {
  const { db, dek } = await createVault(PW);
  saveEntry(db, {
    ...base,
    type: 'property',
    title: 'Flat',
    kept_at: 'Bank locker 214',
    nominees: [{ name: 'Asha', relation: 'Wife', share: '100' }],
  });
  const opened = (await openBackup(parseBackup(createBackup(db, dek).text), PW))!;
  saveEntry(db, { ...base, type: 'wishes', title: 'Gone after restore', notes: 'x' });
  restoreInto(db, opened.data);
  const [flat] = listEntries(db, '', null);
  expect(listEntries(db, '', null)).toHaveLength(1);
  expect(getEntry(db, flat.id)!.kept_at).toBe('Bank locker 214');
  expect(listNominees(db, flat.id)).toEqual([{ name: 'Asha', relation: 'Wife', share: '100' }]);
});

test('the checklist: done from entries, not needed by choice, progress leaves those out', async () => {
  const { db } = await createVault(PW);
  let rows = kitRows(db);
  expect(rows.map(r => r.key)).toEqual(KIT_ITEMS.map(i => i.key));
  expect(rows.every(r => r.status === 'todo')).toBe(true);
  expect(kitProgress(rows)).toEqual({ done: 0, total: 13 });

  saveEntry(db, { ...base, type: 'insurance', title: 'LIC', fields: [{ name: 'Policy number', value: '123', kind: 'text' }] });
  saveEntry(db, {
    ...base,
    type: 'banking',
    title: 'HDFC',
    cards: [{ kind: 'debit', number: '4111111111111111', expiry: '01/28', name: '', pin: '', bank: 'HDFC Bank' }],
  });
  saveEntry(db, { ...base, type: 'other', title: 'My phone', pins: [{ label: 'Phone lock', value: '482913' }] });
  setNotNeeded(db, 'vehicles', true);

  rows = kitRows(db);
  const st = Object.fromEntries(rows.map(r => [r.key, r.status]));
  expect(st).toMatchObject({ insurance: 'done', banks: 'done', cards: 'done', digital: 'done', vehicles: 'na', will: 'todo' });
  expect(rows.find(r => r.key === 'cards')!.entries.map(e => e.title)).toEqual(['HDFC']);
  expect(kitProgress(rows)).toEqual({ done: 4, total: 12 });

  setNotNeeded(db, 'vehicles', false);
  expect(notNeeded(db).size).toBe(0);
  // Something saved for an item marked Not needed counts as Done.
  setNotNeeded(db, 'wishes', true);
  saveEntry(db, { ...base, type: 'wishes', title: 'Wishes', notes: 'Simple funeral.' });
  expect(kitRows(db).find(r => r.key === 'wishes')!.status).toBe('done');
});

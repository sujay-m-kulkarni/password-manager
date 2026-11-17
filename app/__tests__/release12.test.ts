/**
 * Release 1.2: folder management, unlock tuning, and changing an entry between Login and PIN.
 * Runs against real SQLite files (node:sqlite stand-in).
 */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { resetMetaConnection } from '../src/db/database';
import {
  FOLDER_NAME_MAX,
  addFolder,
  deleteFolder,
  deleteEntry,
  getEntry,
  getQuickSecret,
  listEntries,
  listFolders,
  listFoldersWithCounts,
  listPins,
  saveEntry,
  updateFolder,
} from '../src/db/database';
import { KDF_MAX_PASSES, KDF_MIN_PASSES, passesFor } from '../src/security/crypto';
import { changePassword, createVault, readHeader, unlockCost, unlockWithPassword } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void };
type DB = Parameters<typeof saveEntry>[0];

beforeEach(() => (mock.__reset(), resetMetaConnection()));

const add = (db: DB, title: string, folder_id: number | null) =>
  saveEntry(db, { folder_id, title, username: '', password: 'S3cret!pass', url: '', notes: '', favorite: false });

describe('folders', () => {
  it('adds, renames and recolours folders, sorted by name', async () => {
    const { db } = await createVault(PW);
    const before = listFolders(db).length;
    const id = addFolder(db, '  Travel ', 'sky');
    expect(listFolders(db)).toHaveLength(before + 1);
    expect(listFolders(db).find(f => f.id === id)).toMatchObject({ name: 'Travel', color: 'sky' });

    updateFolder(db, id, 'Holidays', 'orange');
    expect(listFolders(db).find(f => f.id === id)).toMatchObject({ name: 'Holidays', color: 'orange' });
    const names = listFolders(db).map(f => f.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it('rejects empty, too long and duplicate names (ignoring case)', async () => {
    const { db } = await createVault(PW);
    const id = addFolder(db, 'Travel', 'sky');
    expect(() => addFolder(db, '   ', 'sky')).toThrow(/name/i);
    expect(() => addFolder(db, 'x'.repeat(FOLDER_NAME_MAX + 1), 'sky')).toThrow(/characters/i);
    expect(() => addFolder(db, 'TRAVEL', 'sky')).toThrow(/already/i);
    // renaming a folder to its own name (or a case change of it) is fine
    expect(() => updateFolder(db, id, 'travel', 'sky')).not.toThrow();
  });

  it('counts entries, and deleting a folder keeps its entries', async () => {
    const { db } = await createVault(PW);
    const id = addFolder(db, 'Travel', 'sky');
    const e1 = add(db, 'Airline', id);
    add(db, 'Hotel', id);
    add(db, 'Bank', null);
    expect(listFoldersWithCounts(db).find(f => f.id === id)?.entries).toBe(2);

    deleteFolder(db, id);
    expect(listFolders(db).some(f => f.id === id)).toBe(false);
    expect(listEntries(db, '', null).map(e => e.title).sort()).toEqual(['Airline', 'Bank', 'Hotel']);
    expect(getEntry(db, e1)?.folder_id).toBeNull();
  });
});

describe('PINs inside an entry', () => {
  it('a login can also hold named PINs; they can be replaced and removed', async () => {
    const { db } = await createVault(PW);
    const id = add(db, 'HDFC', null);
    const base = { folder_id: null, title: 'HDFC', username: 'me', password: 'S3cret!pass', url: '', notes: '', favorite: false };
    saveEntry(db, { ...base, pins: [{ label: 'UPI PIN', value: '482913' }, { label: 'MPIN', value: 'Ab12' }] }, id);
    expect(listPins(db, id).map(p => [p.label, p.value])).toEqual([
      ['UPI PIN', '482913'],
      ['MPIN', 'Ab12'],
    ]);
    expect(listEntries(db, '', null, true).map(x => x.id)).toEqual([id]);
    expect(listEntries(db, '', null)[0]).toMatchObject({ pins: 2, has_password: 1 });

    saveEntry(db, { ...base, title: 'HDFC Bank' }, id); // no `pins`: left as they are
    expect(listPins(db, id)).toHaveLength(2);
    saveEntry(db, { ...base, pins: [] }, id);
    expect(listPins(db, id)).toEqual([]);
  });

  it('the list copies the password, or the first PIN when there is no password', async () => {
    const { db } = await createVault(PW);
    const base = { folder_id: null, username: '', url: '', notes: '', favorite: false };
    const a = saveEntry(db, { ...base, title: 'Bank', password: 'S3cret!pass', pins: [{ label: 'UPI PIN', value: '482913' }] });
    const b = saveEntry(db, { ...base, title: 'Phone', password: '', pins: [{ label: 'Phone lock', value: '2468' }] });
    expect(getQuickSecret(db, a)).toEqual({ what: 'password', value: 'S3cret!pass' });
    expect(getQuickSecret(db, b)).toEqual({ what: 'PIN', value: '2468' });
  });

  it('deleting the entry deletes its PINs', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(db, { folder_id: null, title: 'SIM', username: '', password: '', url: '', notes: '', favorite: false, pins: [{ label: 'SIM PIN', value: '1234' }] });
    deleteEntry(db, id);
    expect(listPins(db, id)).toEqual([]);
  });
});

describe('unlock tuning', () => {
  it('scales passes to the phone, within limits', () => {
    expect(passesFor(700)).toBe(1); // slow phone: one 64 MiB pass already takes 0.7 s
    expect(passesFor(5000)).toBe(KDF_MIN_PASSES);
    expect(passesFor(175)).toBe(4);
    expect(passesFor(10)).toBe(KDF_MAX_PASSES); // very fast phone: capped
    expect(passesFor(0)).toBe(KDF_MAX_PASSES);
  });

  it('tunes at setup, records the unlock time, and re-tunes on password change', async () => {
    const { dek } = await createVault(PW);
    const header = readHeader()!;
    expect(header.kdf.memKiB).toBe(64 * 1024);
    expect(header.kdf.passes).toBeGreaterThanOrEqual(KDF_MIN_PASSES);
    expect(header.kdf.passes).toBeLessThanOrEqual(KDF_MAX_PASSES);

    const cost = unlockCost()!;
    expect(cost).toMatchObject({ memMiB: 64, passes: header.kdf.passes });
    expect(cost.ms === null || cost.ms >= 0).toBe(true);

    expect((await unlockWithPassword('wrong password here')).ok).toBe(false);
    expect((await unlockWithPassword(PW)).ok).toBe(true);

    await changePassword(dek, 'seven quiet blue lanterns');
    expect(readHeader()!.kdf.salt).not.toBe(header.kdf.salt);
    expect((await unlockWithPassword('seven quiet blue lanterns')).ok).toBe(true);
  });
});

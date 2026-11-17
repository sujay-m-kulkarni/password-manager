/**
 * Release 1.2: folder management, unlock tuning, and changing an entry between Login and PIN.
 * Runs against real SQLite files (node:sqlite stand-in).
 */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import {
  FOLDER_NAME_MAX,
  addFolder,
  deleteFolder,
  getEntry,
  listEntries,
  listFolders,
  listFoldersWithCounts,
  saveEntry,
  updateFolder,
} from '../src/db/database';
import { KDF_MAX_PASSES, KDF_MIN_PASSES, passesFor } from '../src/security/crypto';
import { changePassword, createVault, readHeader, unlockCost, unlockWithPassword } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void };
type DB = Parameters<typeof saveEntry>[0];

beforeEach(() => mock.__reset());

const add = (db: DB, title: string, folder_id: number | null) =>
  saveEntry(db, { kind: 'login', folder_id, title, username: '', password: 'S3cret!pass', url: '', notes: '', favorite: false });

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

describe('changing an entry between Login and PIN', () => {
  it('keeps the entry and drops login-only fields when it becomes a PIN', async () => {
    const { db } = await createVault(PW);
    const id = add(db, 'Bank app', null);
    saveEntry(
      db,
      { kind: 'pin', folder_id: null, title: 'Bank app', username: 'me', password: '482913', url: 'https://x', notes: '', favorite: false },
      id,
    );
    const e = getEntry(db, id);
    expect(e).toMatchObject({ kind: 'pin', password: '482913', username: null, url: null });
    expect(listEntries(db, '', null, 'pin').map(x => x.id)).toEqual([id]);

    saveEntry(db, { kind: 'login', folder_id: null, title: 'Bank app', username: 'me', password: 'N3w!pass', url: '', notes: '', favorite: false }, id);
    expect(getEntry(db, id)).toMatchObject({ kind: 'login', username: 'me', password: 'N3w!pass' });
  });

  it('will not save a non-numeric secret as a PIN', async () => {
    const { db } = await createVault(PW);
    const id = add(db, 'Bank app', null);
    expect(() =>
      saveEntry(db, { kind: 'pin', folder_id: null, title: 'Bank app', username: '', password: 'S3cret!pass', url: '', notes: '', favorite: false }, id),
    ).toThrow();
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

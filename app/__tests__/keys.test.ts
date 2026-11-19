/**
 * Recovery key, password change, fingerprint flags and backups, against real SQLite files.
 */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { resetMetaConnection } from '../src/db/database';
import { saveEntry } from '../src/db/database';
import { Buffer } from '../src/security/crypto';
import { backupDue, createBackup, noteBackup, openBackup, parseBackup, restoreInto } from '../src/security/backup';
import * as Biometric from '../src/security/biometric';
import {
  changePassword,
  createRecoveryKey,
  createVault,
  createVaultFromBackup,
  hasRecoveryKey,
  newRecoveryCode,
  normalizeRecoveryCode,
  notePasswordUnlock,
  unlockWithDek,
  unlockWithPassword,
  unlockWithRecoveryKey,
  verifyPassword,
} from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const PW2 = 'seven quiet blue lanterns';
const mock = OpSqlite as unknown as { __reset: () => void };

const add = (db: Parameters<typeof saveEntry>[0], title: string, password = 'S3cret!pass') =>
  saveEntry(db, { folder_id: null, title, username: 'me', password, url: '', notes: '', favorite: false });

const titles = (db: Parameters<typeof saveEntry>[0]) =>
  (db.executeSync('SELECT title FROM entries ORDER BY title').rows as { title: string }[]).map(r => r.title);

beforeEach(() => (mock.__reset(), resetMetaConnection()));

describe('recovery key format', () => {
  it('is 24 characters in six groups, from an unambiguous alphabet', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(newRecoveryCode()).not.toBe(code);
  });

  it('accepts the code typed loosely', () => {
    const code = 'K7QM-2XRP-0011-ABCD-EFGH-JKMN';
    expect(normalizeRecoveryCode('k7qm 2xrp oo11 abcd efgh jkmn')).toBe(code);
    expect(normalizeRecoveryCode('K7QM2XRPOIL1ABCDEFGHJKMN')).toBe('K7QM-2XRP-0111-ABCD-EFGH-JKMN');
    expect(normalizeRecoveryCode('K7QM-2XRP')).toBeNull();
    expect(normalizeRecoveryCode('K7QM-2XRP-0011-ABCD-EFGH-JKMU')).toBeNull(); // U is not in the alphabet
  });
});

describe('recovery key and password change', () => {
  it('unlocks with the recovery key, and keeps working after a password change', async () => {
    const { db, dek } = await createVault(PW);
    add(db, 'Gmail');
    expect(hasRecoveryKey()).toBe(false);
    const code = await createRecoveryKey(dek);
    expect(hasRecoveryKey()).toBe(true);
    db.close();

    expect((await unlockWithRecoveryKey('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).ok).toBe(false);
    const viaCode = await unlockWithRecoveryKey(code.toLowerCase().replace(/-/g, ' '));
    expect(viaCode.ok).toBe(true);
    if (!viaCode.ok) return;
    expect(titles(viaCode.db)).toEqual(['Gmail']);

    await changePassword(viaCode.dek, PW2);
    viaCode.db.close();
    expect((await unlockWithPassword(PW)).ok).toBe(false);
    expect(await verifyPassword(PW2)).toBe(true);
    const viaNew = await unlockWithPassword(PW2);
    expect(viaNew.ok).toBe(true);
    if (viaNew.ok) {
      expect(titles(viaNew.db)).toEqual(['Gmail']); // no re-encryption needed
      viaNew.db.close();
    }
    expect((await unlockWithRecoveryKey(code)).ok).toBe(true);
  });

  it('a new recovery key replaces the old one', async () => {
    const { dek } = await createVault(PW);
    const first = await createRecoveryKey(dek);
    const second = await createRecoveryKey(dek);
    expect((await unlockWithRecoveryKey(first)).ok).toBe(false);
    expect((await unlockWithRecoveryKey(second)).ok).toBe(true);
  });

  it('opens the vault with the data key from the fingerprint copy', async () => {
    const { db, dek } = await createVault(PW);
    add(db, 'Bank');
    db.close();
    const again = unlockWithDek(dek);
    expect(titles(again)).toEqual(['Bank']);
  });
});

describe('fingerprint', () => {
  it('stores the data key and gives it back; asks for the password weekly', async () => {
    const { dek } = await createVault(PW);
    await Biometric.enable(dek, false);
    expect(Biometric.isEnabled()).toBe(true);
    const r = await Biometric.getDek();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.dek.equals(dek)).toBe(true);

    const now = Date.now();
    notePasswordUnlock(now);
    expect(Biometric.passwordDue(now + 6 * 86_400_000)).toBe(false);
    expect(Biometric.passwordDue(now + 8 * 86_400_000)).toBe(true);

    await Biometric.disable();
    expect(Biometric.isEnabled()).toBe(false);
  });
});

describe('backup', () => {
  it('round-trips with the master password, and with the recovery key after a password change', async () => {
    const { db, dek } = await createVault(PW);
    add(db, 'Gmail', 'pw-one-111');
    add(db, 'HDFC', 'pw-two-222');
    const code = await createRecoveryKey(dek);
    const { text, entries } = createBackup(db, dek);
    expect(entries).toBe(2);
    expect(text).not.toContain('pw-one-111');
    expect(text).not.toContain('Gmail');

    await changePassword(dek, PW2);
    const file = parseBackup(text);
    expect(await openBackup(file, 'wrong password here')).toBeNull();

    const byOldPw = await openBackup(file, PW); // the backup keeps the password it was made with
    expect(byOldPw?.via).toBe('password');
    expect(byOldPw?.data.entries.map(e => e.password).sort()).toEqual(['pw-one-111', 'pw-two-222']);

    const byCode = await openBackup(file, code);
    expect(byCode?.via).toBe('recovery');
    expect(byCode?.data.entries).toHaveLength(2);
  });

  it('rejects files that are not backups, or are damaged', async () => {
    expect(() => parseBackup('hello')).toThrow('not an Anchor (or Vault) backup');
    expect(() => parseBackup('{"format":"other"}')).toThrow('not an Anchor (or Vault) backup');
    const { db, dek } = await createVault(PW);
    add(db, 'Gmail');
    const file = parseBackup(createBackup(db, dek).text);
    const ct = Buffer.from(file.data.ct, 'base64');
    ct[0] ^= 1;
    await expect(openBackup({ ...file, data: { ...file.data, ct: ct.toString('base64') } }, PW)).rejects.toThrow('damaged');
  });

  it('restores into the current vault, replacing its entries', async () => {
    const { db, dek } = await createVault(PW);
    add(db, 'Old one');
    add(db, 'Old two');
    const text = createBackup(db, dek).text;
    db.executeSync('DELETE FROM entries');
    add(db, 'Added later');

    const opened = await openBackup(parseBackup(text), PW);
    restoreInto(db, opened!.data);
    expect(titles(db)).toEqual(['Old one', 'Old two']);
  });

  it('sets up a new phone from a backup', async () => {
    const { db, dek } = await createVault(PW);
    add(db, 'Gmail');
    const code = await createRecoveryKey(dek);
    const text = createBackup(db, dek).text;
    db.close();

    (mock.__reset(), resetMetaConnection()); // a different phone: no vault
    const opened = await openBackup(parseBackup(text), code);
    const newDb = createVaultFromBackup(opened!.header, opened!.dek);
    restoreInto(newDb, opened!.data);
    expect(titles(newDb)).toEqual(['Gmail']);
    newDb.close();
    expect((await unlockWithPassword(PW)).ok).toBe(true); // same password and recovery key as before
    expect((await unlockWithRecoveryKey(code)).ok).toBe(true);
  });

  it('reminds when there is no backup, or changes since an old one', async () => {
    const { db } = await createVault(PW);
    expect(backupDue(db)).toBe(false); // empty vault
    add(db, 'Gmail');
    expect(backupDue(db)).toBe(true); // never backed up
    const t0 = Date.now();
    noteBackup(db, t0);
    expect(backupDue(db, t0 + 40 * 86_400_000)).toBe(false); // no changes since
    db.executeSync('UPDATE entries SET updated_at = ?', [t0 + 1000]);
    expect(backupDue(db, t0 + 10 * 86_400_000)).toBe(false); // changed, but backup is recent
    expect(backupDue(db, t0 + 40 * 86_400_000)).toBe(true);
  });
});

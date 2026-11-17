/** Automatic backup to a chosen folder (1.4.0). The folder itself is a fake in memory. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { NativeModules } from 'react-native';
import { resetMetaConnection, saveEntry } from '../src/db/database';
import {
  AUTO_PREFIX,
  KEEP,
  autoBackupState,
  autoFileName,
  changedSinceAutoBackup,
  chooseAutoBackupFolder,
  runAutoBackup,
  turnOffAutoBackup,
} from '../src/security/autoBackup';
import { lastBackupAt, openBackup, parseBackup } from '../src/security/backup';
import { createVault } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void };

let files: Map<string, string>;
let failWith: Error | null;
const folder = {
  pickFolder: jest.fn(async () => ({ uri: 'content://tree/Backups', name: 'Backups' })),
  canWriteFolder: jest.fn(async () => true),
  releaseFolder: jest.fn(async () => null),
  writeToFolder: jest.fn(async (_uri: string, name: string, text: string, prefix: string, keep: number) => {
    if (failWith) {
      throw failWith;
    }
    files.set(name, text);
    const ours = [...files.keys()].filter(n => n.startsWith(prefix)).sort().reverse();
    ours.slice(keep).forEach(n => files.delete(n));
    return { name };
  }),
};

beforeEach(() => {
  mock.__reset();
  resetMetaConnection();
  files = new Map();
  failWith = null;
  jest.clearAllMocks();
  NativeModules.VaultFiles = folder;
});

const add = (db: Parameters<typeof saveEntry>[0], title: string) =>
  saveEntry(db, { kind: 'login', folder_id: null, title, username: 'me', password: 'S3cret!pass', url: '', notes: '', favorite: false });

test('off until a folder is chosen', async () => {
  const { db, dek } = await createVault(PW);
  expect(autoBackupState(db)).toBeNull();
  expect(await runAutoBackup(db, dek)).toBe(false);
  expect(folder.writeToFolder).not.toHaveBeenCalled();
});

test('choosing a folder saves it and writes a backup that opens with the master password', async () => {
  const { db, dek } = await createVault(PW);
  add(db, 'Bank');
  expect(await chooseAutoBackupFolder(db, dek)).toBe(true);

  const state = autoBackupState(db)!;
  expect(state).toMatchObject({ folder: 'Backups', uri: 'content://tree/Backups', error: null });
  expect(state.lastAt).not.toBeNull();
  expect(lastBackupAt(db)).toBe(state.lastAt); // also satisfies the backup reminder

  const [[name, text]] = [...files.entries()];
  expect(name).toMatch(/^vault-auto-\d{4}-\d{2}-\d{2}-\d{6}\.vaultbackup$/);
  const opened = await openBackup(parseBackup(text), PW);
  expect(opened?.data.entries.map(e => e.title)).toEqual(['Bank']);
});

test('keeps only the newest copies', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  for (let i = 1; i <= 8; i++) {
    await runAutoBackup(db, dek, new Date(2099, 10, 17, 10, i, 0));
  }
  const names = [...files.keys()].sort();
  expect(names).toHaveLength(KEEP);
  expect(names[names.length - 1]).toBe(`${AUTO_PREFIX}2099-11-17-100800.vaultbackup`);
});

test('a lost folder permission is shown, and cleared by the next good backup', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  failWith = new Error('Vault can no longer write to the backup folder. Choose it again in Settings.');
  expect(await runAutoBackup(db, dek)).toBe(false);
  expect(autoBackupState(db)?.error).toMatch(/no longer write/);
  failWith = null;
  expect(await runAutoBackup(db, dek)).toBe(true);
  expect(autoBackupState(db)?.error).toBeNull();
});

test('knows when entries changed after the last automatic backup', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  expect(changedSinceAutoBackup(db)).toBe(false);
  await new Promise<void>(r => setTimeout(() => r(), 5));
  add(db, 'Email');
  expect(changedSinceAutoBackup(db)).toBe(true);
});

test('turning off releases the folder and leaves the files', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  await turnOffAutoBackup(db);
  expect(folder.releaseFolder).toHaveBeenCalledWith('content://tree/Backups');
  expect(autoBackupState(db)).toBeNull();
  expect(files.size).toBe(1);
});

test('choosing another folder releases the old one', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  folder.pickFolder.mockResolvedValueOnce({ uri: 'content://tree/SD', name: 'SD card' });
  await chooseAutoBackupFolder(db, dek);
  expect(folder.releaseFolder).toHaveBeenCalledWith('content://tree/Backups');
  expect(autoBackupState(db)?.folder).toBe('SD card');
});

test('file names sort by time', () => {
  const a = autoFileName(new Date(2026, 0, 2, 3, 4, 5));
  const b = autoFileName(new Date(2026, 0, 2, 3, 4, 6));
  expect(a).toBe('vault-auto-2026-01-02-030405.vaultbackup');
  expect([b, a].sort()).toEqual([a, b]);
});

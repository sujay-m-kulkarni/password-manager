/** Required daily backup (1.9.0): setup rules, the off-phone copy, and the gate after unlocking. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import { NativeModules } from 'react-native';
import { resetMetaConnection, saveEntry } from '../src/db/database';
import { chooseAutoBackupFolder } from '../src/security/autoBackup';
import { lastBackupAt, openBackup, parseBackup } from '../src/security/backup';
import {
  BLOCK_DAYS,
  DEFAULT_TIME,
  REMIND_DAYS,
  backUpNow,
  canBackUpDaily,
  configureDaily,
  currentGate,
  dailyTime,
  gateFor,
  isOnPhone,
  offPhoneState,
  placeName,
  prepareSnapshot,
  saveOffPhoneCopy,
  setDailyTime,
  setupState,
} from '../src/security/dailyBackup';
import { createVault } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const DAY = 86_400_000;
const DRIVE = 'com.google.android.apps.docs.storage';
const PHONE = 'com.android.externalstorage.documents';
const mock = OpSqlite as unknown as { __reset: () => void };

let saveTo: { authority: string; persisted: boolean } | null;
const status = { lastRunAt: 0, folderOkAt: 0, driveOkAt: 0, snapshotAt: 0, nextAt: 0, error: null as string | null };
const native = {
  pickFolder: jest.fn(async () => ({ uri: 'content://tree/Backups', name: 'Backups' })),
  canWriteFolder: jest.fn(async () => true),
  releaseFolder: jest.fn(async () => null),
  writeToFolder: jest.fn(async (_u: string, name: string) => ({ name })),
  saveOffPhone: jest.fn(async (fileName: string, _text: string) =>
    saveTo ? { uri: `content://${saveTo.authority}/${fileName}`, name: fileName, ...saveTo } : null,
  ),
  releaseFile: jest.fn(async () => null),
  saveSnapshot: jest.fn(async (_text: string) => null),
  configureDaily: jest.fn(async (_f: string, _d: string, _h: number, _m: number) => status),
  dailyStatus: jest.fn(async () => status),
  runDailyNow: jest.fn(async () => ({ ...status, lastRunAt: 1 })),
};

beforeEach(() => {
  mock.__reset();
  resetMetaConnection();
  jest.clearAllMocks();
  saveTo = { authority: DRIVE, persisted: true };
  Object.assign(status, { lastRunAt: 0, folderOkAt: 0, driveOkAt: 0, snapshotAt: 0, nextAt: 0, error: null });
  NativeModules.VaultFiles = native;
});

afterAll(() => {
  delete NativeModules.VaultFiles;
});

const add = (db: Parameters<typeof saveEntry>[0], title: string) =>
  saveEntry(db, { folder_id: null, title, username: 'me', password: 'S3cret!pass', url: '', notes: '', favorite: false });

test('the gate: set up first; then remind after 7 days of unsaved changes and block after 30', () => {
  const now = 100 * DAY;
  expect(gateFor({ complete: false, offPhoneAt: now, changedAt: null, now })).toBe('setup');
  expect(gateFor({ complete: true, offPhoneAt: now - 60 * DAY, changedAt: null, now })).toBe('ok'); // nothing in the vault
  expect(gateFor({ complete: true, offPhoneAt: now - 60 * DAY, changedAt: now - 61 * DAY, now })).toBe('ok'); // no changes since
  expect(gateFor({ complete: true, offPhoneAt: now - 3 * DAY, changedAt: now, now })).toBe('ok');
  expect(gateFor({ complete: true, offPhoneAt: now - (REMIND_DAYS + 1) * DAY, changedAt: now, now })).toBe('remind');
  expect(gateFor({ complete: true, offPhoneAt: now - (BLOCK_DAYS + 1) * DAY, changedAt: now, now })).toBe('blocked');
});

test('where a saved file went', () => {
  expect(isOnPhone(PHONE)).toBe(true);
  expect(isOnPhone('com.android.providers.downloads.documents')).toBe(true);
  expect(isOnPhone(DRIVE)).toBe(false);
  expect(placeName(DRIVE)).toBe('Google Drive');
  expect(placeName('com.microsoft.skydrive.content.StorageAccessProvider')).toBe('OneDrive');
  expect(placeName(PHONE)).toBe('this phone');
});

test('builds without the daily backup are never gated', async () => {
  delete NativeModules.VaultFiles;
  const { db } = await createVault(PW);
  expect(canBackUpDaily()).toBe(false);
  expect(await currentGate(db)).toBe('ok');
  NativeModules.VaultFiles = native;
});

test('setup needs the phone folder and a copy off the phone; then Vault opens', async () => {
  const { db, dek } = await createVault(PW);
  add(db, 'HDFC');
  expect(setupState(db)).toEqual({ folder: false, offPhone: false, complete: false });
  expect(await currentGate(db)).toBe('setup');

  await chooseAutoBackupFolder(db, dek);
  expect(setupState(db).complete).toBe(false);

  const r = await saveOffPhoneCopy(db, dek);
  expect(r).toMatchObject({ saved: true, onPhone: false, place: 'Google Drive', persisted: true });
  expect(setupState(db).complete).toBe(true);
  expect(await currentGate(db)).toBe('ok');
  expect(lastBackupAt(db)).not.toBeNull();

  // The saved file is a real backup, opened with the master password.
  const text = native.saveOffPhone.mock.calls[0][1];
  expect((await openBackup(parseBackup(text), PW))!.data.entries).toHaveLength(1);

  // The alarm gets both places and the default time (21:00).
  const [folderUri, driveUri, h, m] = native.configureDaily.mock.calls.at(-1)!;
  expect(folderUri).toBe('content://tree/Backups');
  expect(driveUri).toMatch(/^content:\/\/com\.google/);
  expect([h, m]).toEqual([21, 0]);
  expect(dailyTime(db)).toBe(DEFAULT_TIME);
});

test('a file saved on the phone itself is not accepted as the off-phone copy', async () => {
  const { db, dek } = await createVault(PW);
  saveTo = { authority: PHONE, persisted: true };
  expect(await saveOffPhoneCopy(db, dek)).toMatchObject({ saved: true, onPhone: true });
  expect(offPhoneState(db)).toBeNull();
  expect(native.releaseFile).toHaveBeenCalled();
  saveTo = null; // cancelled
  expect(await saveOffPhoneCopy(db, dek)).toEqual({ saved: false });
});

test('when Drive won’t let Vault update the file, the daily alarm skips it and the gate goes by hand-saved copies', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  saveTo = { authority: DRIVE, persisted: false };
  await saveOffPhoneCopy(db, dek, new Date(Date.now() - 40 * DAY));
  expect(native.configureDaily.mock.calls.at(-1)![1]).toBe(''); // not given to the alarm
  status.driveOkAt = Date.now(); // ignored: not a file the alarm writes
  add(db, 'New since');
  expect(await currentGate(db)).toBe('blocked');

  await saveOffPhoneCopy(db, dek);
  expect(await currentGate(db)).toBe('ok');
});

test('a daily copy written by the alarm counts as up to date', async () => {
  const { db, dek } = await createVault(PW);
  await chooseAutoBackupFolder(db, dek);
  await saveOffPhoneCopy(db, dek, new Date(Date.now() - 40 * DAY));
  add(db, 'Changed');
  expect(await currentGate(db)).toBe('blocked');
  status.driveOkAt = Date.now() + 1000;
  expect(await currentGate(db)).toBe('ok');
});

test('the snapshot, the time, and Back up now', async () => {
  const { db, dek } = await createVault(PW);
  add(db, 'SBI');
  expect(await prepareSnapshot(db, dek)).toBe(true);
  const snap = native.saveSnapshot.mock.calls[0][0];
  expect((await openBackup(parseBackup(snap), PW))!.data.entries).toHaveLength(1);

  await setDailyTime(db, '07:00');
  expect(dailyTime(db)).toBe('07:00');
  expect(native.configureDaily.mock.calls.at(-1)!.slice(2)).toEqual([7, 0]);

  expect(await backUpNow(db, dek)).toMatchObject({ lastRunAt: 1 });
  expect(native.runDailyNow).toHaveBeenCalled();
  expect(await configureDaily(db)).toBe(status);
});

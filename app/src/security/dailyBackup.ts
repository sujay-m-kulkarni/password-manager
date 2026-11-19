/**
 * Daily backup (1.9.0), required before Vault can be used.
 *
 * Two places, both encrypted copies that open only with the master password or recovery key:
 * - a folder on this phone (the automatic backup folder), for stepping back a few days;
 * - one file off the phone, normally Google Drive, for a lost, stolen or broken phone.
 * Every day at the chosen time a native alarm (android/…/backup/DailyBackup.kt) copies the latest
 * backup to both, even while Vault is locked: while unlocked, the app keeps an up-to-date encrypted
 * "snapshot" in its own storage, and the alarm copies that file. Vault still never goes online; the
 * Drive app uploads the file.
 *
 * If the off-phone place won't let Vault update its file later (`persisted` false), the person
 * saves a fresh copy by hand: a reminder after 7 days of unsaved changes, and after 30 days Vault
 * opens only on the backup screen until they do.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { NativeModules } from 'react-native';
import { getSetting, setSetting } from '../db/database';
import { useSession } from '../store/session';
import { autoBackupState } from './autoBackup';
import { backupFileName, createBackup, noteBackup } from './backup';
import type { Buffer } from './crypto';

export const REMIND_DAYS = 7;
export const BLOCK_DAYS = 30;
export const DEFAULT_TIME = '21:00';
export const TIMES = [
  { value: '07:00', label: '7 am' },
  { value: '13:00', label: '1 pm' },
  { value: '21:00', label: '9 pm' },
  { value: '23:00', label: '11 pm' },
];

const K_TIME = 'daily_backup_time';
const K_OFF_URI = 'offphone_uri';
const K_OFF_NAME = 'offphone_name';
const K_OFF_AUTH = 'offphone_authority';
const K_OFF_PERSISTED = 'offphone_persisted';
const K_OFF_AT = 'offphone_saved_at';

export type DailyStatus = {
  lastRunAt: number;
  folderOkAt: number;
  driveOkAt: number;
  snapshotAt: number;
  nextAt: number;
  error: string | null;
};

type SavedOffPhone = { uri: string; name: string | null; authority: string; persisted: boolean };

type Native = {
  saveOffPhone(fileName: string, text: string): Promise<SavedOffPhone | null>;
  releaseFile(uri: string): Promise<null>;
  saveSnapshot(text: string): Promise<null>;
  configureDaily(folderUri: string, driveUri: string, hour: number, minute: number): Promise<DailyStatus>;
  dailyStatus(): Promise<DailyStatus>;
  runDailyNow(): Promise<DailyStatus>;
};

const native = () => NativeModules.VaultFiles as Partial<Native> | undefined;

/** False on builds without the daily backup (tests, laptop builds): the requirement is skipped. */
export const canBackUpDaily = () => typeof native()?.configureDaily === 'function';

const need = (): Native => {
  if (!canBackUpDaily()) {
    throw new Error('Daily backup is not available in this build.');
  }
  return native() as Native;
};

/** Places that are on this phone itself: a copy there is lost with the phone. */
const ON_PHONE = ['com.android.externalstorage.documents', 'com.android.providers.downloads.documents', 'com.android.providers.media.documents'];

export function isOnPhone(authority: string): boolean {
  return ON_PHONE.includes(authority);
}

export function placeName(authority: string): string {
  if (/google\.android\.apps\.docs/.test(authority)) {
    return 'Google Drive';
  }
  if (/onedrive|skydrive/i.test(authority)) {
    return 'OneDrive';
  }
  if (/dropbox/i.test(authority)) {
    return 'Dropbox';
  }
  return isOnPhone(authority) ? 'this phone' : 'the place you chose';
}

export type OffPhone = { uri: string; name: string; authority: string; place: string; persisted: boolean; savedAt: number | null };

export function offPhoneState(db: DB): OffPhone | null {
  const uri = getSetting(db, K_OFF_URI);
  if (!uri) {
    return null;
  }
  const authority = getSetting(db, K_OFF_AUTH) ?? '';
  const at = getSetting(db, K_OFF_AT);
  return {
    uri,
    name: getSetting(db, K_OFF_NAME) || 'Vault backup',
    authority,
    place: placeName(authority),
    persisted: getSetting(db, K_OFF_PERSISTED) === '1',
    savedAt: at ? Number(at) : null,
  };
}

export function dailyTime(db: DB): string {
  const t = getSetting(db, K_TIME);
  return t && /^\d\d:\d\d$/.test(t) ? t : DEFAULT_TIME;
}

export function timeLabel(t: string): string {
  return TIMES.find(x => x.value === t)?.label ?? t;
}

export type SetupState = { folder: boolean; offPhone: boolean; complete: boolean };

export function setupState(db: DB): SetupState {
  const folder = autoBackupState(db) != null;
  const offPhone = offPhoneState(db) != null;
  return { folder, offPhone, complete: folder && offPhone };
}

export type Gate = 'setup' | 'blocked' | 'remind' | 'ok';

/**
 * What Vault shows after unlocking. `offPhoneAt` = when the off-phone copy was last written (by
 * hand or by the daily copy); `changedAt` = the newest change to any entry.
 */
export function gateFor(input: { complete: boolean; offPhoneAt: number | null; changedAt: number | null; now: number }): Gate {
  if (!input.complete) {
    return 'setup';
  }
  const { offPhoneAt, changedAt, now } = input;
  if (changedAt == null || (offPhoneAt != null && changedAt <= offPhoneAt)) {
    return 'ok';
  }
  const age = now - (offPhoneAt ?? 0);
  if (age > BLOCK_DAYS * 86_400_000) {
    return 'blocked';
  }
  return age > REMIND_DAYS * 86_400_000 ? 'remind' : 'ok';
}

function changedAt(db: DB): number | null {
  const r = db.executeSync('SELECT max(updated_at) AS changed FROM entries').rows[0] as { changed: number | null } | undefined;
  return r?.changed != null ? Number(r.changed) : null;
}

/** When the off-phone copy was last written: by hand here, or by the daily copy. */
export function offPhoneAt(db: DB, status: DailyStatus | null): number | null {
  const off = offPhoneState(db);
  if (!off) {
    return null;
  }
  const daily = off.persisted && status?.driveOkAt ? status.driveOkAt : 0;
  const t = Math.max(off.savedAt ?? 0, daily);
  return t > 0 ? t : null;
}

/** The gate for this vault right now. Builds without the daily backup are never gated. */
export async function currentGate(db: DB, now = Date.now()): Promise<Gate> {
  if (!canBackUpDaily()) {
    return 'ok';
  }
  const status = await dailyStatus();
  return gateFor({ complete: setupState(db).complete, offPhoneAt: offPhoneAt(db, status), changedAt: changedAt(db), now });
}

export async function dailyStatus(): Promise<DailyStatus | null> {
  if (!canBackUpDaily()) {
    return null;
  }
  try {
    return await need().dailyStatus();
  } catch {
    return null;
  }
}

/** Mirrors the settings to the native alarm (call after any change, and on every unlock). */
export async function configureDaily(db: DB): Promise<DailyStatus | null> {
  if (!canBackUpDaily()) {
    return null;
  }
  const [h, m] = dailyTime(db).split(':').map(Number);
  const off = offPhoneState(db);
  return need().configureDaily(autoBackupState(db)?.uri ?? '', off?.persisted ? off.uri : '', h, m);
}

/** Writes the up-to-date encrypted backup that the daily alarm copies. Never throws. */
export async function prepareSnapshot(db: DB, dek: Buffer, now = new Date()): Promise<boolean> {
  if (!canBackUpDaily()) {
    return false;
  }
  try {
    await need().saveSnapshot(createBackup(db, dek, now).text);
    return true;
  } catch {
    return false;
  }
}

export async function setDailyTime(db: DB, t: string) {
  setSetting(db, K_TIME, t);
  await configureDaily(db);
}

export type SaveResult = { saved: false } | { saved: true; onPhone: boolean; place: string; persisted: boolean; name: string };

/**
 * Saves a backup off the phone through Android's Save screen. A file saved on the phone itself is
 * written (it's a valid backup) but not accepted as the off-phone copy.
 */
export async function saveOffPhoneCopy(db: DB, dek: Buffer, now = new Date()): Promise<SaveResult> {
  const { text } = createBackup(db, dek, now);
  const r = await useSession.getState().withAutoLockPaused(() => need().saveOffPhone(backupFileName(now), text));
  if (!r) {
    return { saved: false };
  }
  const name = r.name ?? backupFileName(now);
  if (isOnPhone(r.authority)) {
    if (r.persisted) {
      await need().releaseFile(r.uri).catch(() => null);
    }
    return { saved: true, onPhone: true, place: placeName(r.authority), persisted: false, name };
  }
  const old = offPhoneState(db);
  if (old?.persisted && old.uri !== r.uri) {
    await need().releaseFile(old.uri).catch(() => null);
  }
  setSetting(db, K_OFF_URI, r.uri);
  setSetting(db, K_OFF_NAME, name);
  setSetting(db, K_OFF_AUTH, r.authority);
  setSetting(db, K_OFF_PERSISTED, r.persisted ? '1' : '0');
  setSetting(db, K_OFF_AT, String(now.getTime()));
  noteBackup(db, now.getTime());
  await prepareSnapshot(db, dek, now);
  await configureDaily(db);
  return { saved: true, onPhone: false, place: placeName(r.authority), persisted: r.persisted, name };
}

/** Back up now: refresh the snapshot, then make the same copies the daily alarm makes. */
export async function backUpNow(db: DB, dek: Buffer): Promise<DailyStatus | null> {
  if (!canBackUpDaily()) {
    return null;
  }
  await prepareSnapshot(db, dek);
  await configureDaily(db);
  return need().runDailyNow();
}

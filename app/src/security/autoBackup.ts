/**
 * Automatic encrypted backup to a folder the user picked once (Settings › Backup).
 * The files are the same .vaultbackup as a manual export (open with the master password or the
 * recovery key). The folder is outside Vault's own storage, so the copies survive uninstalling
 * Vault or resetting it. The newest KEEP files are kept; older automatic ones are deleted.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { NativeModules } from 'react-native';
import { getSetting, setSetting } from '../db/database';
import { createBackup, noteBackup } from './backup';
import type { Buffer } from './crypto';

export const AUTO_PREFIX = 'vault-auto-';
export const KEEP = 5;
const K_URI = 'auto_backup_uri';
const K_NAME = 'auto_backup_folder';
const K_LAST = 'auto_backup_at';
const K_ERROR = 'auto_backup_error';

type Native = {
  pickFolder(): Promise<{ uri: string; name: string } | null>;
  canWriteFolder(uri: string): Promise<boolean>;
  releaseFolder(uri: string): Promise<null>;
  writeToFolder(uri: string, fileName: string, text: string, prefix: string, keep: number): Promise<{ name: string }>;
};

const native = () => {
  const m = NativeModules.VaultFiles as Native | undefined;
  if (!m?.writeToFolder) {
    throw new Error('Automatic backup is not available in this build.');
  }
  return m;
};

export type AutoBackupState = { folder: string; uri: string; lastAt: number | null; error: string | null } | null;

export function autoBackupState(db: DB): AutoBackupState {
  const uri = getSetting(db, K_URI);
  if (!uri) {
    return null;
  }
  const last = getSetting(db, K_LAST);
  const error = getSetting(db, K_ERROR);
  return { uri, folder: getSetting(db, K_NAME) ?? 'Chosen folder', lastAt: last ? Number(last) : null, error: error || null };
}

/** "vault-auto-2026-11-17-142105.vaultbackup": sorts by time, so the oldest are pruned first. */
export function autoFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const d = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const t = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${AUTO_PREFIX}${d}-${t}.vaultbackup`;
}

/** Writes a backup now. Records the time, or the error (shown in Settings). Never throws. */
export async function runAutoBackup(db: DB, dek: Buffer, now = new Date()): Promise<boolean> {
  const state = autoBackupState(db);
  if (!state) {
    return false;
  }
  try {
    const { text } = createBackup(db, dek, now);
    await native().writeToFolder(state.uri, autoFileName(now), text, AUTO_PREFIX, KEEP);
    setSetting(db, K_LAST, String(now.getTime()));
    setSetting(db, K_ERROR, '');
    noteBackup(db, now.getTime());
    return true;
  } catch (e) {
    try {
      setSetting(db, K_ERROR, e instanceof Error ? e.message : 'Could not save the automatic backup.');
    } catch {
      // the vault was locked meanwhile
    }
    return false;
  }
}

/** True when entries changed after the last automatic backup (or there never was one). */
export function changedSinceAutoBackup(db: DB): boolean {
  const state = autoBackupState(db);
  if (!state) {
    return false;
  }
  const r = db.executeSync('SELECT max(updated_at) AS changed FROM entries').rows[0] as { changed: number | null } | undefined;
  return state.lastAt == null || Number(r?.changed ?? 0) > state.lastAt;
}

/** Asks for a folder; on success saves it and writes the first backup there straight away. */
export async function chooseAutoBackupFolder(db: DB, dek: Buffer): Promise<boolean> {
  const old = getSetting(db, K_URI);
  const picked = await native().pickFolder();
  if (!picked) {
    return false;
  }
  if (old && old !== picked.uri) {
    await native().releaseFolder(old).catch(() => null);
  }
  setSetting(db, K_URI, picked.uri);
  setSetting(db, K_NAME, picked.name);
  setSetting(db, K_LAST, '');
  setSetting(db, K_ERROR, '');
  return runAutoBackup(db, dek);
}

/** Turns automatic backup off. Backups already in the folder are left there. */
export async function turnOffAutoBackup(db: DB) {
  const uri = getSetting(db, K_URI);
  if (uri) {
    await native().releaseFolder(uri).catch(() => null);
  }
  for (const k of [K_URI, K_NAME, K_LAST, K_ERROR]) {
    setSetting(db, k, '');
  }
}

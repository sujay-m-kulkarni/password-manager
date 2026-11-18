/**
 * Encrypted backup file (.vaultbackup, JSON text).
 *
 *   { format, v, created,
 *     kdf + pw          — the data key wrapped by the master password at export time
 *     recovery          — the data key wrapped by the recovery key (if one exists)
 *     data              — folders and entries as JSON, AES-256-GCM under a key derived from
 *                         the data key (HMAC-SHA256(DEK, "vault-backup-data:v1")) }
 *
 * So a backup opens with the master password it was made with OR the recovery key, also after
 * the master password has been changed. Nothing in the file is readable without one of them;
 * the file reveals only that it is a Vault backup and when it was made.
 */
import type { DB, Scalar } from '@op-engineering/op-sqlite';
import QuickCrypto from 'react-native-quick-crypto';
import { PIN_ENTRIES_TO_PINS, getSetting, setSetting, type Entry, type Folder } from '../db/database';
import { Buffer, unwrap, wipe, wrap, type Wrapped } from './crypto';
import { readHeader, unwrapWithPassword, unwrapWithRecovery, type Header } from './keyHierarchy';
import { fieldSearchText, parseCustomFields } from '../customFields';
import { SET_TYPE_FROM_FOLDER } from '../entryTypes';

export const BACKUP_FORMAT = 'vault-backup';
const AAD_DATA = 'vault-backup-data:v1';
export const LAST_BACKUP = 'last_backup_at';

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  v: 1;
  created: string;
  kdf: Header['kdf'];
  pw: Wrapped;
  recovery: Header['recovery'] | null;
  data: Wrapped;
};

/** A card row as stored (backups made before 1.5.0 have none). */
export type BackupCard = {
  id: number;
  entry_id: number;
  kind: string;
  number: string;
  expiry: string | null;
  name: string | null;
  pin: string | null;
  created_at: number;
  updated_at: number;
};

export type BackupPin = { id: number; entry_id: number; label: string; value: string; created_at: number; updated_at: number };

export type BackupData = { schema: number; folders: Folder[]; entries: Entry[]; cards?: BackupCard[]; pins?: BackupPin[] };

function dataKey(dek: Buffer): Buffer {
  return QuickCrypto.createHmac('sha256', dek).update(Buffer.from('vault-backup-data:v1', 'utf8')).digest() as Buffer;
}

const rows = <T,>(db: DB, sql: string) => db.executeSync(sql).rows as unknown as T[];

/** Builds the backup text for the open vault. */
export function createBackup(db: DB, dek: Buffer, now = new Date()): { text: string; entries: number } {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  const data: BackupData = {
    schema: Number(rows<{ user_version: number }>(db, 'PRAGMA user_version')[0]?.user_version ?? 0),
    folders: rows<Folder>(db, 'SELECT id, name, color FROM folders ORDER BY id'),
    entries: rows<Entry>(db, 'SELECT * FROM entries ORDER BY id'),
    cards: rows<BackupCard>(db, 'SELECT * FROM cards ORDER BY id'),
    pins: rows<BackupPin>(db, 'SELECT * FROM pins ORDER BY id'),
  };
  const key = dataKey(dek);
  try {
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      v: 1,
      created: now.toISOString(),
      kdf: header.kdf,
      pw: header.pw,
      recovery: header.recovery ?? null,
      data: wrap(key, Buffer.from(JSON.stringify(data), 'utf8'), AAD_DATA),
    };
    return { text: JSON.stringify(file), entries: data.entries.length };
  } finally {
    wipe(key);
  }
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `vault-backup-${d}.vaultbackup`;
}

/** Records a finished export, for the reminder. */
export function noteBackup(db: DB, now = Date.now()) {
  setSetting(db, LAST_BACKUP, String(now));
}

export function lastBackupAt(db: DB): number | null {
  const v = getSetting(db, LAST_BACKUP);
  return v ? Number(v) : null;
}

/**
 * Backup reminder: due when there are entries and either no backup yet, or something changed
 * since the last backup more than `afterDays` ago.
 */
export function backupDue(db: DB, now = Date.now(), afterDays = 30): boolean {
  const r = rows<{ n: number; changed: number | null }>(db, 'SELECT count(*) AS n, max(updated_at) AS changed FROM entries')[0];
  if (!r || Number(r.n) === 0) {
    return false;
  }
  const last = lastBackupAt(db);
  if (last == null) {
    return true;
  }
  return Number(r.changed ?? 0) > last && now - last > afterDays * 86_400_000;
}

/** Parses a picked file; throws with a readable message if it isn't a Vault backup. */
export function parseBackup(text: string): BackupFile {
  let f: BackupFile;
  try {
    f = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('This file is not a Vault backup.');
  }
  if (f?.format !== BACKUP_FORMAT || !f.pw || !f.kdf || !f.data) {
    throw new Error('This file is not a Vault backup.');
  }
  if (f.v !== 1) {
    throw new Error('This backup was made by a newer version of Vault. Update the app first.');
  }
  return f;
}

/** via: which secret opened it. After 'recovery' the master password should be set anew. */
export type OpenedBackup = { dek: Buffer; data: BackupData; header: Header; via: 'password' | 'recovery' };

/** Opens a backup with its master password or recovery key; null if neither matches. */
export async function openBackup(file: BackupFile, secret: string): Promise<OpenedBackup | null> {
  let via: OpenedBackup['via'] = 'password';
  let dek = await unwrapWithPassword(file, secret);
  if (!dek && file.recovery) {
    dek = await unwrapWithRecovery({ recovery: file.recovery }, secret);
    via = 'recovery';
  }
  if (!dek) {
    return null;
  }
  const key = dataKey(dek);
  try {
    const plain = unwrap(key, file.data, AAD_DATA);
    if (!plain) {
      wipe(dek);
      throw new Error('The backup file is damaged.');
    }
    const data = JSON.parse(plain.toString('utf8')) as BackupData;
    const header: Header = { v: 1, kdf: file.kdf, pw: file.pw, ...(file.recovery ? { recovery: file.recovery } : {}) };
    return { dek, data, header, via };
  } finally {
    wipe(key);
  }
}

/** Replaces all folders and entries in `db` with the backup's. Settings are kept. */
export function restoreInto(db: DB, data: BackupData) {
  db.executeSync('BEGIN');
  try {
    db.executeSync('DELETE FROM pins');
    db.executeSync('DELETE FROM cards');
    db.executeSync('DELETE FROM entries');
    db.executeSync('DELETE FROM folders');
    for (const f of data.folders) {
      db.executeSync('INSERT INTO folders (id, name, color) VALUES (?, ?, ?)', [f.id, f.name, f.color]);
    }
    for (const e of data.entries) {
      const params: Scalar[] = [
        e.id,
        e.kind ?? 'login',
        e.type ?? null,
        e.fields ?? null,
        // Worked out again rather than trusted: values of fields that are not Hidden.
        fieldSearchText(parseCustomFields(e.fields)),
        e.folder_id ?? null,
        e.title,
        e.username ?? null,
        e.password,
        e.url ?? null,
        e.notes ?? null,
        e.favorite ? 1 : 0,
        e.created_at,
        e.updated_at,
      ];
      db.executeSync(
        `INSERT INTO entries (id, kind, type, fields, field_text, folder_id, title, username, password, url, notes,
           favorite, created_at, updated_at)
         VALUES (?, ?, coalesce(?, 'other'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
      );
    }
    // Backups from before types existed: choose each entry's type from its folder, as the upgrade did.
    if (data.entries.length && data.entries.every(e => e.type == null)) {
      db.executeSync(SET_TYPE_FROM_FOLDER);
    }
    for (const p of data.pins ?? []) {
      db.executeSync(
        'INSERT INTO pins (id, entry_id, label, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [p.id, p.entry_id, p.label, p.value, p.created_at, p.updated_at],
      );
    }
    // Backups from before 1.5.0: PIN entries become entries holding one PIN, as the upgrade did.
    for (const sql of PIN_ENTRIES_TO_PINS) {
      db.executeSync(sql);
    }
    for (const c of data.cards ?? []) {
      db.executeSync(
        `INSERT INTO cards (id, entry_id, kind, number, expiry, name, pin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.entry_id, c.kind, c.number, c.expiry, c.name, c.pin, c.created_at, c.updated_at],
      );
    }
    db.executeSync('COMMIT');
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
}

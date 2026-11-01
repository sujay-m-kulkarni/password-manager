import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import { Buffer } from '../security/crypto';

export const VAULT_DB = 'vault.sqlite';
export const META_DB = 'vault_meta.sqlite';

/**
 * Opens the SQLCipher vault with the 256-bit data key as a RAW key
 * (x'<hex>' form), which skips SQLCipher's own KDF — Argon2id already did the slow work.
 * Throws if the key is wrong.
 */
export function openVault(dek: Buffer): DB {
  const db = open({ name: VAULT_DB, encryptionKey: `x'${dek.toString('hex')}'` });
  try {
    db.executeSync('PRAGMA cipher_memory_security = ON');
    db.executeSync('SELECT count(*) FROM sqlite_master'); // fails here on a wrong key
    migrate(db);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Removes a vault file left behind by an interrupted setup. */
export function deleteVaultFile() {
  try {
    const db = open({ name: VAULT_DB, encryptionKey: "x'00'" });
    db.delete();
  } catch {
    // nothing to delete
  }
}

/** Plaintext DB holding only non-secret header data (salt, KDF params, wrapped key). */
export function openMeta(): DB {
  const db = open({ name: META_DB });
  db.executeSync('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return db;
}

// ---------- migrations ----------

const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE folders (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL,
      color TEXT NOT NULL
    )`,
    `CREATE TABLE entries (
      id         INTEGER PRIMARY KEY,
      folder_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      title      TEXT NOT NULL,
      username   TEXT,
      password   TEXT NOT NULL,
      url        TEXT,
      notes      TEXT,
      favorite   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_entries_folder ON entries(folder_id)`,
    `CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )`,
    `INSERT INTO folders (name, color) VALUES
      ('Banking', 'blue'), ('Work', 'orange'), ('Email', 'pink'), ('Social', 'green')`,
  ],
];

function migrate(db: DB) {
  db.executeSync('PRAGMA foreign_keys = ON');
  const row = db.executeSync('PRAGMA user_version').rows[0];
  let version = Number(row?.user_version ?? 0);
  while (version < MIGRATIONS.length) {
    const steps = MIGRATIONS[version];
    db.executeSync('BEGIN');
    try {
      for (const sql of steps) {
        db.executeSync(sql);
      }
      version += 1;
      db.executeSync(`PRAGMA user_version = ${version}`);
      db.executeSync('COMMIT');
    } catch (e) {
      db.executeSync('ROLLBACK');
      throw e;
    }
  }
}

// ---------- queries ----------

export type Folder = { id: number; name: string; color: string };

export type Entry = {
  id: number;
  folder_id: number | null;
  title: string;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
  favorite: number;
  created_at: number;
  updated_at: number;
};

export type EntryListItem = Pick<Entry, 'id' | 'title' | 'username' | 'favorite' | 'folder_id'> & {
  folder_color: string | null;
};

export type EntryInput = {
  folder_id: number | null;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  favorite: boolean;
};

const rows = <T,>(db: DB, sql: string, params: Scalar[] = []) =>
  db.executeSync(sql, params).rows as unknown as T[];

export function listFolders(db: DB): Folder[] {
  return rows<Folder>(db, 'SELECT id, name, color FROM folders ORDER BY name');
}

export function listEntries(db: DB, search: string, folderId: number | null): EntryListItem[] {
  const where: string[] = [];
  const params: Scalar[] = [];
  const q = search.trim();
  if (q) {
    // Search is done inside the decrypted DB connection; nothing is indexed in plaintext elsewhere.
    where.push("(e.title LIKE ? ESCAPE '\\' OR e.username LIKE ? ESCAPE '\\' OR e.url LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    params.push(like, like, like);
  }
  if (folderId != null) {
    where.push('e.folder_id = ?');
    params.push(folderId);
  }
  const sql = `SELECT e.id, e.title, e.username, e.favorite, e.folder_id, f.color AS folder_color
    FROM entries e LEFT JOIN folders f ON f.id = e.folder_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.title COLLATE NOCASE`;
  return rows<EntryListItem>(db, sql, params);
}

export function countEntries(db: DB): number {
  return Number(rows<{ n: number }>(db, 'SELECT count(*) AS n FROM entries')[0]?.n ?? 0);
}

export function getEntry(db: DB, id: number): Entry | null {
  return rows<Entry>(db, 'SELECT * FROM entries WHERE id = ?', [id])[0] ?? null;
}

export function getPassword(db: DB, id: number): string | null {
  return rows<{ password: string }>(db, 'SELECT password FROM entries WHERE id = ?', [id])[0]?.password ?? null;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function saveEntry(db: DB, input: EntryInput, id?: number): number {
  const now = Date.now();
  const common: Scalar[] = [
    input.folder_id,
    input.title.trim(),
    orNull(input.username),
    input.password,
    orNull(input.url),
    orNull(input.notes),
    input.favorite ? 1 : 0,
  ];
  if (id != null) {
    db.executeSync(
      `UPDATE entries SET folder_id = ?, title = ?, username = ?, password = ?, url = ?, notes = ?,
       favorite = ?, updated_at = ? WHERE id = ?`,
      [...common, now, id],
    );
    return id;
  }
  const res = db.executeSync(
    `INSERT INTO entries (folder_id, title, username, password, url, notes, favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...common, now, now],
  );
  return Number(res.insertId);
}

export function setFavorite(db: DB, id: number, favorite: boolean) {
  db.executeSync('UPDATE entries SET favorite = ? WHERE id = ?', [favorite ? 1 : 0, id]);
}

export function deleteEntry(db: DB, id: number) {
  db.executeSync('DELETE FROM entries WHERE id = ?', [id]);
}

export function getSetting(db: DB, key: string): string | null {
  return rows<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key])[0]?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string) {
  db.executeSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

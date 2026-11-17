import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import { cardProblem, digits, type Card, type CardKind } from '../cards';
import { SET_TYPE_FROM_FOLDER, serializeFields, type EntryType, type TypeFields } from '../entryTypes';
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

let metaDb: DB | null = null;

/**
 * Plaintext DB holding only non-secret header data (salt, KDF params, wrapped key).
 * One connection for the life of the app: opening and closing it for every read made op-sqlite
 * start and stop a thread each time, which set off its thread-id crash (see patches/).
 */
export function openMeta(): DB {
  if (!metaDb) {
    const db = open({ name: META_DB });
    db.executeSync('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    metaDb = db;
  }
  return metaDb;
}

/** For tests that replace the database files underneath. */
export function resetMetaConnection() {
  metaDb = null;
}

// ---------- migrations ----------

/** Turns pre-1.5.0 PIN entries into entries holding one PIN (migration and old backups). */
export const PIN_ENTRIES_TO_PINS = [
  `INSERT INTO pins (entry_id, label, value, created_at, updated_at)
     SELECT id, 'PIN', password, created_at, updated_at FROM entries WHERE kind = 'pin' AND password <> ''`,
  `UPDATE entries SET password = '', username = NULL, url = NULL, kind = 'login' WHERE kind = 'pin'`,
];

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
  // v2: PIN entries (phone lock, SIM, ATM/card, UPI). The PIN is kept in `password`.
  [`ALTER TABLE entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'login'`],
  // v3 (1.5.0): types replace folders; type-specific fields (JSON); cards inside Banking entries.
  // The folders table is kept (backups still carry it), but the app no longer shows folders.
  [
    `ALTER TABLE entries ADD COLUMN type TEXT NOT NULL DEFAULT 'other'`,
    `ALTER TABLE entries ADD COLUMN fields TEXT`,
    SET_TYPE_FROM_FOLDER,
    `CREATE INDEX idx_entries_type ON entries(type)`,
    `CREATE TABLE cards (
      id         INTEGER PRIMARY KEY,
      entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      number     TEXT NOT NULL,
      expiry     TEXT,
      name       TEXT,
      pin        TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_cards_entry ON cards(entry_id)`,
    // Named PINs inside an entry (UPI PIN, ATM PIN, MPIN…). PIN-only entries from before become
    // entries holding one PIN called "PIN"; the Login/PIN switch is gone.
    `CREATE TABLE pins (
      id         INTEGER PRIMARY KEY,
      entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      value      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_pins_entry ON pins(entry_id)`,
    ...PIN_ENTRIES_TO_PINS,
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

/** Legacy: before 1.5.0 an entry was either a login or a PIN. Kept as a column, always 'login' now. */
export type EntryKind = 'login' | 'pin';

/** A named PIN inside an entry. Any of the two PIN formats (see isValidPin). */
export type EntryPin = { id?: number; label: string; value: string };

/** Suggested PIN names, offered as one-tap chips. */
export const PIN_LABELS = ['UPI PIN', 'ATM PIN', 'MPIN', 'TPIN', 'Phone lock', 'SIM PIN'];

export type Entry = {
  id: number;
  kind: EntryKind;
  type: EntryType;
  /** JSON of the type's extra fields (account number, IFSC, client ID…), or null. */
  fields: string | null;
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

export type EntryListItem = Pick<Entry, 'id' | 'type' | 'title' | 'username' | 'favorite' | 'folder_id'> & {
  folder_color: string | null;
  cards: number;
  pins: number;
  has_password: number;
};

export type EntryInput = {
  /** When given, replaces the entry's PINs. */
  pins?: EntryPin[];
  /** Defaults to 'other'. */
  type?: EntryType;
  fields?: TypeFields;
  /** When given, replaces the entry's cards (Banking only; ignored for other types). */
  cards?: Card[];
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
  return rows<Folder>(db, 'SELECT id, name, color FROM folders ORDER BY name COLLATE NOCASE');
}

export type FolderWithCount = Folder & { entries: number };

export function listFoldersWithCounts(db: DB): FolderWithCount[] {
  return rows<FolderWithCount>(
    db,
    `SELECT f.id, f.name, f.color, count(e.id) AS entries
     FROM folders f LEFT JOIN entries e ON e.folder_id = f.id
     GROUP BY f.id ORDER BY f.name COLLATE NOCASE`,
  );
}

export const FOLDER_NAME_MAX = 30;

/** Throws a readable message if the name is empty, too long, or already used by another folder. */
function checkFolderName(db: DB, name: string, exceptId?: number): string {
  const n = name.trim();
  if (!n) {
    throw new Error('Give the folder a name.');
  }
  if (n.length > FOLDER_NAME_MAX) {
    throw new Error(`Keep the name to ${FOLDER_NAME_MAX} characters.`);
  }
  const clash = rows<{ id: number }>(db, 'SELECT id FROM folders WHERE name = ? COLLATE NOCASE', [n]).find(
    r => r.id !== exceptId,
  );
  if (clash) {
    throw new Error(`There is already a folder called "${n}".`);
  }
  return n;
}

export function addFolder(db: DB, name: string, color: string): number {
  const n = checkFolderName(db, name);
  return Number(db.executeSync('INSERT INTO folders (name, color) VALUES (?, ?)', [n, color]).insertId);
}

export function updateFolder(db: DB, id: number, name: string, color: string) {
  const n = checkFolderName(db, name, id);
  db.executeSync('UPDATE folders SET name = ?, color = ? WHERE id = ?', [n, color, id]);
}

/** Deletes the folder; its entries are kept, without a folder. */
export function deleteFolder(db: DB, id: number) {
  db.executeSync('BEGIN');
  try {
    db.executeSync('UPDATE entries SET folder_id = NULL WHERE folder_id = ?', [id]);
    db.executeSync('DELETE FROM folders WHERE id = ?', [id]);
    db.executeSync('COMMIT');
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
}

export function listEntries(
  db: DB,
  search: string,
  folderId: number | null,
  withPinsOnly = false,
  type: EntryType | null = null,
): EntryListItem[] {
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
  if (withPinsOnly) {
    where.push('EXISTS (SELECT 1 FROM pins p WHERE p.entry_id = e.id)');
  }
  if (type != null) {
    where.push('e.type = ?');
    params.push(type);
  }
  const sql = `SELECT e.id, e.type, e.title, e.username, e.favorite, e.folder_id, f.color AS folder_color,
      (SELECT count(*) FROM cards c WHERE c.entry_id = e.id) AS cards,
      (SELECT count(*) FROM pins p WHERE p.entry_id = e.id) AS pins,
      (e.password <> '') AS has_password
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

/** What the list's Copy button copies: the password, or the first PIN when there is none. */
export function getQuickSecret(db: DB, id: number): { what: 'password' | 'PIN'; value: string } | null {
  const pw = rows<{ password: string }>(db, 'SELECT password FROM entries WHERE id = ?', [id])[0]?.password;
  if (pw) {
    return { what: 'password', value: pw };
  }
  const pin = listPins(db, id)[0];
  return pin ? { what: 'PIN', value: pin.value } : null;
}

export function listPins(db: DB, entryId: number): EntryPin[] {
  return rows<{ id: number; label: string; value: string }>(
    db,
    'SELECT id, label, value FROM pins WHERE entry_id = ? ORDER BY id',
    [entryId],
  ).map(r => ({ id: r.id, label: r.label, value: r.value }));
}

/** First problem with a PIN, or null. */
export function pinProblem(p: EntryPin): string | null {
  const name = p.label.trim() || 'PIN';
  return isValidPin(p.value) ? null : `${name}: 4 to 12 digits, or 4 to 16 letters and digits.`;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function listCards(db: DB, entryId: number): Card[] {
  return rows<{ id: number; kind: CardKind; number: string; expiry: string | null; name: string | null; pin: string | null }>(
    db,
    'SELECT id, kind, number, expiry, name, pin FROM cards WHERE entry_id = ? ORDER BY id',
    [entryId],
  ).map(r => ({ id: r.id, kind: r.kind, number: r.number, expiry: r.expiry ?? '', name: r.name ?? '', pin: r.pin ?? '' }));
}

/**
 * Saves an entry with its PINs and cards (each replaced when given) in one transaction.
 * An entry needs a title and at least one of: a password, a PIN, a card.
 */
export function saveEntry(db: DB, input: EntryInput, id?: number): number {
  const now = Date.now();
  if (!input.title.trim()) {
    throw new Error('Give the entry a title.');
  }
  const type: EntryType = input.type ?? 'other';
  const cards = type === 'banking' ? input.cards : input.cards ? [] : undefined;
  for (const c of cards ?? []) {
    const problem = cardProblem(c);
    if (problem) {
      throw new Error(problem);
    }
  }
  const pins = input.pins?.map(p => ({ label: p.label.trim() || 'PIN', value: p.value }));
  for (const p of pins ?? []) {
    const problem = pinProblem(p);
    if (problem) {
      throw new Error(problem);
    }
  }
  if (!input.password && (pins ?? (id != null ? listPins(db, id) : [])).length === 0 && (cards ?? []).length === 0) {
    throw new Error('Add a password, a PIN or a card.');
  }
  const fields = serializeFields(type, input.fields ?? {});
  db.executeSync('BEGIN');
  try {
    const entryId = writeEntry(db, input, type, fields, now, id);
    if (pins) {
      db.executeSync('DELETE FROM pins WHERE entry_id = ?', [entryId]);
      for (const p of pins) {
        db.executeSync('INSERT INTO pins (entry_id, label, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
          entryId,
          p.label,
          p.value,
          now,
          now,
        ]);
      }
    }
    if (cards) {
      db.executeSync('DELETE FROM cards WHERE entry_id = ?', [entryId]);
      for (const c of cards) {
        db.executeSync(
          'INSERT INTO cards (entry_id, kind, number, expiry, name, pin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [entryId, c.kind, digits(c.number), orNull(c.expiry), orNull(c.name), orNull(c.pin), now, now],
        );
      }
    }
    db.executeSync('COMMIT');
    return entryId;
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
}

function writeEntry(db: DB, input: EntryInput, type: EntryType, fields: string | null, now: number, id?: number): number {
  const common: Scalar[] = [
    'login',
    type,
    fields,
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
      `UPDATE entries SET kind = ?, type = ?, fields = ?, folder_id = ?, title = ?, username = ?, password = ?,
       url = ?, notes = ?, favorite = ?, updated_at = ? WHERE id = ?`,
      [...common, now, id],
    );
    return id;
  }
  const res = db.executeSync(
    `INSERT INTO entries (kind, type, fields, folder_id, title, username, password, url, notes, favorite,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...common, now, now],
  );
  return Number(res.insertId);
}

export function setFavorite(db: DB, id: number, favorite: boolean) {
  db.executeSync('UPDATE entries SET favorite = ? WHERE id = ?', [favorite ? 1 : 0, id]);
}

export function deleteEntry(db: DB, id: number) {
  db.executeSync('DELETE FROM pins WHERE entry_id = ?', [id]);
  db.executeSync('DELETE FROM cards WHERE entry_id = ?', [id]);
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

// ---------- PINs ----------

/**
 * Two kinds of PIN:
 *  - numbers: phone lock, SIM, ATM/card and UPI PINs, 4 to 12 digits (an 8-digit SIM PUK fits);
 *  - letters & numbers: app passcodes and the like, 4 to 16 letters or digits (case kept).
 * Which one a PIN is follows from what it holds, so nothing extra is stored.
 */
export type PinFormat = 'numeric' | 'alphanumeric';
export const PIN_MIN = 4;
export const PIN_MAX = 12;
export const PIN_ALNUM_MAX = 16;

export const pinMax = (format: PinFormat) => (format === 'numeric' ? PIN_MAX : PIN_ALNUM_MAX);

/** Keeps only the characters a PIN of this format may hold, cut to its maximum length. */
export function cleanPin(text: string, format: PinFormat): string {
  return text.replace(format === 'numeric' ? /[^0-9]/g : /[^0-9A-Za-z]/g, '').slice(0, pinMax(format));
}

/** 'numeric' for digits only (or empty), else 'alphanumeric'. */
export function pinFormatOf(pin: string): PinFormat {
  return /^[0-9]*$/.test(pin) ? 'numeric' : 'alphanumeric';
}

/** With no format: valid as either kind. */
export function isValidPin(pin: string, format?: PinFormat): boolean {
  const numeric = new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(pin);
  const alnum = new RegExp(`^[0-9A-Za-z]{${PIN_MIN},${PIN_ALNUM_MAX}}$`).test(pin);
  return format === 'numeric' ? numeric : format === 'alphanumeric' ? alnum : numeric || alnum;
}

/** "482913" → "482 913", "1234" → "1234", "12345678" → "1234 5678": easier to read off the screen. */
export function groupPin(pin: string): string {
  if (pin.length <= 4) {
    return pin;
  }
  const size = pin.length % 4 === 0 ? 4 : 3;
  return pin.match(new RegExp(`.{1,${size}}`, 'g'))!.join(' ');
}

/**
 * Wrapped-key hierarchy (docs/project-notes.md §4.2)
 *
 *   DEK (random 256-bit)  ── opens SQLCipher as a raw key
 *     ├─ wrapped by Argon2id(master password)   → header.pw
 *     ├─ wrapped by Argon2id(recovery key)      → header.recovery
 *     └─ copy in the Android Keystore, released by fingerprint / phone lock (security/biometric.ts)
 *
 * The header holds only non-secret data (salts, KDF params, wrapped DEK) and lives in a small
 * plaintext DB next to the vault, together with a few non-secret flags (meta values below).
 * The master password and recovery key are never stored.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { deleteVaultFile, openMeta, openVault } from '../db/database';
import { step } from '../utils/steps';
import {
  Buffer,
  deriveKek,
  calibratedKdfParams,
  randomBytes,
  unwrap,
  wipe,
  wrap,
  type KdfParams,
  type Wrapped,
} from './crypto';

export type Header = {
  v: 1;
  kdf: KdfParams;
  pw: Wrapped;
  recovery?: { kdf: KdfParams; wrap: Wrapped };
};

const HEADER_KEY = 'header';
export const AAD_PW = 'vault-dek:password:v1';
export const AAD_RECOVERY = 'vault-dek:recovery:v1';

// The recovery key is 120 random bits, so it needs no slow key stretching to resist guessing;
// a light Argon2id keeps unlocking with it quick.
const RECOVERY_KDF: Omit<KdfParams, 'salt'> = { alg: 'argon2id', memKiB: 8 * 1024, passes: 1, parallelism: 1 };

// ---------- meta: header and non-secret flags ----------

export function getMeta(key: string): string | null {
  const raw = openMeta().executeSync('SELECT value FROM meta WHERE key = ?', [key]).rows[0]?.value;
  return typeof raw === 'string' ? raw : null;
}

export function setMeta(key: string, value: string | null) {
  const meta = openMeta();
  if (value == null) {
    meta.executeSync('DELETE FROM meta WHERE key = ?', [key]);
  } else {
    meta.executeSync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
}

export function readHeader(): Header | null {
  const raw = getMeta(HEADER_KEY);
  return raw ? (JSON.parse(raw) as Header) : null;
}

function writeHeader(h: Header) {
  setMeta(HEADER_KEY, JSON.stringify(h));
}

export function vaultExists(): boolean {
  return readHeader() != null;
}

export function hasRecoveryKey(): boolean {
  return readHeader()?.recovery != null;
}

/** When the master password was last typed to unlock (ms), for the weekly password check. */
export const LAST_PASSWORD_UNLOCK = 'last_password_unlock';

/** How long the last master-password derivation took on this phone (ms), shown in Settings. */
export const UNLOCK_MS = 'unlock_ms';

async function timedDerive(password: string, kdf: KdfParams): Promise<Buffer> {
  const t0 = Date.now();
  const kek = await deriveKek(password, kdf);
  try {
    setMeta(UNLOCK_MS, String(Date.now() - t0));
  } catch {
    // timing is informational only
  }
  return kek;
}

/** { ms, passes, memMiB } of the master-password key derivation, or null before setup. */
export function unlockCost(): { ms: number | null; passes: number; memMiB: number } | null {
  const header = readHeader();
  if (!header) {
    return null;
  }
  const ms = Number(getMeta(UNLOCK_MS));
  return { ms: Number.isFinite(ms) && ms > 0 ? ms : null, passes: header.kdf.passes, memMiB: Math.round(header.kdf.memKiB / 1024) };
}

export function notePasswordUnlock(now = Date.now()) {
  setMeta(LAST_PASSWORD_UNLOCK, String(now));
}

// ---------- recovery key format ----------

// Crockford base32: no I, L, O or U, so the code can be read back without confusion.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 15 random bytes → 24 characters, shown as six groups of four: K7QM-2XRP-…  */
export function newRecoveryCode(): string {
  const bytes = randomBytes(15);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

/** Accepts the code with or without dashes or spaces, any case; O→0 and I/L→1 as typed by people. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== 24 || [...s].some(c => !ALPHABET.includes(c))) {
    return null;
  }
  return s.match(/.{4}/g)!.join('-');
}

// ---------- create / unlock ----------

export type Opened = { db: DB; dek: Buffer };

/** First-run setup. Returns the open vault and its data key (wipe it on lock). */
export async function createVault(masterPassword: string): Promise<Opened> {
  if (vaultExists()) {
    throw new Error('A vault already exists on this phone.');
  }
  deleteVaultFile(); // clean up after any interrupted earlier setup

  const dek = randomBytes(32);
  const kdf = await calibratedKdfParams();
  const kek = await timedDerive(masterPassword, kdf);
  try {
    const header: Header = { v: 1, kdf, pw: wrap(kek, dek, AAD_PW) };
    const db = openVault(dek); // creates the encrypted file and runs migrations
    writeHeader(header); // written last: a header means a usable vault exists
    notePasswordUnlock();
    return { db, dek };
  } catch (e) {
    wipe(dek);
    throw e;
  } finally {
    wipe(kek);
  }
}

/** Creates the vault on this phone from a backup's key material (restore on a new phone). */
export function createVaultFromBackup(header: Header, dek: Buffer): DB {
  if (vaultExists()) {
    throw new Error('A vault already exists on this phone.');
  }
  deleteVaultFile();
  const db = openVault(dek);
  writeHeader(header);
  return db;
}

export type UnlockResult = ({ ok: true } & Opened) | { ok: false };

export async function unlockWithPassword(masterPassword: string): Promise<UnlockResult> {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  step(`password: deriving key (${header.kdf.memKiB / 1024} MB × ${header.kdf.passes})`);
  const dek = await unwrapWithPassword(header, masterPassword);
  step(dek ? 'password: correct' : 'password: wrong');
  if (!dek) {
    return { ok: false };
  }
  try {
    step('password: opening encrypted database');
    const db = openVault(dek);
    step('password: database open');
    notePasswordUnlock();
    return { ok: true, db, dek };
  } catch (e) {
    wipe(dek);
    throw e;
  }
}

export async function unlockWithRecoveryKey(code: string): Promise<UnlockResult> {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  const dek = await unwrapWithRecovery(header, code);
  if (!dek) {
    return { ok: false };
  }
  try {
    return { ok: true, db: openVault(dek), dek };
  } catch (e) {
    wipe(dek);
    throw e;
  }
}

/** Fingerprint / phone-lock unlock: the Keystore released the data key itself. */
export function unlockWithDek(dek: Buffer): DB {
  step('fingerprint: opening encrypted database');
  const db = openVault(dek);
  step('fingerprint: database open');
  return db;
}

export async function unwrapWithPassword(header: Pick<Header, 'kdf' | 'pw'>, password: string): Promise<Buffer | null> {
  const kek = await timedDerive(password, header.kdf);
  try {
    return unwrap(kek, header.pw, AAD_PW); // null = wrong password (GCM tag mismatch)
  } finally {
    wipe(kek);
  }
}

export async function unwrapWithRecovery(header: Pick<Header, 'recovery'>, code: string): Promise<Buffer | null> {
  const normalized = normalizeRecoveryCode(code);
  if (!header.recovery || !normalized) {
    return null;
  }
  const kek = await deriveKek(normalized, header.recovery.kdf);
  try {
    return unwrap(kek, header.recovery.wrap, AAD_RECOVERY);
  } finally {
    wipe(kek);
  }
}

/** True if this is the current master password (checked without touching the database). */
export async function verifyPassword(password: string): Promise<boolean> {
  const header = readHeader();
  if (!header) {
    return false;
  }
  const dek = await unwrapWithPassword(header, password);
  const ok = dek != null;
  wipe(dek);
  return ok;
}

// ---------- change password, recovery key ----------

/** Re-wraps the data key under a new master password. The vault itself is not re-encrypted. */
export async function changePassword(dek: Buffer, newPassword: string): Promise<void> {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  const kdf = await calibratedKdfParams();
  const kek = await timedDerive(newPassword, kdf);
  try {
    writeHeader({ ...header, kdf, pw: wrap(kek, dek, AAD_PW) });
    notePasswordUnlock();
  } finally {
    wipe(kek);
  }
}

/** Makes a new recovery key (replacing any old one) and returns it, to show once. */
export async function createRecoveryKey(dek: Buffer): Promise<string> {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  const code = newRecoveryCode();
  const kdf: KdfParams = { ...RECOVERY_KDF, salt: randomBytes(16).toString('base64') };
  const kek = await deriveKek(code, kdf);
  try {
    writeHeader({ ...header, recovery: { kdf, wrap: wrap(kek, dek, AAD_RECOVERY) } });
    return code;
  } finally {
    wipe(kek);
  }
}

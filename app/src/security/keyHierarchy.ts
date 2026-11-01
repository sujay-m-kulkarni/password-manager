/**
 * Wrapped-key hierarchy (kickoff doc §4.2)
 *
 *   DEK (random 256-bit)  ── opens SQLCipher as a raw key
 *     ├─ wrapped by Argon2id(master password)      → header.pw        (this file)
 *     ├─ wrapped by Argon2id(recovery key)         → header.recovery  (build step 7)
 *     └─ biometric copy in Android Keystore        →                  (build step 7)
 *
 * The header holds only non-secret data (salt, KDF params, wrapped DEK) and lives
 * in a small plaintext DB next to the vault. The master password is never stored.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { deleteVaultFile, openMeta, openVault } from '../db/database';
import {
  Buffer,
  deriveKek,
  newKdfParams,
  randomBytes,
  unwrap,
  wipe,
  wrap,
  type KdfParams,
  type Wrapped,
} from './crypto';

type Header = {
  v: 1;
  kdf: KdfParams;
  pw: Wrapped;
  recovery?: { kdf: KdfParams; wrap: Wrapped };
};

const HEADER_KEY = 'header';
const AAD_PW = 'vault-dek:password:v1';

function readHeader(): Header | null {
  const meta = openMeta();
  try {
    const raw = meta.executeSync('SELECT value FROM meta WHERE key = ?', [HEADER_KEY]).rows[0]?.value;
    return typeof raw === 'string' ? (JSON.parse(raw) as Header) : null;
  } finally {
    meta.close();
  }
}

function writeHeader(h: Header) {
  const meta = openMeta();
  try {
    meta.executeSync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [HEADER_KEY, JSON.stringify(h)],
    );
  } finally {
    meta.close();
  }
}

export function vaultExists(): boolean {
  return readHeader() != null;
}

/** First-run setup. Returns the open vault. */
export async function createVault(masterPassword: string): Promise<DB> {
  if (vaultExists()) {
    throw new Error('A vault already exists on this phone.');
  }
  deleteVaultFile(); // clean up after any interrupted earlier setup

  const dek = randomBytes(32);
  const kdf = newKdfParams();
  const kek = await deriveKek(masterPassword, kdf);
  try {
    const header: Header = { v: 1, kdf, pw: wrap(kek, dek, AAD_PW) };
    const db = openVault(dek); // creates the encrypted file and runs migrations
    writeHeader(header); // written last: a header means a usable vault exists
    return db;
  } finally {
    wipe(kek);
    wipe(dek);
  }
}

export type UnlockResult = { ok: true; db: DB } | { ok: false };

export async function unlockWithPassword(masterPassword: string): Promise<UnlockResult> {
  const header = readHeader();
  if (!header) {
    throw new Error('No vault found.');
  }
  const kek = await deriveKek(masterPassword, header.kdf);
  let dek: Buffer | null = null;
  try {
    dek = unwrap(kek, header.pw, AAD_PW);
    if (!dek) {
      return { ok: false }; // wrong password (GCM tag mismatch)
    }
    return { ok: true, db: openVault(dek) };
  } finally {
    wipe(kek);
    wipe(dek);
  }
}

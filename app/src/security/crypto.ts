/**
 * Thin wrappers over react-native-quick-crypto (native OpenSSL).
 * No custom cryptography: Argon2id for key derivation, AES-256-GCM for key wrapping,
 * OS CSPRNG for randomness.
 */
import QuickCrypto, { Buffer } from 'react-native-quick-crypto';

export type KdfParams = {
  alg: 'argon2id';
  /** Memory cost in KiB (65536 = 64 MiB). */
  memKiB: number;
  passes: number;
  parallelism: number;
  /** base64 */
  salt: string;
};

export type Wrapped = { iv: string; ct: string; tag: string }; // base64 fields

// Starting point; calibratedKdfParams() tunes the passes to the phone it runs on.
export const DEFAULT_KDF: Omit<KdfParams, 'salt'> = {
  alg: 'argon2id',
  memKiB: 64 * 1024,
  passes: 3,
  parallelism: 1,
};

export const randomBytes = (n: number): Buffer => QuickCrypto.randomBytes(n);

export function newKdfParams(): KdfParams {
  return { ...DEFAULT_KDF, salt: randomBytes(16).toString('base64') };
}

/** Unlock target: long enough to slow guessing, short enough not to annoy. */
export const KDF_TARGET_MS = 700;
export const KDF_MIN_PASSES = 1; // 64 MiB × 1 pass is still above the OWASP minimum for Argon2id
export const KDF_MAX_PASSES = 8;

/** Passes for 64 MiB that make one derivation take about KDF_TARGET_MS, given one pass took `onePassMs`. */
export function passesFor(onePassMs: number): number {
  const p = Math.round(KDF_TARGET_MS / Math.max(onePassMs, 1));
  return Math.min(KDF_MAX_PASSES, Math.max(KDF_MIN_PASSES, p));
}

/**
 * KDF params tuned to this phone: times one 64 MiB pass and scales the passes so unlocking
 * takes about 0.7 s (a fast phone gets more passes, so guessing costs an attacker more).
 */
export async function calibratedKdfParams(): Promise<KdfParams> {
  const probe: KdfParams = { ...DEFAULT_KDF, passes: 1, salt: randomBytes(16).toString('base64') };
  const t0 = Date.now();
  const k = await deriveKek('calibration', probe);
  wipe(k);
  return { ...DEFAULT_KDF, passes: passesFor(Date.now() - t0), salt: randomBytes(16).toString('base64') };
}

/** Derives a 32-byte key-encryption key from a secret (master password or recovery key). */
export function deriveKek(secret: string, p: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QuickCrypto.argon2(
      p.alg,
      {
        message: Buffer.from(secret.normalize('NFKC'), 'utf8'),
        nonce: Buffer.from(p.salt, 'base64'),
        parallelism: p.parallelism,
        tagLength: 32,
        memory: p.memKiB,
        passes: p.passes,
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
  });
}

/** AES-256-GCM encrypt `plain` under `kek`. `aad` binds the wrap to its purpose. */
export function wrap(kek: Buffer, plain: Buffer, aad: string): Wrapped {
  const iv = randomBytes(12);
  const c = QuickCrypto.createCipheriv('aes-256-gcm', kek, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  const tag = c.getAuthTag();
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
}

/** Returns null when the key is wrong (GCM authentication fails). */
export function unwrap(kek: Buffer, w: Wrapped, aad: string): Buffer | null {
  try {
    const d = QuickCrypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(w.iv, 'base64'));
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(Buffer.from(w.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(w.ct, 'base64')), d.final()]);
  } catch {
    return null;
  }
}

/** Best-effort wipe of key material held in a Buffer. */
export function wipe(b: Buffer | null | undefined) {
  if (b) {
    b.fill(0);
  }
}

export { Buffer };

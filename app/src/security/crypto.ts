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

// Tune on your slowest target phone: aim for 0.5–1 s per derivation.
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

/**
 * Logic tests that run on Node (no device needed).
 * Native modules are mocked: quick-crypto → Node's crypto (Argon2 replaced by scrypt
 * for the test only), Keychain → in-memory map.
 */
jest.mock('react-native-quick-crypto', () => {
  const nodeCrypto = require('crypto');
  const NodeBuffer = require('buffer').Buffer;
  const api = {
    randomBytes: (n: number) => nodeCrypto.randomBytes(n),
    createCipheriv: nodeCrypto.createCipheriv,
    createDecipheriv: nodeCrypto.createDecipheriv,
    argon2: (_alg: string, p: any, cb: (e: Error | null, r?: unknown) => void) =>
      nodeCrypto.scrypt(p.message, p.nonce, p.tagLength, cb),
  };
  return { __esModule: true, default: api, Buffer: NodeBuffer };
});

jest.mock('react-native-keychain', () => {
  const store = new Map<string, string>();
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
    getGenericPassword: async ({ service }: { service: string }) =>
      store.has(service) ? { username: 'u', password: store.get(service) } : false,
    setGenericPassword: async (_u: string, p: string, { service }: { service: string }) => {
      store.set(service, p);
      return true;
    },
  };
});

import { Buffer, deriveKek, newKdfParams, randomBytes, unwrap, wrap } from '../src/security/crypto';
import { recordFailure, recordSuccess, remainingWaitMs } from '../src/security/lockout';
import { estimateStrength } from '../src/utils/strength';

describe('key wrapping', () => {
  it('unwraps with the right password and fails with the wrong one', async () => {
    const dek = randomBytes(32);
    const kdf = newKdfParams();
    const kek = await deriveKek('purple mango river forty', kdf);
    const w = wrap(kek, dek, 'aad');

    const again = await deriveKek('purple mango river forty', kdf);
    expect(unwrap(again, w, 'aad')?.equals(dek)).toBe(true);

    const wrong = await deriveKek('purple mango river fifty', kdf);
    expect(unwrap(wrong, w, 'aad')).toBeNull();
  });

  it('rejects a wrap used for a different purpose (AAD) or tampered with', async () => {
    const kdf = newKdfParams();
    const kek = await deriveKek('pw-123456789012', kdf);
    const w = wrap(kek, randomBytes(32), 'vault-dek:password:v1');
    expect(unwrap(kek, w, 'vault-dek:recovery:v1')).toBeNull();
    const tampered = { ...w, ct: Buffer.from(Buffer.from(w.ct, 'base64').map((b: number, i: number) => (i === 0 ? b ^ 1 : b))).toString('base64') };
    expect(unwrap(kek, tampered, 'vault-dek:password:v1')).toBeNull();
  });

  it('uses a fresh salt per vault', () => {
    expect(newKdfParams().salt).not.toEqual(newKdfParams().salt);
  });
});

describe('lockout', () => {
  it('gives 3 free attempts, then 30s, 60s, 120s', async () => {
    const t = 1_000_000;
    expect((await recordFailure(t)).waitMs).toBe(0);
    expect((await recordFailure(t)).waitMs).toBe(0);
    expect((await recordFailure(t)).waitMs).toBe(30_000);
    expect(await remainingWaitMs(t + 10_000)).toBe(20_000);
    expect((await recordFailure(t)).waitMs).toBe(60_000);
    expect((await recordFailure(t)).waitMs).toBe(120_000);
    await recordSuccess();
    expect(await remainingWaitMs(t)).toBe(0);
  });

  it('caps the delay at 15 minutes', async () => {
    let last = 0;
    for (let i = 0; i < 20; i++) {
      last = (await recordFailure(0)).waitMs;
    }
    expect(last).toBe(15 * 60_000);
    await recordSuccess();
  });
});

describe('master password rule', () => {
  it('requires 12+ characters or 4+ words, and real strength', () => {
    expect(estimateStrength('short1!').acceptable).toBe(false);
    expect(estimateStrength('abcdefghijk').acceptable).toBe(false);
    expect(estimateStrength('purple mango river forty').acceptable).toBe(true);
    expect(estimateStrength('Tq9#vRw!pZ24kB').acceptable).toBe(true);
  });

  it('rejects sequences, repeats and common passwords even when long', () => {
    expect(estimateStrength('abcdefghijkl').acceptable).toBe(false);
    expect(estimateStrength('aaaaaaaaaaaaaaaa').acceptable).toBe(false);
    expect(estimateStrength('Password123!').acceptable).toBe(false);
    expect(estimateStrength('qwertyuiop123').acceptable).toBe(false);
  });

  it('scores a random 20-character password as very strong', () => {
    expect(estimateStrength('Xq7#tLm9vRw!pZ24kBnE').score).toBe(4);
  });
});


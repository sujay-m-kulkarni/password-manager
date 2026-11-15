/**
 * Password generator. Uses the OS CSPRNG (never Math.random) with rejection
 * sampling so every character is equally likely, guarantees at least one
 * character from each chosen set, then shuffles with Fisher–Yates.
 */
import { randomBytes } from '../security/crypto';

export type GeneratorOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out characters that are easy to misread: I l 1 O 0 o */
  avoidLookAlikes: boolean;
};

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidLookAlikes: false,
};

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
} as const;

const LOOK_ALIKES = /[Il1O0o]/g;

export function charsets(o: GeneratorOptions): string[] {
  const picked = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter(k => o[k])
    .map(k => (o.avoidLookAlikes ? SETS[k].replace(LOOK_ALIKES, '') : SETS[k]));
  return picked;
}

/** Uniform integer in [0, n) from the CSPRNG (n ≤ 256). */
function randomIndex(n: number): number {
  if (n <= 0 || n > 256) {
    throw new Error('range out of bounds');
  }
  const limit = 256 - (256 % n); // reject bytes in the biased tail
  for (;;) {
    const buf = randomBytes(16);
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] < limit) {
        return buf[i] % n;
      }
    }
  }
}

export function generatePassword(o: GeneratorOptions): string {
  const sets = charsets(o);
  if (sets.length === 0) {
    throw new Error('Choose at least one character type.');
  }
  const length = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.round(o.length)));
  const all = sets.join('');

  const chars: string[] = sets.map(set => set[randomIndex(set.length)]); // one from each set
  while (chars.length < length) {
    chars.push(all[randomIndex(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Entropy of a password produced by these options, in bits. */
export function generatedEntropyBits(o: GeneratorOptions): number {
  const pool = charsets(o).join('').length;
  return pool > 0 ? o.length * Math.log2(pool) : 0;
}

/** Character class, for colouring the generated password. */
export function charKind(c: string): 'letter' | 'digit' | 'symbol' {
  if (/[0-9]/.test(c)) {
    return 'digit';
  }
  if (/[A-Za-z]/.test(c)) {
    return 'letter';
  }
  return 'symbol';
}

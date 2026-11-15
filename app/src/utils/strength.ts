/**
 * Offline strength estimate (no breach lookups — the app has no network).
 *
 * Starts from character-pool entropy, then discounts what people actually do:
 * repeated characters, sequences (abc, 123, qwerty), common passwords with a
 * number or symbol tacked on, and passphrases of human-chosen words.
 *
 * Setup rule: 12+ characters or 4+ words, AND at least "Okay" (≈40 bits), AND not a
 * common password.
 */
export type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
  acceptable: boolean;
  /** Short hint about the biggest weakness, if any. */
  hint: string | null;
};

const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'iloveyou',
  'admin', 'welcome', 'letmein', 'monkey', 'dragon', 'football', 'cricket', 'baseball', 'sunshine',
  'princess', 'master', 'shadow', 'superman', 'batman', 'trustno', 'login', 'abc', 'india', 'bharat',
  'secret', 'changeme', 'default', 'computer', 'internet', 'whatever', 'freedom', 'starwars',
]);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '01234567890'];

const LABELS = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'] as const;

function poolSize(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) {
    n += 26;
  }
  if (/[A-Z]/.test(pw)) {
    n += 26;
  }
  if (/[0-9]/.test(pw)) {
    n += 10;
  }
  if (/[^A-Za-z0-9]/.test(pw)) {
    n += 33;
  }
  return n;
}

/** Number of characters that add little: runs of 3+ repeats or 3+ sequential keys. */
function predictableChars(pw: string): number {
  const s = pw.toLowerCase();
  const weak = new Array(s.length).fill(false);
  for (let i = 0; i + 2 < s.length; i++) {
    const tri = s.slice(i, i + 3);
    const repeat = tri[0] === tri[1] && tri[1] === tri[2];
    const sequence = ROWS.some(r => r.includes(tri) || r.split('').reverse().join('').includes(tri));
    if (repeat || sequence) {
      // keep the first char of the run, discount the rest
      weak[i + 1] = true;
      weak[i + 2] = true;
    }
  }
  return weak.filter(Boolean).length;
}

function isCommon(pw: string): boolean {
  const core = pw.toLowerCase().replace(/[^a-z]/g, '');
  return core.length > 0 && (COMMON.has(core) || COMMON.has(pw.toLowerCase()));
}

export function passphraseWords(pw: string): string[] {
  return pw
    .trim()
    .split(/[\s\-_.,]+/)
    .filter(w => /^[A-Za-z]{3,}\d*$/.test(w));
}

export function estimateStrength(pw: string): Strength {
  if (!pw) {
    return { score: 0, label: LABELS[0], bits: 0, acceptable: false, hint: null };
  }
  const pool = poolSize(pw);
  const weakCount = predictableChars(pw);
  const effectiveLen = pw.length - weakCount * 0.8;
  let bits = Math.max(0, effectiveLen) * Math.log2(pool || 1);
  let hint: string | null = null;

  const words = passphraseWords(pw);
  if (words.length >= 3) {
    // Human-chosen words: ~11 bits each (a few thousand likely words), plus a little for extras.
    const extras = /[0-9]/.test(pw) || /[A-Z]/.test(pw) ? 4 : 0;
    bits = Math.min(bits, words.length * 11 + extras);
  }
  const common = isCommon(pw);
  if (common) {
    bits = Math.min(bits, 10);
    hint = 'This is a very common password.';
  } else if (weakCount >= 3) {
    hint = 'Avoid repeated characters and sequences like abc or 123.';
  }

  const score: Strength['score'] = bits < 28 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  const longEnough = pw.length >= 12 || words.length >= 4;
  const acceptable = longEnough && bits >= 40 && !common;
  if (!hint && !longEnough) {
    hint = 'Use at least 12 characters, or 4+ words.';
  }
  return { score, label: LABELS[score], bits: Math.round(bits), acceptable, hint };
}

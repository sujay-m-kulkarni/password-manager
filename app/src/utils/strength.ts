/**
 * Simple strength estimate (a fuller meter comes with build step 5).
 * Rule enforced at setup: at least 12 characters, OR a passphrase of 4+ words.
 */
export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; acceptable: boolean };

export function estimateStrength(pw: string): Strength {
  const words = pw.trim().split(/[\s\-_.]+/).filter(w => w.length >= 3);
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  const acceptable = pw.length >= 12 || words.length >= 4;

  let score: Strength['score'] = 0;
  if (pw.length >= 8) {
    score = 1;
  }
  if (acceptable) {
    score = 2;
  }
  if (acceptable && (pw.length >= 16 || words.length >= 4) && classes >= 2) {
    score = 3;
  }
  if (acceptable && (pw.length >= 20 || words.length >= 5) && classes >= 3) {
    score = 4;
  }
  const label = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'][score];
  return { score, label, acceptable };
}

// Works out the next version for a release from the existing version tags and the merged PR's labels.
//   release: major  -> 1.4.2 becomes 2.0.0
//   release: minor  -> 1.4.2 becomes 1.5.0
//   no label        -> 1.4.2 becomes 1.4.3
// With no version tag yet, it counts on from the version in package.json.
// Used by .github/workflows/android.yml:
//   node scripts/next-version.mjs --labels "release: minor,bug" --tags "v1.4.2 v1.4.1 v0.1.0-build.41"
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAJOR_LABEL = 'release: major';
export const MINOR_LABEL = 'release: minor';

/** "major", "minor" or "patch", from a PR's label names. Major wins over minor. */
export function bumpFromLabels(labels) {
  const names = labels.map((l) => l.trim().toLowerCase());
  if (names.includes(MAJOR_LABEL)) return 'major';
  if (names.includes(MINOR_LABEL)) return 'minor';
  return 'patch';
}

/** The highest plain version among tags such as v1.4.2; build tags such as v0.1.0-build.41 are ignored. */
export function latestVersion(tags) {
  const versions = tags
    .map((t) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(t.trim()))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions[0] ?? null;
}

export function nextVersion(tags, labels, fallback) {
  const [major, minor, patch] = latestVersion(tags) ?? fallback.split('.').map(Number);
  const bump = bumpFromLabels(labels);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? (process.argv[i + 1] ?? '') : '';
  };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tags = arg('--tags').split(/[\s,]+/).filter(Boolean);
  const labels = arg('--labels').split(',').filter(Boolean);
  console.log(nextVersion(tags, labels, version));
}

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bumpFromLabels, latestVersion, nextVersion } from './next-version.mjs';

test('a label picks the part that goes up', () => {
  assert.equal(nextVersion(['v1.4.2'], ['release: major'], '0.1.0'), '2.0.0');
  assert.equal(nextVersion(['v1.4.2'], ['release: minor'], '0.1.0'), '1.5.0');
  assert.equal(nextVersion(['v1.4.2'], [], '0.1.0'), '1.4.3');
  assert.equal(nextVersion(['v1.4.2'], ['bug', 'documentation'], '0.1.0'), '1.4.3');
});

test('major wins when both labels are on', () => {
  assert.equal(bumpFromLabels(['release: minor', 'release: major']), 'major');
  assert.equal(bumpFromLabels([' Release: Minor ']), 'minor');
});

test('the highest version tag counts, build tags are ignored', () => {
  assert.deepEqual(latestVersion(['v0.1.0-build.41', 'v1.10.0', 'v1.9.3', 'v1.2.0']), [1, 10, 0]);
  assert.equal(latestVersion(['v0.1.0-build.41', 'nightly']), null);
});

test('with no version tag yet, it counts on from package.json', () => {
  assert.equal(nextVersion(['v0.1.0-build.41'], [], '0.1.0'), '0.1.1');
  assert.equal(nextVersion([], ['release: minor'], '0.1.0'), '0.2.0');
});

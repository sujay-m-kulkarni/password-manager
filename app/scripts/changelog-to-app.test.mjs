import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangelog, render } from './changelog-to-app.mjs';

test('reads versions and their points, newest first as written', () => {
  const md = '# Vault changelog\n\n## 1.7.0\n\n- Custom fields.\n- About page,\n  with history.\n\n## 1.6.0\n\n- No generator.\n';
  assert.deepEqual(parseChangelog(md), [
    { version: '1.7.0', points: ['Custom fields.', 'About page, with history.'] },
    { version: '1.6.0', points: ['No generator.'] },
  ]);
});

test('the app\'s copy matches docs/CHANGELOG.md', () => {
  const md = readFileSync(new URL('../../docs/CHANGELOG.md', import.meta.url), 'utf8');
  const have = readFileSync(new URL('../src/generated/changelog.ts', import.meta.url), 'utf8');
  assert.equal(have, render(md), 'run: node scripts/changelog-to-app.mjs');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changelogSection, releaseNotes, whatsNew } from './release-notes.mjs';

test('takes the "What\'s new" section of the PR', () => {
  const body = [
    '## Manage folders',
    '',
    "## What's new",
    '- Add, rename and delete folders.',
    '- Change an entry between Login and PIN.',
    '',
    '## Details',
    '- Implementation notes that users do not need.',
  ].join('\n');
  assert.equal(whatsNew(body), '- Add, rename and delete folders.\n- Change an entry between Login and PIN.');
});

test('falls back to the bullets of an older PR without the section', () => {
  const body = '## Fix\n\n**Builds 1.0.3**\n\n- First point.\n- Second point.';
  assert.equal(whatsNew(body), '- First point.\n- Second point.');
});

test('notes include the version, install advice and the offline check', () => {
  const notes = releaseNotes({
    version: '1.2.0',
    pr: { number: 10, title: 'Release 1.2', body: "## What's new\n- Folders." },
    build: '21',
    sha: 'abcdef1234',
  });
  assert.match(notes, /^## What's new in Vault 1\.2\.0\n\n- Folders\.\n/);
  assert.match(notes, /From pull request #10: Release 1\.2/);
  assert.match(notes, /vault-1\.2\.0\.apk/);
  assert.match(notes, /uninstalling deletes the vault/);
  assert.match(notes, /Build 21, commit abcdef1/);
});

test('works without a PR (pushed tag or manual run)', () => {
  const notes = releaseNotes({ version: '2.0.0', pr: null, build: '30', sha: '1234567' });
  assert.match(notes, /- Maintenance build\./);
  assert.doesNotMatch(notes, /pull request/);
});

test('reads a version\'s section from the changelog', () => {
  const log = '# Vault changelog\n\n## 1.1.1\n\n- Back to the list.\n\n## 1.1.0\n\n- New icon.\n- Guide.\n';
  assert.equal(changelogSection(log, '1.1.0'), '- New icon.\n- Guide.');
  assert.equal(changelogSection(log, '1.1.1'), '- Back to the list.');
  assert.equal(changelogSection(log, '9.9.9'), '');
});

test('the changelog has an entry for this package version or newer', async () => {
  const { readFileSync } = await import('node:fs');
  const log = readFileSync(new URL('../../docs/CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(log, /^## \d+\.\d+\.\d+$/m);
});

// Guards the op-sqlite patch (patches/@op-engineering+op-sqlite+*.patch).
// Bug: a closed connection's worker thread id was still compared after the thread had been
// joined; Android reuses thread ids, so freeing the connection later from another thread
// aborted the app ("WorkerThread::shutdown() called from its own thread"). Vault 1.3.x crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const app = new URL('..', import.meta.url).pathname;
const cpp = join(app, 'node_modules/@op-engineering/op-sqlite/cpp');

test('the patch matches the installed op-sqlite version', () => {
  const installed = JSON.parse(readFileSync(join(app, 'node_modules/@op-engineering/op-sqlite/package.json'), 'utf8')).version;
  const patches = readdirSync(join(app, 'patches')).filter(f => f.startsWith('@op-engineering+op-sqlite+'));
  assert.deepEqual(patches, [`@op-engineering+op-sqlite+${installed}.patch`], 'update the patch when op-sqlite changes');
});

test('the installed op-sqlite has the fix applied', () => {
  const src = readFileSync(join(cpp, 'OPWorkerThread.cpp'), 'utf8');
  assert.match(src, /stopped\.load\(/);
  assert.match(src, /stopped\.store\(true/);
});

test('closing and later freeing many connections does not abort', t => {
  if (spawnSync('g++', ['--version']).status !== 0) {
    t.skip('g++ not available');
    return;
  }
  const out = join(mkdtempSync(join(tmpdir(), 'opsqlite-')), 'stress');
  execFileSync('g++', ['-std=c++17', '-O1', '-pthread', `-I${cpp}`, join(app, 'scripts/fixtures/opsqlite-worker-stress.cpp'), join(cpp, 'OPWorkerThread.cpp'), '-o', out]);
  const r = spawnSync(out, { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '0');
});

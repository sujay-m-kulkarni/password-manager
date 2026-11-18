// Writes src/generated/changelog.ts from docs/CHANGELOG.md, for Settings › About & what's new.
//   node scripts/changelog-to-app.mjs          → write the file
//   node scripts/changelog-to-app.mjs --check  → exit 1 if the file is out of date (run by test:scripts)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const md = readFileSync(new URL('../docs/CHANGELOG.md', root), 'utf8');
const target = new URL('src/generated/changelog.ts', root);

export function parseChangelog(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (h) {
      cur = { version: h[1], points: [] };
      out.push(cur);
    } else if (cur && /^- /.test(line)) {
      cur.points.push(line.slice(2).trim());
    } else if (cur && /^ {2,}\S/.test(line) && cur.points.length) {
      cur.points[cur.points.length - 1] += ' ' + line.trim();
    }
  }
  return out;
}

export function render(text) {
  const data = parseChangelog(text);
  return `// Generated from docs/CHANGELOG.md by scripts/changelog-to-app.mjs — do not edit by hand.
export type Release = { version: string; points: string[] };

export const CHANGELOG: Release[] = ${JSON.stringify(data, null, 2)};
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const want = render(md);
  if (process.argv.includes('--check')) {
    let have = '';
    try {
      have = readFileSync(target, 'utf8');
    } catch {}
    if (have !== want) {
      console.error('src/generated/changelog.ts is out of date: run node scripts/changelog-to-app.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(target, want);
  }
}

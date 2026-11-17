// Writes the GitHub release notes for a build: what's new, then how to install.
//
// "What's new" comes from the merged pull request: its "## What's new" section (see
// .github/pull_request_template.md), or, for older PRs without one, its bullet points.
//
//   node scripts/release-notes.mjs --version 1.2.0 --pr pr.json --build 21 --sha abc1234 > notes.md
//   node scripts/release-notes.mjs --version 1.0.4 --changelog ../docs/CHANGELOG.md --build 14 --sha e1fc67a
//     (backfill: takes What's new from the changelog; exits 3 if the version has no entry)
//
// pr.json is the pull request as returned by GitHub's REST API (title, body, number, html_url);
// it may be missing for a pushed tag or a manual run.
import { readFileSync } from 'node:fs';

/** The "## What's new" section of a PR description, or its first bullets, as markdown lines. */
export function whatsNew(body) {
  const text = (body ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^#{1,3}\s*what'?s new\b/i.test(l.trim()));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(l => /^#{1,3}\s/.test(l.trim()));
    const section = (end >= 0 ? rest.slice(0, end) : rest).join('\n').trim();
    if (section) {
      return section;
    }
  }
  const bullets = lines.filter(l => /^\s*[-*]\s+\S/.test(l)).slice(0, 8);
  return bullets.join('\n').trim();
}

/** The bullets under "## X.Y.Z" in docs/CHANGELOG.md, or '' if that version has no section. */
export function changelogSection(text, version) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(l => l.trim() === `## ${version}`);
  if (start < 0) {
    return '';
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^##\s/.test(l));
  return (end >= 0 ? rest.slice(0, end) : rest).join('\n').trim();
}

export function releaseNotes({ version, pr, build, sha }) {
  const out = [`## What's new in Vault ${version}`, ''];
  const news = pr ? whatsNew(pr.body) : '';
  if (news) {
    out.push(news);
  } else if (pr?.title) {
    out.push(`- ${pr.title}`);
  } else {
    out.push('- Maintenance build.');
  }
  out.push('');
  if (pr?.number) {
    out.push(`From pull request #${pr.number}: ${pr.title}`, '');
  }
  out.push(
    '## Install',
    '',
    `Download **vault-${version}.apk** below on your phone and open it. Install it **over** the existing app: do not uninstall first, because uninstalling deletes the vault.`,
    '',
    `Offline build: no network permissions (checked by the pipeline). Build ${build}, commit ${String(sha).slice(0, 7)}.`,
  );
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = name => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  let pr = null;
  const changelog = arg('changelog');
  const prFile = arg('pr');
  if (prFile) {
    try {
      const parsed = JSON.parse(readFileSync(prFile, 'utf8'));
      pr = Array.isArray(parsed) ? parsed[0] ?? null : parsed;
    } catch {
      pr = null;
    }
  }
  if (changelog) {
    // Backfill mode: "What's new" from docs/CHANGELOG.md instead of the PR.
    const section = changelogSection(readFileSync(changelog, 'utf8'), arg('version'));
    if (!section) {
      process.exit(3); // no entry for this version: leave its notes alone
    }
    pr = { title: '', body: "## What's new\n" + section };
  }
  process.stdout.write(releaseNotes({ version: arg('version'), pr, build: arg('build') ?? '?', sha: arg('sha') ?? '' }));
}

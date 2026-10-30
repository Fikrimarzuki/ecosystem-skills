import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_CATEGORIES } from '../src/schema.ts';
import { formatJson } from '../src/fsguard.ts';
import { scanTree } from '../src/tree.ts';
import { makeRepo, SHA, write } from './fixtures.ts';

/* A disposable repository with curated releases of the approved fixture skill "ext" (ES18/ES21 tests). */
export const review = (hash: string) => ({
  outcome: 'no-blocking-issues',
  reviewer: 'r',
  reviewedAt: '2026-10-31',
  scope: 'all files',
  contentHash: hash,
  checks: REVIEW_CATEGORIES.flatMap((category) =>
    (['instructions', 'supporting-files'] as const).map((scope) => ({
      category,
      scope,
      result: 'no-issue-found',
    })),
  ),
  evidence: [{ method: 'manual-read', summary: 'read' }],
});

export function curatedRepo(
  versions: { version: string; body: string; approved?: boolean; script?: boolean }[] = [
    { version: '1.0.0', body: 'one' },
    { version: '1.1.0', body: 'two' },
    { version: '2.0.0', body: 'three', approved: false },
  ],
) {
  const r = makeRepo();
  const releases = versions.map(({ version, body, approved = true, script = false }) => {
    const dir = join(r.root, 'library/ext', version);
    write(join(dir, 'SKILL.md'), `---\nname: ext\n---\n${body}\n`);
    write(join(dir, 'LICENSE'), 'MIT License\n');
    write(join(dir, 'ATTRIBUTION.md'), '# Attribution\n');
    if (script) {
      // would leave a marker if anything ever executed it
      write(join(dir, 'scripts/run.sh'), `#!/bin/sh\ntouch "${join(r.root, 'EXECUTED')}"\n`);
      chmodSync(join(dir, 'scripts/run.sh'), 0o755);
    }
    const hash = scanTree(dir).hash;
    return {
      skill: 'ext',
      version,
      createdAt: '2026-10-30',
      path: `library/ext/${version}`,
      upstream: {
        url: 'https://github.com/o/ext',
        path: 'skills/ext',
        revision: SHA,
        contentHash: hash,
      },
      curatedHash: hash,
      license: 'MIT',
      attribution: 'o, MIT',
      review: approved ? review(hash) : { outcome: 'not-evaluated' },
      approval: approved
        ? { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' }
        : { status: 'unapproved' },
      supportedAgents: ['claude-code', 'codex'],
    };
  });
  write(join(r.root, 'registry/releases.json'), formatJson(releases));
  return { ...r, releases };
}

export const readText = (p: string) => readFileSync(p, 'utf8');
export const setRelease = (root: string, version: string, patch: Record<string, unknown>) => {
  const p = join(root, 'registry/releases.json');
  const all = JSON.parse(readText(p)) as Record<string, unknown>[];
  writeFileSync(p, formatJson(all.map((x) => (x.version === version ? { ...x, ...patch } : x))));
};

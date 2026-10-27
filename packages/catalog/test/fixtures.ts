import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatJson } from '../src/fsguard.ts';
import { scanTree } from '../src/tree.ts';

/* Shared by consumers.test.ts and cli.test.ts. */
export const SHA = 'a'.repeat(40);
export const tmp = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));
export const write = (p: string, body: string) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, body);
};

/** A disposable Ecosystem Skills repo: one first-party skill, one installed approved external skill,
 * one approved-but-not-installed external skill, one reviewed (unapproved) external skill. */
export function makeRepo() {
  const root = tmp('es-repo-');
  write(join(root, 'skills/shared/fp/SKILL.md'), '---\nname: fp\n---\nfirst party\n');
  write(join(root, 'external/skills/ext/SKILL.md'), '---\nname: ext\n---\nexternal\n');
  write(join(root, 'external/skills/other/SKILL.md'), '---\nname: other\n---\nother\n');
  const extHash = scanTree(join(root, 'external/skills/ext')).hash;
  const otherHash = scanTree(join(root, 'external/skills/other')).hash;
  write(
    join(root, 'external/installed.json'),
    JSON.stringify({
      ext: { revision: SHA, contentHash: extHash, installedAt: 'x' },
      other: { revision: SHA, contentHash: otherHash, installedAt: 'x' },
    }),
  );
  const external = (id: string, status: string, contentHash: string) => ({
    id,
    name: id,
    description: 'd',
    category: 'general',
    origin: 'external',
    source: {
      type: 'external',
      upstream: { url: `https://github.com/o/${id}` },
      path: `skills/${id}`,
      revision: SHA,
    },
    author: 'o',
    license: 'MIT',
    review: {
      status,
      reviewedAt: '2026-10-27',
      reviewer: 'r',
      ...(status === 'approved' ? { approvedBy: 'owner' } : {}),
      revision: SHA,
      contentHash,
    },
  });
  const skills = [
    {
      id: 'fp',
      name: 'fp',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/shared/fp' },
    },
    external('ext', 'approved', extHash),
    external('other', 'approved', otherHash),
    external('pending', 'reviewed', `sha256-${'b'.repeat(64)}`),
    external('absent', 'approved', `sha256-${'c'.repeat(64)}`),
  ];
  const consumers = [
    { id: 'proj', name: 'Project', kind: 'project', agents: ['claude-code', 'codex'] },
    { id: 'bare', name: 'No agents', kind: 'project' },
    { id: 'glob', name: 'Global', kind: 'global', agents: ['codex'] },
  ];
  write(join(root, 'registry/skills.json'), formatJson(skills));
  write(join(root, 'registry/consumers.json'), formatJson(consumers));
  write(join(root, 'registry/integrations.json'), '[]\n');
  write(join(root, 'registry/evidence.json'), '[]\n');
  const project = tmp('es-proj-');
  mkdirSync(join(project, '.git'));
  return { root, project };
}

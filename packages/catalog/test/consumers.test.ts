import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignSkill,
  findConsumer,
  loadRegistry,
  resolveConsumerLocation,
  unassignSkill,
} from '../src/consumers.ts';
import {
  ConsumerError,
  describeIdentity,
  formatJson,
  identifyProject,
  isInside,
} from '../src/fsguard.ts';
import { applySync, planSync, verifyConsumer } from '../src/sync.ts';
import { scanTree } from '../src/tree.ts';
import { makeRepo, tmp } from './fixtures.ts';

const consumersFile = (root: string) => readFileSync(join(root, 'registry/consumers.json'), 'utf8');
const plan = (root: string, project: string, opts = {}) => {
  const reg = loadRegistry(root);
  return planSync(root, reg.catalog, findConsumer(reg, 'proj'), project, opts);
};
const sync = (root: string, project: string, opts = {}) => applySync(plan(root, project, opts));
const states = (p: ReturnType<typeof plan>) =>
  p.items.map((i) => `${i.agent}:${i.name}:${i.state}:${i.action}`);
const listing = (p: string): string[] =>
  existsSync(p) ? readdirSync(p, { recursive: true }).map(String).sort() : [];

describe('assign', () => {
  it('adds desired state only: unverified, symlink, consumer agents; other files untouched', () => {
    const { root } = makeRepo();
    const skillsBefore = readFileSync(join(root, 'registry/skills.json'), 'utf8');
    const r = assignSkill(root, 'proj', 'fp');
    expect(r.status).toBe('added');
    const proj = JSON.parse(consumersFile(root)).find((c: { id: string }) => c.id === 'proj');
    expect(proj.assignments).toEqual([
      {
        skill: 'fp',
        agents: ['claude-code', 'codex'],
        install: 'symlink',
        verification: { status: 'unverified' },
      },
    ]);
    expect(readFileSync(join(root, 'registry/skills.json'), 'utf8')).toBe(skillsBefore);
    expect(
      loadRegistry(root).catalog.consumers.find((c) => c.id === 'proj')!.assignments,
    ).toHaveLength(1);
  });

  it('allows an approved external skill without installing or activating it', () => {
    const { root, project } = makeRepo();
    expect(assignSkill(root, 'proj', 'absent').status).toBe('added');
    expect(existsSync(join(root, 'external/skills/absent'))).toBe(false);
    expect(listing(project)).toEqual(['.git']);
  });

  it('treats an identical duplicate as a no-op and a different one as an error', () => {
    const { root } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    const before = consumersFile(root);
    expect(assignSkill(root, 'proj', 'fp').status).toBe('unchanged');
    expect(consumersFile(root)).toBe(before);
    expect(() => assignSkill(root, 'proj', 'fp', { install: 'copy' })).toThrow(/already assigned/);
  });

  it('rejects unknown consumers and skills, unapproved externals, globals and unsupported agents', () => {
    const { root } = makeRepo();
    const before = consumersFile(root);
    expect(() => assignSkill(root, 'nope', 'fp')).toThrow(/unknown consumer/);
    // The message says an id is expected (not a folder) and lists the valid ids.
    expect(() => assignSkill(root, '../app', 'fp')).toThrow(
      /not a folder.*Known consumers: .*proj/,
    );
    expect(() => assignSkill(root, 'proj', 'nope')).toThrow(/unknown skill/);
    expect(() => assignSkill(root, 'proj', 'pending')).toThrow(/only approved external skills/);
    expect(() => assignSkill(root, 'glob', 'fp')).toThrow(/global/);
    expect(() => assignSkill(root, 'proj', 'fp', { agents: ['cursor'] })).toThrow(
      /unsupported agent/,
    );
    expect(() => assignSkill(root, 'bare', 'fp')).toThrow(/--agents/);
    expect(consumersFile(root)).toBe(before);
  });

  it('dry run validates and reports but writes nothing', () => {
    const { root } = makeRepo();
    const before = consumersFile(root);
    expect(assignSkill(root, 'proj', 'fp', { dryRun: true }).status).toBe('added');
    expect(consumersFile(root)).toBe(before);
  });

  it('preserves existing assignments and other consumers', () => {
    const { root } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    assignSkill(root, 'proj', 'ext');
    assignSkill(root, 'bare', 'fp', { agents: ['codex'] });
    const all = JSON.parse(consumersFile(root));
    expect(
      all
        .find((c: { id: string }) => c.id === 'proj')
        .assignments.map((a: { skill: string }) => a.skill),
    ).toEqual(['fp', 'ext']);
    expect(all.find((c: { id: string }) => c.id === 'glob')).toEqual({
      id: 'glob',
      name: 'Global',
      kind: 'global',
      agents: ['codex'],
    });
  });

  it('a failed write leaves the registry byte-identical and no temp files behind', () => {
    const { root } = makeRepo();
    const before = consumersFile(root);
    expect(() =>
      assignSkill(root, 'proj', 'fp', {
        write: {
          beforeRename: () => {
            throw new Error('disk full');
          },
        },
      }),
    ).toThrow(/disk full/);
    expect(consumersFile(root)).toBe(before);
    expect(readdirSync(join(root, 'registry')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses to overwrite a registry file that changed during the command', () => {
    const { root } = makeRepo();
    const concurrent = consumersFile(root).replace('"Project"', '"Edited elsewhere"');
    expect(() =>
      assignSkill(root, 'proj', 'fp', {
        write: {
          beforeRename: () => writeFileSync(join(root, 'registry/consumers.json'), concurrent),
        },
      }),
    ).toThrow(/changed while this command was running/);
    expect(consumersFile(root)).toBe(concurrent);
  });
});

describe('unassign', () => {
  it('removes one assignment, keeps the rest, and supports dry run', () => {
    const { root } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    assignSkill(root, 'proj', 'ext');
    const before = consumersFile(root);
    unassignSkill(root, 'proj', 'fp', { dryRun: true });
    expect(consumersFile(root)).toBe(before);
    expect(unassignSkill(root, 'proj', 'fp').status).toBe('removed');
    const proj = loadRegistry(root).catalog.consumers.find((c) => c.id === 'proj')!;
    expect(proj.assignments.map((a) => a.skill)).toEqual(['ext']);
    unassignSkill(root, 'proj', 'ext');
    expect(
      JSON.parse(consumersFile(root)).find((c: { id: string }) => c.id === 'proj'),
    ).not.toHaveProperty('assignments');
  });

  it('requires an existing assignment', () => {
    const { root } = makeRepo();
    expect(() => unassignSkill(root, 'proj', 'fp')).toThrow(/not assigned/);
  });

  it('never deletes links; they become stale drift until an explicit prune', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    sync(root, project);
    unassignSkill(root, 'proj', 'fp');
    expect(existsSync(join(project, '.claude/skills/fp'))).toBe(true);
    expect(states(plan(root, project))).toEqual([
      'claude-code:fp:stale:none',
      'codex:fp:stale:none',
    ]);
    sync(root, project, { prune: true });
    expect(existsSync(join(project, '.claude/skills/fp'))).toBe(false);
    expect(existsSync(join(root, 'skills/shared/fp/SKILL.md'))).toBe(true); // canonical content untouched
  });
});

describe('sync', () => {
  it('dry run (planning) has no side effects; apply creates relative links; repeat is a no-op', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    assignSkill(root, 'proj', 'ext');
    const p = plan(root, project);
    expect(listing(project)).toEqual(['.git']);
    expect(p.dirs.length).toBe(4);
    expect(p.items.every((i) => i.action === 'create-link')).toBe(true);
    applySync(p);
    for (const d of ['.claude/skills', '.agents/skills']) {
      expect(readlinkSync(join(project, d, 'fp')).startsWith('/')).toBe(false);
      expect(realpathSync(join(project, d, 'fp'))).toBe(join(root, 'skills/shared/fp'));
      expect(realpathSync(join(project, d, 'ext'))).toBe(join(root, 'external/skills/ext'));
    }
    const again = plan(root, project);
    expect(again.items.every((i) => i.state === 'ok' && i.action === 'none')).toBe(true);
    expect(applySync(again).applied).toEqual([]);
  });

  it('repairs owned broken and wrong-target links', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'ext');
    sync(root, project);
    rmSync(join(project, '.claude/skills/ext'));
    symlinkSync(join(root, 'external/skills/gone'), join(project, '.claude/skills/ext')); // owned, broken
    rmSync(join(project, '.agents/skills/ext'));
    symlinkSync(join(root, 'external/skills/other'), join(project, '.agents/skills/ext')); // owned, wrong target
    expect(states(plan(root, project))).toEqual([
      'claude-code:ext:broken:repair-link',
      'codex:ext:wrong-target:repair-link',
    ]);
    sync(root, project);
    expect(realpathSync(join(project, '.claude/skills/ext'))).toBe(
      join(root, 'external/skills/ext'),
    );
    expect(realpathSync(join(project, '.agents/skills/ext'))).toBe(
      join(root, 'external/skills/ext'),
    );
  });

  it('stops on anything it does not own and changes nothing', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    const foreign = tmp('es-foreign-');
    mkdirSync(join(project, '.claude/skills'), { recursive: true });
    symlinkSync(foreign, join(project, '.claude/skills/fp')); // not owned
    mkdirSync(join(project, '.agents/skills'), { recursive: true });
    writeFileSync(join(project, '.agents/skills/fp'), 'my notes'); // unmanaged file
    const before = listing(project);
    const p = plan(root, project);
    expect(p.blockers.map((b) => b.state)).toEqual(['conflict', 'conflict']);
    expect(() => applySync(p)).toThrow(/nothing was changed/);
    expect(listing(project)).toEqual(before);
    expect(readFileSync(join(project, '.agents/skills/fp'), 'utf8')).toBe('my notes');
  });

  it('treats an unmanaged directory as a conflict and leaves unrelated entries alone', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    mkdirSync(join(project, '.claude/skills/fp'), { recursive: true });
    mkdirSync(join(project, '.claude/skills/my-own-skill'), { recursive: true });
    const p = plan(root, project, { prune: true });
    expect(states(p)).toContain('claude-code:fp:conflict:none');
    expect(states(p)).toContain('claude-code:my-own-skill:unmanaged:none');
  });

  it('copy mode copies verified content, is idempotent, and never overwrites a modified copy', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'ext', { install: 'copy', agents: ['codex'] });
    sync(root, project);
    const copy = join(project, '.agents/skills/ext');
    expect(scanTree(copy).hash).toBe(scanTree(join(root, 'external/skills/ext')).hash);
    expect(readdirSync(join(project, '.agents/skills'))).toEqual(['ext']); // no temp leftovers
    expect(states(plan(root, project))).toEqual(['codex:ext:ok:none']);
    writeFileSync(join(copy, 'SKILL.md'), 'locally edited');
    const p = plan(root, project);
    expect(states(p)).toEqual(['codex:ext:copy-modified:none']);
    expect(() => applySync(p)).toThrow(/conflict/);
    expect(readFileSync(join(copy, 'SKILL.md'), 'utf8')).toBe('locally edited');
  });

  it('rolls back completed steps after a partial failure', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    assignSkill(root, 'proj', 'ext');
    const p = plan(root, project);
    expect(() => applySync(p, { failAfter: 6 })).toThrow(
      /all 6 completed step\(s\) were rolled back/,
    );
    expect(listing(project)).toEqual(['.git']);
  });

  it('reports a raw filesystem error as a sync failure, with what was rolled back', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'ext');
    mkdirSync(join(project, '.claude/skills'), { recursive: true });
    const p = plan(root, project);
    chmodSync(join(project, '.claude/skills'), 0o555); // the link cannot be created: EACCES
    try {
      let err: unknown;
      try {
        applySync(p);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ConsumerError); // shown as "ERROR: ..." by the CLI, not a stack trace
      expect((err as Error).message).toMatch(
        /^sync failed: .*EACCES.*; (all \d+ completed step\(s\) were rolled back|nothing had been changed)$/,
      );
      expect(existsSync(join(project, '.agents'))).toBe(false); // directories created before the failure are gone
    } finally {
      chmodSync(join(project, '.claude/skills'), 0o755);
    }
  });

  it('never claims a rollback that did not happen: lists the steps it could not undo', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'ext');
    const p = plan(root, project);
    const skillsDir = join(project, '.claude/skills');
    try {
      expect(() =>
        applySync(p, {
          failAfter: 5, // 4 directories and the first link exist
          beforeRollback: () => chmodSync(skillsDir, 0o555), // ...and that link can no longer be removed
        }),
      ).toThrow(
        /ROLLBACK INCOMPLETE: .* could not undo: .*\.claude\/skills\/ext.*Run skills:verify/,
      );
    } finally {
      chmodSync(skillsDir, 0o755);
    }
    expect(readdirSync(skillsDir)).toEqual(['ext']); // the message matches what is on disk
    expect(existsSync(join(project, '.agents'))).toBe(false); // everything else was undone
  });

  it('refuses to write through symlinked agent directories (symlink escape)', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    const outside = tmp('es-outside-');
    symlinkSync(outside, join(project, '.claude'));
    expect(() => plan(root, project)).toThrow(/is a symlink/);
    rmSync(join(project, '.claude'));
    mkdirSync(join(project, '.agents'));
    symlinkSync(outside, join(project, '.agents/skills'));
    expect(() => plan(root, project)).toThrow(/is a symlink/);
    expect(listing(outside)).toEqual([]);
  });

  it('blocks activation of an external skill that is not installed or fails integrity', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'absent');
    const p = plan(root, project);
    expect(p.blockers.map((b) => b.detail)).toEqual(
      expect.arrayContaining([expect.stringMatching(/not installed/)]),
    );
    assignSkill(root, 'proj', 'ext');
    writeFileSync(join(root, 'external/skills/ext/SKILL.md'), 'tampered');
    expect(
      plan(root, project).blockers.some((b) => b.name === 'ext' && /hash/.test(b.detail)),
    ).toBe(true);
  });

  it('refuses global consumers', () => {
    const { root, project } = makeRepo();
    const reg = loadRegistry(root);
    expect(() => planSync(root, reg.catalog, findConsumer(reg, 'glob'), project)).toThrow(
      ConsumerError,
    );
  });
});

describe('verify', () => {
  const run = (root: string, project: string) => {
    const reg = loadRegistry(root);
    return verifyConsumer(root, reg.catalog, findConsumer(reg, 'proj'), project);
  };
  const errorsOf = (c: ReturnType<typeof run>) =>
    c.filter((x) => x.level === 'error').map((x) => `${x.subject} ${x.message}`);

  it('passes for a correct consumer and never infers verification from links', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    assignSkill(root, 'proj', 'ext');
    sync(root, project);
    const checks = run(root, project);
    expect(errorsOf(checks)).toEqual([]);
    expect(checks.find((c) => c.subject === 'fp' && c.level === 'ok')?.message).toMatch(
      /first-party source present/,
    );
    expect(checks.find((c) => c.subject === 'ext' && c.level === 'ok')?.message).toMatch(
      /content hash matches/,
    );
    expect(
      checks
        .filter((c) => c.level === 'info')
        .every((c) => /recorded verification: unverified .*not inferred/.test(c.message)),
    ).toBe(true);
  });

  it('reports missing installation, hash mismatch, wrong targets, broken links and unexpected activation', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'ext');
    assignSkill(root, 'proj', 'fp');
    sync(root, project);
    writeFileSync(join(root, 'external/skills/ext/SKILL.md'), 'tampered');
    expect(errorsOf(run(root, project)).join('\n')).toMatch(/content hash does not match/);
    rmSync(join(root, 'external/skills/ext'), { recursive: true });
    expect(errorsOf(run(root, project)).join('\n')).toMatch(/not installed/);

    const fresh = makeRepo();
    assignSkill(fresh.root, 'proj', 'fp');
    sync(fresh.root, fresh.project);
    rmSync(join(fresh.project, '.claude/skills/fp'));
    symlinkSync(
      join(fresh.root, 'external/skills/other'),
      join(fresh.project, '.claude/skills/fp'),
    );
    rmSync(join(fresh.project, '.agents/skills/fp'));
    symlinkSync(
      join(fresh.root, 'skills/shared/missing'),
      join(fresh.project, '.agents/skills/fp'),
    );
    symlinkSync(
      join(fresh.root, 'external/skills/other'),
      join(fresh.project, '.agents/skills/other'),
    );
    const c = run(fresh.root, fresh.project);
    expect(errorsOf(c).join('\n')).toMatch(/wrong-target/);
    expect(errorsOf(c).join('\n')).toMatch(/broken/);
    expect(
      c.some((x) => x.level === 'warn' && /stale/.test(x.message) && x.subject.includes('other')),
    ).toBe(true);
  });

  it('reports not-yet-activated assignments as errors without changing anything', () => {
    const { root, project } = makeRepo();
    assignSkill(root, 'proj', 'fp');
    expect(errorsOf(run(root, project)).join('\n')).toMatch(/not activated/);
    expect(listing(project)).toEqual(['.git']);
  });
});

describe('safety helpers', () => {
  it('identifies the repository and branch a consumer path belongs to (no git process)', () => {
    const repo = tmp('es-id-');
    mkdirSync(join(repo, '.git'));
    writeFileSync(join(repo, '.git/HEAD'), 'ref: refs/heads/master\n');
    expect(identifyProject(repo)).toEqual({ git: 'repository-root', branch: 'master' });
    expect(describeIdentity(identifyProject(repo))).toBe('branch master (repository root)');
    mkdirSync(join(repo, 'sub'));
    const inside = identifyProject(join(repo, 'sub'));
    expect(inside).toMatchObject({ git: 'inside-repository', repoRoot: repo, branch: 'master' });
    expect(describeIdentity(inside)).toMatch(/WARNING: not the repository root/);
    writeFileSync(join(repo, '.git/HEAD'), `${'d'.repeat(40)}\n`);
    expect(identifyProject(repo)).toEqual({ git: 'repository-root', detached: 'dddddddddddd' });
    const wt = tmp('es-wt-');
    writeFileSync(join(wt, '.git'), `gitdir: ${join(repo, '.git')}\n`); // worktree-style .git file
    expect(identifyProject(wt).git).toBe('repository-root');
    expect(describeIdentity(identifyProject(tmp('es-nogit-')))).toBe(
      'WARNING: not a git repository',
    );
  });

  it('containment is not a string-prefix check', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
  });

  it('consumer locations come from --project or the local file, never the home directory or root', () => {
    const { root, project } = makeRepo();
    expect(resolveConsumerLocation(root, 'proj')).toBeUndefined();
    writeFileSync(join(root, 'consumers.local.json'), JSON.stringify({ proj: project }));
    expect(resolveConsumerLocation(root, 'proj')?.path).toBe(project);
    expect(resolveConsumerLocation(root, 'proj', project)?.source).toBe('argument');
    expect(() => resolveConsumerLocation(root, 'proj', homedir())).toThrow(/refusing/);
    expect(() => resolveConsumerLocation(root, 'proj', '/')).toThrow(/refusing/);
    writeFileSync(join(root, 'consumers.local.json'), '{oops');
    expect(() => resolveConsumerLocation(root, 'proj')).toThrow(/not valid JSON/);
  });

  it('an explicit --project must agree with consumers.local.json (no silent retargeting)', () => {
    const { root, project } = makeRepo();
    const other = tmp('es-other-');
    // No local entry: --project is the only source and is accepted.
    expect(resolveConsumerLocation(root, 'proj', other)?.path).toBe(other);
    writeFileSync(join(root, 'consumers.local.json'), JSON.stringify({ proj: project }));
    // Same folder as configured: accepted.
    expect(resolveConsumerLocation(root, 'proj', project)?.path).toBe(project);
    // A different folder than the one configured for this consumer: refused, naming both.
    expect(() => resolveConsumerLocation(root, 'proj', other)).toThrow(
      new RegExp(
        `--project ${other} does not match the location configured for "proj".*\\(${project}\\)`,
      ),
    );
    // Another consumer's configured folder: refused (this is what would let --prune remove its links).
    expect(() => resolveConsumerLocation(root, 'bare', project)).toThrow(
      /is the folder configured for consumer "proj".*not for "bare"/,
    );
    // Any other folder for a consumer without an entry is still fine.
    expect(resolveConsumerLocation(root, 'bare', other)?.path).toBe(other);
  });

  it('formats JSON exactly like the committed (Prettier-formatted) registry files', () => {
    const reg = resolve(__dirname, '../../../registry');
    // consumers.json is the file the CLI writes: it must round-trip byte for byte.
    const consumers = readFileSync(join(reg, 'consumers.json'), 'utf8');
    expect(formatJson(JSON.parse(consumers))).toBe(consumers);
    // Other files must match structurally; Prettier preserves a string's original escaping (e.g. \u2014).
    const unescape = (t: string) =>
      t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    for (const f of ['skills.json', 'evidence.json', 'integrations.json']) {
      const text = readFileSync(join(reg, f), 'utf8');
      expect(formatJson(JSON.parse(text)), f).toBe(unescape(text));
    }
  });
});

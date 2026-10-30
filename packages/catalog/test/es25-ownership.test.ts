import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, UsageError } from '../src/cliargs.ts';
import { assignSkill, assignmentPolicy, loadRegistry } from '../src/consumers.ts';
import { applyCurated, consumerInventory, planCurated, type PlanOptions } from '../src/curated.ts';
import { explainEligibility } from '../src/ecosystem.ts';
import { formatJson } from '../src/fsguard.ts';
import { installBlocker } from '../src/install.ts';
import { decide, distributionOf, ownershipOf } from '../src/policy.ts';
import {
  checkPrivateRoot,
  loadWorkspace,
  PRIVATE_ENV,
  PRIVATE_MARKER,
  readPrivate,
} from '../src/private.ts';
import type { Skill } from '../src/schema.ts';
import { planSync, resolveCanonical } from '../src/sync.ts';
import { scanTree } from '../src/tree.ts';
import { buildCatalog, catalogToJson } from '../src/validate.ts';
import { review } from './curatedfix.ts';
import { makeRepo, privatize, tmp, write } from './fixtures.ts';

/*
 * ES25 ownership, distribution and owner-only managed installation. Every repository, private root and project here
 * is a disposable fixture; nothing touches a real consumer. Authorization data carries MARKER so leaks are searchable.
 */
const MARKER = 'AUTH-MARKER-5e81d0';

const fmSkill = (over: Record<string, unknown> = {}) => ({
  id: 'fm-tool',
  name: 'FM Tool',
  description: 'An FM Ecosystem skill',
  category: 'general',
  origin: 'first-party',
  source: { type: 'first-party', path: 'skills/shared/fm-tool' },
  ownership: 'fm-ecosystem',
  distribution: { policy: 'restricted', access: 'owner-only' },
  ...over,
});

/** A public repository with a restricted FM Ecosystem skill and public curated releases of it. */
function fmRepo(
  opts: {
    versions?: { version: string; approved: boolean }[];
    ownership?: boolean;
    skill?: Record<string, unknown>;
  } = {},
) {
  const r = makeRepo();
  write(join(r.root, 'skills/shared/fm-tool/SKILL.md'), '---\nname: fm-tool\n---\nfm\n');
  write(join(r.root, 'skills/shared/doc-only/SKILL.md'), '---\nname: doc-only\n---\ndocs\n');
  write(join(r.root, 'skills/shared/ecosystem-lookalike/SKILL.md'), '---\nname: x\n---\nx\n');
  const versions = opts.versions ?? [
    { version: '1.0.0', approved: true },
    { version: '1.1.0', approved: true },
    { version: '2.0.0', approved: false },
  ];
  const releases = versions.map(({ version, approved }) => {
    const d = join(r.root, 'library/fm-tool', version);
    write(join(d, 'SKILL.md'), `---\nname: fm-tool\n---\nfm ${version}\n`);
    write(join(d, 'LICENSE'), 'Proprietary\n');
    const hash = scanTree(d).hash;
    return {
      skill: 'fm-tool',
      version,
      createdAt: '2026-10-30',
      path: `library/fm-tool/${version}`,
      curatedHash: hash,
      license: 'Proprietary',
      attribution: 'Owner',
      review: approved ? review(hash) : { outcome: 'not-evaluated' },
      approval: approved
        ? { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' }
        : { status: 'unapproved' },
      supportedAgents: ['claude-code'],
    };
  });
  const skills = JSON.parse(readFileSync(join(r.root, 'registry/skills.json'), 'utf8'));
  skills.push(
    fmSkill(opts.skill),
    {
      id: 'doc-only',
      name: 'Doc only',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/shared/doc-only' },
      ownership: 'fm-ecosystem',
      distribution: { policy: 'not-distributable' },
    },
    {
      // named like an ecosystem skill, but nothing is declared: it is neither FM Ecosystem nor restricted
      id: 'ecosystem-lookalike',
      name: 'Ecosystem lookalike',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/shared/ecosystem-lookalike' },
    },
  );
  write(join(r.root, 'registry/skills.json'), formatJson(skills));
  write(join(r.root, 'registry/releases.json'), formatJson(releases));
  const consumers = JSON.parse(readFileSync(join(r.root, 'registry/consumers.json'), 'utf8'));
  if (opts.ownership !== false) consumers[0].ownership = 'fm-ecosystem'; // proj: owner-controlled
  consumers.push({
    id: 'theirs',
    name: 'Someone else',
    kind: 'project',
    agents: ['claude-code'],
    ownership: 'third-party',
  });
  write(join(r.root, 'registry/consumers.json'), formatJson(consumers));
  return r;
}

const grant = (over: Record<string, unknown> = {}) => ({
  consumer: 'proj',
  skill: 'fm-tool',
  agents: ['claude-code'],
  releases: ['1.0.0', '1.1.0'],
  authorizedBy: `Owner ${MARKER}`,
  authorizedAt: '2026-10-31',
  note: `private note ${MARKER}`,
  ...over,
});

/** The owner's private authorization source, outside the public repository. */
function authRoot(access: unknown[] = [grant()]) {
  const dir = tmp('es25-auth-');
  chmodSync(dir, 0o700);
  write(join(dir, PRIVATE_MARKER), '{ "schemaVersion": 1 }\n');
  write(join(dir, 'registry/access.json'), formatJson(access));
  return privatize(dir);
}

const plan = (
  r: { root: string; project: string },
  p: string | undefined,
  over: Partial<PlanOptions> = {},
) =>
  planCurated(r.root, {
    mode: 'install',
    consumer: 'proj',
    skill: 'fm-tool',
    version: '1.0.0',
    project: r.project,
    agents: ['claude-code'],
    privateRoot: p,
    ...over,
  });

const raw = (root: string) => loadRegistry(root).raw as Record<string, Record<string, unknown>[]>;
const errorsOf = (r: ReturnType<typeof buildCatalog>) => (r.ok ? '' : r.errors.join('\n'));
const skillsWith = (
  root: string,
  patch: (s: Record<string, unknown>[]) => Record<string, unknown>[],
) => errorsOf(buildCatalog({ ...raw(root), skills: patch(raw(root).skills!) }));
const tree = (dir: string) =>
  existsSync(dir)
    ? scanTree(dir)
        .files.map((f) => `${f.path}\n${readFileSync(join(dir, f.path), 'utf8')}`)
        .join('\n')
    : '';

describe('ES25 ownership', () => {
  it('is explicit metadata; legacy records derive it from origin, and a name implies nothing', () => {
    const r = fmRepo();
    const c = loadRegistry(r.root).catalog;
    const by = (id: string) => c.skills.find((s) => s.id === id)!;
    expect(ownershipOf(by('fm-tool'))).toBe('fm-ecosystem');
    expect(ownershipOf(by('ext'))).toBe('third-party'); // no field: external
    expect(ownershipOf(by('fp'))).toBe('first-party'); // no field: first-party, not FM Ecosystem
    expect(ownershipOf(by('ecosystem-lookalike'))).toBe('first-party');
    expect(distributionOf(by('ecosystem-lookalike'))).toEqual({ policy: 'open' });
    expect(by('ecosystem-lookalike').ownership).toBeUndefined();
  });

  it('rejects invalid values and ownership that does not match the source (spoofing)', () => {
    const { root } = fmRepo();
    const patch = (id: string, p: Record<string, unknown>) => (s: Record<string, unknown>[]) =>
      s.map((x) => (x.id === id ? { ...x, ...p } : x));
    expect(skillsWith(root, patch('fm-tool', { ownership: 'owner' }))).toMatch(/ownership/);
    expect(skillsWith(root, patch('fm-tool', { ownership: 'FM Ecosystem' }))).toMatch(/ownership/);
    // a third-party upstream cannot claim to be FM Ecosystem's
    expect(skillsWith(root, patch('ext', { ownership: 'fm-ecosystem' }))).toMatch(
      /skill ext: ownership "fm-ecosystem" requires a first-party skill.*an external upstream cannot establish ownership/,
    );
    expect(skillsWith(root, patch('fp', { ownership: 'third-party' }))).toMatch(
      /ownership "third-party" requires an external skill/,
    );
    expect(
      skillsWith(
        root,
        patch('ext', { distribution: { policy: 'restricted', access: 'owner-only' } }),
      ),
    ).toMatch(/owner-only access applies to skills the owner maintains/);
    expect(skillsWith(root, patch('fm-tool', { distribution: { policy: 'restricted' } }))).toMatch(
      /restricted distribution needs an "access" policy/,
    );
    expect(
      skillsWith(
        root,
        patch('fm-tool', { distribution: { policy: 'open', access: 'owner-only' } }),
      ),
    ).toMatch(/"access" applies to restricted distribution only/);
    expect(skillsWith(root, patch('fm-tool', { distribution: { policy: 'everyone' } }))).toMatch(
      /distribution/,
    );
    // a global consumer cannot be declared owner-controlled
    const consumers = raw(root).consumers!.map((c) =>
      c.id === 'glob' ? { ...c, ownership: 'fm-ecosystem' } : c,
    );
    expect(errorsOf(buildCatalog({ ...raw(root), consumers }))).toMatch(
      /consumer glob: global consumers have no ownership/,
    );
  });

  it('ownership grants nothing: an FM Ecosystem skill is not approved, assignable or installable by being one', () => {
    const r = fmRepo();
    const s = loadRegistry(r.root).catalog.skills.find((x) => x.id === 'fm-tool')!;
    expect(s.review.status).toBe('unreviewed');
    expect(assignmentPolicy(s)).toMatch(/fm-tool is restricted/);
    expect(plan(r, undefined).blockers.join()).toMatch(/no private authorization source/);
  });
});

describe('ES25 distribution', () => {
  it('legacy records stay open: existing third-party and first-party eligibility is unchanged', () => {
    const r = fmRepo();
    const c = loadRegistry(r.root).catalog;
    const ext = c.skills.find((s) => s.id === 'ext')!;
    expect(distributionOf(ext)).toEqual({ policy: 'open' });
    expect(assignmentPolicy(ext)).toBeUndefined();
    expect(installBlocker(ext)).toBeUndefined();
    expect(assignSkill(r.root, 'proj', 'ext', { dryRun: true }).status).toBe('added');
    expect(assignSkill(r.root, 'proj', 'fp', { dryRun: true }).status).toBe('added');
  });

  it('restricted: never through assignment, sync links or upstream download, and never in consumers.json', () => {
    const r = fmRepo();
    expect(() => assignSkill(r.root, 'proj', 'fm-tool', { dryRun: true })).toThrow(
      /fm-tool is restricted: it is installed only as an approved curated release/,
    );
    const consumers = raw(r.root).consumers!.map((c) =>
      c.id === 'proj' ? { ...c, assignments: [{ skill: 'fm-tool', agents: ['claude-code'] }] } : c,
    );
    expect(errorsOf(buildCatalog({ ...raw(r.root), consumers }))).toMatch(
      /consumer proj: "fm-tool" is restricted; it is authorized only by an access record in the private root/,
    );
    // a restricted external skill cannot be downloaded by skills:install either
    const ext = {
      ...loadRegistry(r.root).catalog.skills.find((s) => s.id === 'ext')!,
      distribution: { policy: 'restricted', access: 'authorized-consumers' },
    } as Skill;
    expect(installBlocker(ext)).toMatch(/ext is restricted/);
    // and a first-party link to the restricted source is never planned, even if a catalog were forged around validation
    const fm = loadRegistry(r.root).catalog.skills.find((s) => s.id === 'fm-tool')!;
    expect(resolveCanonical(r.root, fm).problems.join()).toMatch(/fm-tool is restricted/);
    const forged = buildCatalog(
      { ...raw(r.root), consumers },
      { scope: 'workspace' }, // workspace scope skips the public-assignment rule; sync must still refuse
    );
    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    const sync = planSync(
      r.root,
      forged.catalog,
      forged.catalog.consumers.find((c) => c.id === 'proj')!,
      r.project,
    );
    expect(sync.blockers.map((b) => `${b.name} ${b.state} ${b.detail}`).join()).toMatch(
      /fm-tool blocked cannot activate: fm-tool is restricted/,
    );
    expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false);
  });

  it('not-distributable: discovery only, on every path', () => {
    const r = fmRepo();
    const doc = loadRegistry(r.root).catalog.skills.find((s) => s.id === 'doc-only')!;
    expect(assignmentPolicy(doc)).toMatch(/doc-only is not distributable/);
    expect(decide({ skill: doc, path: 'curated', access: [] }).denials[0]!.code).toBe(
      'not-distributable',
    );
    const p = authRoot([grant({ skill: 'doc-only', releases: ['1.0.0'] })]);
    expect(() => loadWorkspace(r.root, p)).toThrow(
      /doc-only is not distributable and cannot be authorized/,
    );
    expect(plan(r, authRoot(), { skill: 'doc-only' }).blockers.join()).toMatch(
      /doc-only is not distributable/,
    );
  });

  it('private skills are restricted by default and can never be open', () => {
    const r = fmRepo();
    const p = authRoot([]);
    const skill = {
      id: 'secret',
      name: 'Secret',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/secret' },
    };
    write(join(p, 'registry/skills.json'), formatJson([skill]));
    privatize(p);
    expect(readPrivate(p).skills[0]).toMatchObject({
      visibility: 'private',
      distribution: { policy: 'restricted', access: 'authorized-consumers' },
    });
    write(
      join(p, 'registry/skills.json'),
      formatJson([{ ...skill, distribution: { policy: 'open' } }]),
    );
    expect(() => readPrivate(p)).toThrow(/distribution "open" is not allowed here/);
    // a private record cannot shadow the public restricted skill to change its policy
    write(
      join(p, 'registry/skills.json'),
      formatJson([
        { ...fmSkill(), distribution: { policy: 'restricted', access: 'authorized-consumers' } },
      ]),
    );
    expect(() => loadWorkspace(r.root, p)).toThrow(/collides with a public skill: fm-tool/);
  });

  it('access records for open skills are refused (they are assigned publicly)', () => {
    const r = fmRepo();
    expect(() =>
      loadWorkspace(r.root, authRoot([grant({ skill: 'ext', releases: ['1.0.0'] })])),
    ).toThrow(/ext is public and open; open skills are assigned in registry\/consumers.json/);
  });
});

describe('ES25 owner-only authorization', () => {
  it('every condition is required, and every independent reason is reported', () => {
    const r = fmRepo();
    const p = authRoot();
    expect(plan(r, p).blockers).toEqual([]);
    // no authorization source at all
    expect(plan(r, undefined).blockers.join()).toMatch(
      /no private authorization source is configured/,
    );
    // not authorized: consumer, version, agent
    const bare = plan(r, p, { consumer: 'bare', agents: ['claude-code'] }).blockers.join('\n');
    expect(bare).toMatch(/bare is not authorized for fm-tool \(no access record/);
    expect(bare).toMatch(/bare is not declared owner-controlled/);
    expect(plan(r, p, { version: '1.1.0', agents: ['codex'] }).blockers.join()).toMatch(
      /proj is not authorized to use fm-tool with codex/,
    );
    const two = plan(r, p, { version: '2.0.0' }).blockers.join('\n');
    expect(two).toMatch(/proj is not authorized for fm-tool@2.0.0/);
    expect(two).toMatch(/release-not-approved/);
    // an authorized, owner-controlled consumer still cannot install an unapproved release
    const q = authRoot([grant({ releases: ['2.0.0'] })]);
    const unapproved = plan(r, q, { version: '2.0.0' }).blockers.join('\n');
    expect(unapproved).toMatch(/release-not-approved/);
    expect(unapproved).toMatch(/review-incomplete/);
    expect(unapproved).not.toMatch(/not authorized/);
  });

  it('owner-only: an access record does not make a consumer owner-controlled', () => {
    const r = fmRepo();
    const p = authRoot([grant({ consumer: 'theirs' })]);
    const b = plan(r, p, { consumer: 'theirs' }).blockers.join();
    expect(b).toMatch(/fm-tool is owner-only: theirs is not declared owner-controlled/);
    expect(b).not.toMatch(/theirs is not authorized for fm-tool \(/);
    // the same grant under authorized-consumers is enough (ES24 behaviour for non-owner-only skills)
    const open = fmRepo({
      skill: { distribution: { policy: 'restricted', access: 'authorized-consumers' } },
    });
    expect(plan(open, p, { consumer: 'theirs' }).blockers).toEqual([]);
  });

  it('no flag, environment variable or owner string stands in for an access record', () => {
    for (const cmd of ['library', 'visibility'])
      for (const f of ['--owner', '--force', '--authorize', '--skip-auth'])
        expect(() => parseArgs(cmd, ['install', 'proj', 'fm-tool', f]), `${cmd} ${f}`).toThrow(
          UsageError,
        );
    const r = fmRepo();
    const before = plan(r, undefined).blockers;
    for (const k of ['ECOSYSTEM_SKILLS_OWNER', 'OWNER', 'ECOSYSTEM_SKILLS_AUTHORIZED'])
      process.env[k] = 'proj';
    try {
      expect(plan(r, undefined).blockers).toEqual(before);
    } finally {
      for (const k of ['ECOSYSTEM_SKILLS_OWNER', 'OWNER', 'ECOSYSTEM_SKILLS_AUTHORIZED'])
        delete process.env[k];
    }
    // authorizedBy is a record, not a credential: any value is just text
    const p = authRoot([grant({ authorizedBy: 'root' })]);
    expect(plan(r, p, { consumer: 'bare' }).blockers.join()).toMatch(/bare is not authorized/);
  });
});

describe('ES25 lifecycle of a restricted public skill (fixture only)', () => {
  it('install, upgrade and rollback: content from the public library, store, lock and desired state in the private root', () => {
    const r = fmRepo();
    const p = authRoot();
    const pub = tree(join(r.root, 'registry'));
    const i = plan(r, p);
    expect(i.notes.join()).toMatch(/restricted skill: the store copy lives in <private root>/);
    applyCurated(i);
    const link = join(r.project, '.claude/skills/fm-tool');
    expect(realpathSync(link)).toBe(join(p, 'external/releases/fm-tool/1.0.0'));
    expect(JSON.parse(readFileSync(join(p, 'registry/access.json'), 'utf8'))[0].release).toBe(
      '1.0.0',
    );
    expect(existsSync(join(p, 'external/releases.lock.json'))).toBe(true);
    // the public repository is untouched: registry byte-identical, no store, no lock
    expect(tree(join(r.root, 'registry'))).toBe(pub);
    expect(existsSync(join(r.root, 'external/releases'))).toBe(false);
    expect(existsSync(join(r.root, 'external/releases.lock.json'))).toBe(false);
    applyCurated(plan(r, p, { mode: 'upgrade', version: '1.1.0' }));
    expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toContain('1.1.0');
    applyCurated(plan(r, p, { mode: 'rollback', version: '1.0.0' }));
    expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toContain('1.0.0');
    const lock = JSON.parse(readFileSync(join(p, 'external/releases.lock.json'), 'utf8'));
    expect(
      lock.consumers.proj['fm-tool'].history.map(
        (h: { action: string; version: string }) => `${h.action} ${h.version}`,
      ),
    ).toEqual(['install 1.0.0', 'upgrade 1.1.0', 'rollback 1.0.0']);
    expect(tree(join(r.root, 'registry'))).toBe(pub);
    // status lists the restricted install (ES24 limitation addressed)
    const rows = consumerInventory(r.root, 'proj', r.project, p);
    expect(rows.find((x) => x.skill === 'fm-tool')).toMatchObject({
      restricted: true,
      kind: 'curated',
      desired: '1.0.0',
      installed: '1.0.0',
      drift: [],
    });
  });

  it('revoking a version or the record blocks upgrade, rollback and reinstallation', () => {
    const r = fmRepo();
    const p = authRoot();
    const f = join(p, 'registry/access.json');
    applyCurated(plan(r, p));
    applyCurated(plan(r, p, { mode: 'upgrade', version: '1.1.0' }));
    // the owner removes 1.0.0 from the grant: rolling back to it is refused
    writeFileSync(
      f,
      formatJson([grant({ releases: ['1.1.0'], release: '1.1.0', activeAgents: ['claude-code'] })]),
    );
    expect(plan(r, p, { mode: 'rollback', version: '1.0.0' }).blockers.join()).toMatch(
      /proj is not authorized for fm-tool@1.0.0/,
    );
    // the owner revokes the record, then a reinstall is attempted
    writeFileSync(f, '[]\n');
    const re = plan(r, p).blockers.join();
    expect(re).toMatch(/proj is not authorized for fm-tool \(no access record/);
    // status still lists the install from its deployment tracking, revoked, with the link it left (audit 6)
    expect(
      consumerInventory(r.root, 'proj', r.project, p).find((x) => x.skill === 'fm-tool'),
    ).toMatchObject({
      authorization: 'revoked',
      desired: 'none',
      links: [{ agent: 'claude-code', target: '1.1.0' }],
      drift: [
        expect.stringMatching(/authorization fully revoked: fm-tool 1\.1\.0 is still tracked/),
      ],
    });
    // re-granted without a desired version: a reinstall reuses the verified store copy
    writeFileSync(f, formatJson([grant({ releases: ['1.1.0'] })]));
    const again = plan(r, p, { version: '1.1.0' });
    expect(again.blockers).toEqual([]);
    expect(again.store).toBe('verified');
    expect(
      consumerInventory(r.root, 'proj', undefined, p).find((x) => x.skill === 'fm-tool'),
    ).toMatchObject({
      desired: 'none',
      upgrade: { eligible: true, to: '1.1.0' },
    });
    applyCurated(again);
    expect(readFileSync(join(r.project, '.claude/skills/fm-tool/SKILL.md'), 'utf8')).toContain(
      '1.1.0',
    );
  });

  it('legacy migration: a restricted skill has no legacy install to migrate from or roll back to', () => {
    const r = fmRepo();
    const p = authRoot();
    expect(plan(r, p, { mode: 'rollback', version: 'legacy' }).blockers.join()).toMatch(
      /restricted skills have no legacy install; only curated releases are managed/,
    );
    // a legacy assignment in the public registry makes the registry invalid, so nothing can plan from it
    const consumers = JSON.parse(readFileSync(join(r.root, 'registry/consumers.json'), 'utf8'));
    consumers[0].assignments = [{ skill: 'fm-tool', agents: ['claude-code'] }];
    writeFileSync(join(r.root, 'registry/consumers.json'), formatJson(consumers));
    expect(() => plan(r, p, { mode: 'upgrade', version: '1.0.0', migrate: true })).toThrow(
      /"fm-tool" is restricted; it is authorized only by an access record/,
    );
  });

  it('a failure part-way rolls back the access record, the store and the links', () => {
    const r = fmRepo();
    const p = authRoot();
    const before = readFileSync(join(p, 'registry/access.json'), 'utf8');
    for (let n = 0; n <= 4; n++) {
      expect(() => applyCurated(plan(r, p), { failAfter: n })).toThrow(
        /rolled back|nothing had been changed/,
      );
      expect(readFileSync(join(p, 'registry/access.json'), 'utf8')).toBe(before);
      expect(existsSync(join(p, 'external/releases/fm-tool/1.0.0'))).toBe(false);
      expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false);
    }
  });
});

describe('ES25 preview and apply decide separately', () => {
  it('a grant revoked after the preview is refused at apply, with nothing changed', () => {
    const r = fmRepo();
    const p = authRoot();
    const pl = plan(r, p);
    expect(pl.blockers).toEqual([]);
    writeFileSync(join(p, 'registry/access.json'), '[]\n');
    expect(() => applyCurated(pl)).toThrow(/access.json changed since the preview/);
    expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false);
    expect(existsSync(join(p, 'external/releases'))).toBe(false);
  });

  it('a consumer no longer owner-controlled, or an approval withdrawn, after the preview is refused at apply', () => {
    for (const change of ['ownership', 'approval'] as const) {
      const r = fmRepo();
      const p = authRoot();
      const pl = plan(r, p);
      expect(pl.blockers).toEqual([]);
      if (change === 'ownership') {
        const c = JSON.parse(readFileSync(join(r.root, 'registry/consumers.json'), 'utf8'));
        delete c[0].ownership;
        writeFileSync(join(r.root, 'registry/consumers.json'), formatJson(c));
      } else {
        const rel = JSON.parse(readFileSync(join(r.root, 'registry/releases.json'), 'utf8'));
        rel[0].approval = { status: 'withdrawn', approvedAt: '2026-10-31', approvedBy: 'Owner' };
        writeFileSync(join(r.root, 'registry/releases.json'), formatJson(rel));
      }
      expect(() => applyCurated(pl), change).toThrow(/refused: [\s\S]*nothing was changed/);
      expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false);
      expect(readFileSync(join(p, 'registry/access.json'), 'utf8')).not.toMatch(/"release"/);
    }
  });

  it('a forged plan cannot bypass the decision', () => {
    const r = fmRepo();
    const p = authRoot();
    const blocked = plan(r, p, { consumer: 'bare' });
    expect(blocked.blockers.length).toBeGreaterThan(0);
    // clearing the blockers by hand
    expect(() => applyCurated({ ...blocked, blockers: [] })).toThrow(
      /refused: [\s\S]*not authorized/,
    );
    // pretending the skill is not restricted, so desired state would go to the public registry
    const ok = plan(r, p);
    expect(() => applyCurated({ ...ok, restricted: false })).toThrow(/changed since the preview/);
    // pointing the plan at another consumer
    expect(() =>
      applyCurated({ ...ok, blockers: [], options: { ...ok.options, consumer: 'theirs' } }),
    ).toThrow(/refused/);
    expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false);
    expect(readFileSync(join(r.root, 'registry/consumers.json'), 'utf8')).not.toContain('fm-tool');
  });
});

describe('ES25 authorization source security', () => {
  it('tampering: group- or world-writable records, foreign owners, symlinks and wildcards are refused', () => {
    const r = fmRepo();
    const p = authRoot();
    chmodSync(join(p, 'registry/access.json'), 0o666);
    expect(() => readPrivate(p)).toThrow(/access.json must be accessible only by its owner/);
    chmodSync(join(p, 'registry/access.json'), 0o600);
    chmodSync(join(p, 'registry'), 0o777);
    expect(() => readPrivate(p)).toThrow(
      /<private root>\/registry must be accessible only by its owner \(chmod 700\)/,
    );
    chmodSync(join(p, 'registry'), 0o700);
    expect(() => checkPrivateRoot(r.root, p, undefined, (process.getuid?.() ?? 0) + 1)).toThrow(
      /must be owned by the user running this tool/,
    );
    // a symlinked access file
    const q = authRoot();
    const elsewhere = join(tmp('es25-else-'), 'access.json');
    writeFileSync(elsewhere, formatJson([grant({ consumer: 'theirs' })]));
    rmSync(join(q, 'registry/access.json'));
    symlinkSync(elsewhere, join(q, 'registry/access.json'));
    expect(() => readPrivate(q)).toThrow(/access.json must be a regular file/);
    // wildcards and traversal do not parse
    for (const bad of [
      grant({ consumer: '*' }),
      grant({ skill: '*' }),
      grant({ agents: ['*'] }),
      grant({ releases: ['*'] }),
      grant({ releases: ['../1.0.0'] }),
      grant({ skill: '../fm-tool' }),
      grant({ agents: [] }),
      grant({ ownership: 'fm-ecosystem' }),
      grant({ distribution: { policy: 'open' } }),
    ]) {
      writeFileSync(join(p, 'registry/access.json'), formatJson([bad]));
      expect(() => readPrivate(p), JSON.stringify(bad)).toThrow(/access.json\[0\]/);
    }
  });

  it('symlink attacks on the private store and the public release content are refused', () => {
    const r = fmRepo();
    const p = authRoot();
    const outside = tmp('es25-out-');
    mkdirSync(join(p, 'external'));
    symlinkSync(outside, join(p, 'external/releases'));
    expect(plan(r, p).blockers.join()).toMatch(/not a plain directory tree/);
    const s = fmRepo();
    const real = join(tmp('es25-lib-'), 'v');
    cpSync(join(s.root, 'library/fm-tool/1.0.0'), real, { recursive: true });
    rmSync(join(s.root, 'library/fm-tool/1.0.0'), { recursive: true });
    symlinkSync(real, join(s.root, 'library/fm-tool/1.0.0'));
    expect(plan(s, authRoot()).blockers.join()).toMatch(/not a plain directory/);
    // tampered public content is refused even with a valid grant
    const t = fmRepo();
    writeFileSync(join(t.root, 'library/fm-tool/1.0.0/SKILL.md'), 'changed\n');
    expect(plan(t, authRoot()).blockers.join()).toMatch(/does not match the recorded/);
  });

  it('nothing from the authorization source reaches public output or denial messages', () => {
    const r = fmRepo();
    const p = authRoot([grant(), grant({ consumer: 'theirs', releases: ['1.0.0'] })]);
    // the public catalog never reads the private root
    expect(catalogToJson(loadRegistry(r.root).catalog)).not.toContain(MARKER);
    // a denial names the rule, not other consumers' grants, who authorized them, or the root's location
    const ws = loadWorkspace(r.root, p);
    const e = explainEligibility(ws, 'fm-tool', 'bare', { agents: ['claude-code'] });
    const out = [...e.lines, ...plan(r, p, { consumer: 'bare' }).blockers].join('\n');
    expect(e.eligible).toBe(false);
    expect(out).not.toContain(MARKER);
    expect(out).not.toContain(p);
    expect(out).not.toMatch(/theirs|1\.1\.0/);
    expect(
      explainEligibility(ws, 'fm-tool', 'proj', { agents: ['claude-code'], version: '1.0.0' }),
    ).toMatchObject({
      eligible: true,
    });
  });
});

describe('ES25 CLI (real cli.ts in a fixture repository)', () => {
  const pkg = join(__dirname, '..');
  const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
  const run = (root: string, env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, join(root, 'packages/catalog/src/cli.ts'), ...args], {
      cwd: join(root, 'packages/catalog'),
      env: { ...process.env, INIT_CWD: root, ...env },
      encoding: 'utf8',
    });

  it('explains eligibility, refuses unauthorized and bypassing installs, and lists restricted installs', () => {
    const r = fmRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    const p = authRoot();
    const env = { [PRIVATE_ENV]: p };
    const ok = run(
      r.root,
      env,
      'visibility',
      'fm-tool',
      '--consumer',
      'proj',
      '--agents',
      'claude-code',
      '--version',
      '1.0.0',
    );
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/ownership: +FM Ecosystem/);
    expect(ok.stdout).toMatch(/distribution: +restricted \(owner-only\)/);
    const no = run(r.root, {}, 'visibility', 'fm-tool', '--consumer', 'proj');
    expect(no.status).toBe(1);
    expect(no.stdout).toMatch(/BLOCKED: fm-tool is restricted and no private authorization source/);
    expect(run(r.root, env, 'visibility', 'fm-tool', '--consumer', 'proj', '--owner').status).toBe(
      2,
    );
    // assign and sync are not a way around it
    const as = run(r.root, env, 'assign', 'proj', 'fm-tool');
    expect(as.status).toBe(1);
    expect(as.stderr).toMatch(/fm-tool is restricted/);
    // the managed path: preview, then apply, then status
    const pre = run(
      r.root,
      env,
      'library',
      'install',
      'proj',
      'fm-tool',
      '--version',
      '1.0.0',
      '--project',
      r.project,
      '--agents',
      'claude-code',
    );
    expect(pre.status, pre.stdout + pre.stderr).toBe(0);
    expect(existsSync(join(r.project, '.claude/skills/fm-tool'))).toBe(false); // a preview changes nothing
    const app = run(
      r.root,
      env,
      'library',
      'install',
      'proj',
      'fm-tool',
      '--version',
      '1.0.0',
      '--project',
      r.project,
      '--agents',
      'claude-code',
      '--apply',
    );
    expect(app.status, app.stdout + app.stderr).toBe(0);
    const st = run(r.root, env, 'library', 'status', 'proj', '--project', r.project);
    expect(st.status, st.stderr).toBe(0);
    expect(st.stdout).toMatch(
      /fm-tool +curated restricted \(authorized in <private root>\) wants 1\.0\.0, links 1\.0\.0/,
    );
    const denied = run(
      r.root,
      env,
      'library',
      'install',
      'bare',
      'fm-tool',
      '--version',
      '1.0.0',
      '--project',
      tmp('es25-bare-'),
      '--agents',
      'claude-code',
      '--apply',
    );
    expect(denied.status).toBe(1);
    expect(denied.stdout).toMatch(/BLOCKED[\s\S]*bare is not authorized for fm-tool/);
    for (const o of [ok, no, as, pre, app, st, denied]) {
      expect(o.stdout + o.stderr).not.toContain(p);
      expect(o.stdout + o.stderr).not.toContain(MARKER);
    }
  }, 90_000);
});

describe('ES25 real registry', () => {
  const repo = resolve(__dirname, '../../..');
  const c = loadRegistry(repo).catalog;

  it('the two FM Ecosystem skills are public, restricted to owner-only installs, and still unreviewed', () => {
    const fm = c.skills.filter((s) => s.ownership === 'fm-ecosystem').map((s) => s.id);
    expect(fm).toEqual(['ecosystem-assets', 'ecosystem-config']);
    for (const id of fm) {
      const s = c.skills.find((x) => x.id === id)!;
      expect(s.visibility).toBeUndefined();
      expect(s.distribution).toMatchObject({ policy: 'restricted', access: 'owner-only' });
      expect(s.review.status).toBe('unreviewed');
      expect(c.releases.some((r) => r.skill === id)).toBe(false);
      expect(c.consumers.some((x) => x.assignments.some((a) => a.skill === id))).toBe(false);
    }
  });

  it('every other skill keeps legacy (open) eligibility; no consumer is declared owner-controlled yet', () => {
    const others = c.skills.filter((s) => s.ownership !== 'fm-ecosystem');
    expect(others).toHaveLength(245);
    expect(others.every((s) => s.ownership === undefined && s.distribution === undefined)).toBe(
      true,
    );
    expect(others.filter((s) => ownershipOf(s) === 'third-party')).toHaveLength(243);
    expect(c.consumers.every((x) => x.ownership === undefined)).toBe(true);
  });

  it('the renamed Ecosystem Config repository is the single canonical record, with the old name as a former name', () => {
    const named = c.integrations.filter((i) =>
      [i.repository?.name, ...(i.repository?.formerNames ?? [])].some((n) =>
        /ecosystem-config|config-ecosystem/.test(n ?? ''),
      ),
    );
    expect(named.map((i) => i.id)).toEqual(['ecosystem-config']);
    expect(named[0]!.repository).toEqual({
      name: 'ecosystem-config',
      formerNames: ['config-ecosystem'],
      visibility: 'public',
      url: 'https://github.com/Fikrimarzuki/ecosystem-config',
    });
    expect(named[0]!.homepage).toBe('https://config.fikrimarzuki.work/');
    // no other registry file, skill or doc page still points at the old repository URL
    for (const f of ['skills', 'consumers', 'sources', 'releases'])
      expect(readFileSync(join(repo, 'registry', `${f}.json`), 'utf8'), f).not.toContain(
        'config-ecosystem',
      );
    expect(readFileSync(join(repo, 'skills/shared/ecosystem-config/SKILL.md'), 'utf8')).toContain(
      'current name (`ecosystem-config`) and its former names (`config-ecosystem`)',
    );
  });

  it('public skill files carry no private repository documentation, paths or credentials', () => {
    const asset = readFileSync(join(repo, 'skills/shared/ecosystem-assets/SKILL.md'), 'utf8');
    expect(existsSync(join(repo, 'skills/shared/ecosystem-assets/references'))).toBe(false);
    // field tables, private inputs and intake folders of the private repository stay there
    expect(asset).not.toMatch(
      /rightsStatus|catalog\/publications\.json|catalog\/metadata\.json|incoming\/|scripts\/catalog\.mjs|logicalAssets/,
    );
    const assets = c.integrations.find((i) => i.id === 'ecosystem-assets')!;
    expect(assets.repository!.url).toBeUndefined();
    expect(assets.contract!.commands).toEqual([]);
  });
});

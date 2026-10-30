import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  contentAvailability,
  releaseInstallBlocker,
  verifyLibrary,
} from '../src/index.ts';

/* Invariants of the real registry after the ES16 discovery milestone. */
const root = resolve(__dirname, '../../..');
const read = (n: string) => JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8'));
const built = buildCatalog({
  skills: read('skills'),
  consumers: read('consumers'),
  integrations: read('integrations'),
  evidence: read('evidence'),
  sources: read('sources'),
  releases: read('releases'),
  evaluations: read('evaluations'),
  updates: read('updates'),
});
if (!built.ok) throw new Error(built.errors.join('\n'));
const c = built.catalog;
const discovered = c.skills.filter((s) => s.discovery);

describe('ES16 registry', () => {
  it('records every one of the 29 requested items as a source', () => {
    const requested = c.sources.filter((s) => s.requestedAs);
    const labels = requested.map((s) => s.requestedAs!).join('\n');
    for (const needle of [
      'addyosmani/agent-skills',
      'mattpocock/skills',
      'obra/superpowers',
      'cloudflare/security-audit-skill',
      'agentskills/agentskills',
      'oil-oil/oil-ui',
      'krillinai/OpenCreator',
      'cloudai-x/threejs-skills',
      'greensock/gsap-skills',
      'zanwei/design-dna',
      'lottiefiles/motion-design-skill',
      'AThevon/genjutsu',
      'pbakaus/impeccable',
      'Hallmark',
      'Taste Skill',
      'Anti-slop',
      'UI UX Pro Max',
      'VoltAgent Awesome DESIGN.md',
      'Nexu Open Design',
      'Elaya AI Design Skills',
      'Design MD — Hyperbrowser AI',
      'Styles — Refero Design',
      'DesignMD — Supply',
      'TypeUI.sh',
      'Neuform AI',
      'MotionSites AI Claude Skill',
      'Claude Animation Base',
      'Video Shotcraft',
      'MG Styles 15',
    ])
      expect(labels, needle).toContain(needle);
    expect(c.sources.filter((s) => s.batch === 'original')).toHaveLength(13);
    expect(c.sources.filter((s) => s.batch === 'design-ui').length).toBeGreaterThanOrEqual(13);
    expect(c.sources.filter((s) => s.batch === 'video-animation')).toHaveLength(3);
  });

  it('never registers a skill from a reference, application, standard or unresolved source', () => {
    for (const s of c.sources)
      if (['reference-only', 'unresolved', 'reject'].includes(s.decision))
        expect(s.skills, s.id).toEqual([]);
    for (const id of [
      'agentskills-standard',
      'krillinai-opencreator',
      'nexu-open-design',
      'voltagent-awesome-design-md',
      'anti-slop-unresolved',
      'neuform-ai',
      'motionsites-claude-skill',
      'claude-animation-base',
      'vincentwei1021-mg-styles-15',
    ])
      expect(c.sources.find((s) => s.id === id)!.skills, id).toEqual([]);
  });

  it('keeps ambiguous identities unresolved instead of inventing a source', () => {
    for (const id of ['anti-slop-unresolved', 'motionsites-claude-skill', 'neuform-ai']) {
      const s = c.sources.find((x) => x.id === id)!;
      expect(s.decision).toBe('unresolved');
      expect(s.upstream).toBeUndefined();
      expect(s.revision).toBeUndefined();
      expect(s.needs).toBeTruthy();
    }
  });

  it('registers discovered skills as unreviewed candidates pinned to a commit, with a content hash', () => {
    expect(discovered.length).toBeGreaterThanOrEqual(200);
    for (const s of discovered) {
      expect(s.review.status, s.id).toBe('unreviewed');
      expect(s.source.type, s.id).toBe('external');
      if (s.source.type === 'external') expect(s.source.revision, s.id).toMatch(/^[0-9a-f]{40}$/);
      expect(s.discovery!.contentHash, s.id).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(s.license, s.id).toBeTruthy();
    }
  });

  it('leaves the owner-approved set, assignments and evidence unchanged', () => {
    expect(
      c.skills
        .filter((s) => s.review.status === 'approved')
        .map((s) => s.id)
        .sort(),
    ).toEqual(
      [
        'caveman',
        'frontend-design',
        'grilling',
        'ponytail',
        'verification-before-completion',
        'writing-plans',
      ].sort(),
    );
    expect(c.evidence).toHaveLength(24);
    const assigned = new Set(c.consumers.flatMap((x) => x.assignments.map((a) => a.skill)));
    for (const s of discovered) expect(assigned.has(s.id), s.id).toBe(false);
  });

  it('has no duplicate skill: one entry per upstream repository and folder', () => {
    const keys = c.skills
      .filter((s) => s.source.type === 'external')
      .map((s) =>
        s.source.type === 'external'
          ? `${s.source.upstream.url.toLowerCase()}#${s.source.path}`
          : '',
      );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('flags root-level skills and keeps their pin on the whole repository', () => {
    const roots = c.skills.filter((s) => s.source.type === 'external' && s.source.path === '.');
    expect(roots.map((s) => s.id).sort()).toEqual(['design-dna', 'oil-ui', 'video-shotcraft']);
    for (const s of roots) expect(s.discovery!.warnings.join(' ')).toMatch(/repository root/);
  });

  it('requires entry skills of the genjutsu framework to carry the missing-modules warning', () => {
    for (const id of ['genjutsu-cast', 'genjutsu-paint', 'genjutsu-bunshin'])
      expect(c.skills.find((s) => s.id === id)!.discovery!.warnings.join(' ')).toMatch(/_jutsu/);
  });

  it('writes the unreviewed status explicitly on every discovered candidate (no reliance on schema defaults)', () => {
    const raw = read('skills') as {
      id: string;
      review?: { status: string; findings: unknown[] };
    }[];
    const ids = new Set(discovered.map((s) => s.id));
    for (const r of raw.filter((x) => ids.has(x.id)))
      expect(r.review, r.id).toEqual({ status: 'unreviewed', findings: [] });
  });

  it('holds the skills with unresolved conditions behind explicit approval blockers', () => {
    const blocked = discovered.filter((s) => s.discovery!.approvalBlockers.length).map((s) => s.id);
    const expected = [
      'design-dna',
      'oil-ui',
      'video-shotcraft', // repository-root SKILL.md
      'genjutsu-cast',
      'genjutsu-paint',
      'genjutsu-bunshin', // incomplete without the _jutsu modules
      'impeccable', // unreviewed downloaded engine binary
      'eas-workflows',
      'hf-cli',
      'auditing-wcag',
      'reviewing-a11y',
      ...[
        'best-practices',
        'captions',
        'create',
        'docs',
        'interactivity',
        'maps',
        'markup',
        'multimedia',
        'render',
        'saas',
        'studio',
        'upgrade',
      ].map((n) => `remotion-${n}`),
    ];
    expect(blocked.sort()).toEqual(expected.sort());
    for (const s of discovered.filter((x) => x.discovery!.approvalBlockers.length))
      expect(s.discovery!.warnings[0], s.id).toMatch(/^Approval blocked until resolved:/);
  });

  it('keeps the high-risk behaviours visible in the warnings', () => {
    const w = (id: string) => c.skills.find((s) => s.id === id)!.discovery!.warnings.join(' ');
    expect(w('impeccable')).toMatch(
      /not checksum-verified[\s\S]*engine-checksums\.txt[\s\S]*not inspected/,
    );
    expect(w('oil-ui')).toMatch(/load-time shell injection[\s\S]*--update/);
    expect(w('hallmark')).toMatch(/Optional, user-run installers[\s\S]*settings\.json/);
    expect(w('eas-workflows')).toMatch(/unpinned[\s\S]*scripts\/\.cache[\s\S]*Bash\(node:\*\)/);
    expect(w('hf-cli')).toMatch(/curl .* \| bash/);
    expect(w('auditing-wcag')).toMatch(/pre-approves WebFetch and Playwright/);
    expect(w('remotion-render')).toMatch(/licen[cs]e/i);
    expect(c.skills.find((s) => s.id === 'remotion-render')!.license).toBe('unknown');
    expect(w('video-shotcraft')).toMatch(/53 MB[\s\S]*not traceable/);
  });

  it('records every skill whose frontmatter pre-approves shell, write, web or agent tools', () => {
    for (const id of [
      'genjutsu-cast',
      'genjutsu-bunshin',
      'shadcn',
      'eas-update',
      'playwright-cli',
      'sentry-security-review',
    ])
      expect(c.skills.find((s) => s.id === id)!.discovery!.warnings.join(' '), id).toMatch(
        /allowed-tools pre-approves/,
      );
  });

  it('ES17: the grilling release is unapproved, matching its files and the reviewed upstream hash', () => {
    const r = c.releases.find((x) => x.skill === 'grilling')!;
    expect(r.approval).toEqual({ status: 'unapproved' });
    // ES18: a genuine, scoped review was recorded; it is bound to the content and does not approve anything
    expect(r.review.outcome).toBe('no-blocking-issues');
    expect(r.review.contentHash).toBe(r.curatedHash);
    expect(r.review.reviewer).toMatch(/not an approval/);
    expect(r.review.evidence.map((e) => e.method).sort()).toEqual(['manual-read', 'static-scan']);
    expect(r.review.checks).toHaveLength(26);
    expect(verifyLibrary(root, c)).toEqual([]);
    // the skill's own approval is untouched, and the unmodified upstream content is exactly what the owner reviewed
    const g = c.skills.find((x) => x.id === 'grilling')!;
    expect(g.review.status).toBe('approved');
    expect(r.upstream!.contentHash).toBe(g.review.contentHash);
    expect(r.upstream!.revision).toBe(g.source.type === 'external' ? g.source.revision : '');
    expect(releaseInstallBlocker(g, r)).toMatch(/not approved/);
    // upstream files are byte-identical; only the declared notice files differ
    expect(r.modifications.map((m) => `${m.kind}:${m.path}`).sort()).toEqual([
      'added:ATTRIBUTION.md',
      'added:LICENSE',
    ]);
  });

  it('ES22: four candidates are staged as curated, unapproved releases; none inherits approval', () => {
    expect(c.releases.map((r) => `${r.skill}@${r.version}`).sort()).toEqual([
      'grilling@1.0.0',
      'gsap-performance@1.0.0',
      'gsap-react@1.0.0',
      'gsap-timeline@1.0.0',
      'web-quality-accessibility@1.0.0',
    ]);
    expect(verifyLibrary(root, c)).toEqual([]);
    for (const r of c.releases) {
      const s = c.skills.find((x) => x.id === r.skill)!;
      expect(r.approval, r.skill).toEqual({ status: 'unapproved' });
      expect(r.license, r.skill).toBe('MIT');
      // provenance: the curated upstream folder is exactly the pinned registry content
      expect(r.upstream!.revision, r.skill).toBe(
        s.source.type === 'external' ? s.source.revision : '',
      );
      expect(r.upstream!.contentHash, r.skill).toBe(
        s.discovery?.contentHash ?? s.review.contentHash,
      );
      expect(r.review.contentHash, r.skill).toBe(r.curatedHash);
      expect(releaseInstallBlocker(s, r), r.skill).toMatch(/not approved/);
    }
    const byId = (id: string) => c.releases.find((r) => r.skill === id)!;
    for (const id of ['gsap-react', 'gsap-timeline', 'gsap-performance']) {
      expect(byId(id).review.outcome).toBe('no-blocking-issues');
      expect(byId(id).review.reviewer).toMatch(/not an approval/);
      expect(byId(id).references).toEqual([]);
    }
    const a11y = byId('web-quality-accessibility');
    expect(a11y.review.outcome).toBe('requires-changes');
    expect(a11y.references.map((x) => `${x.target}:${x.resolution}`)).toEqual([
      '../web-quality-audit/SKILL.md:unresolved',
    ]);
  });

  it('ES17: every other skill is a source reference, keeping its record and approval state', () => {
    const states = c.skills.map((s) => contentAvailability(s, c.releases).state);
    expect(states.filter((x) => x === 'curated-unapproved')).toHaveLength(5);
    expect(states.filter((x) => x === 'curated-approved')).toHaveLength(0);
    expect(states.filter((x) => x === 'first-party')).toHaveLength(2);
    expect(c.skills).toHaveLength(245);
    // unknown-licence and root-level candidates are blocked from curation, with the reasons stated
    for (const id of ['remotion-render', 'design-dna', 'oil-ui', 'video-shotcraft'])
      expect(
        contentAvailability(
          c.skills.find((s) => s.id === id)!,
          c.releases,
        ).state,
        id,
      ).toBe('curation-blocked');
    const wp = contentAvailability(
      c.skills.find((s) => s.id === 'writing-plans')!,
      c.releases,
    );
    expect(wp.state).toBe('source-only');
    expect(wp.reasons.map((x) => x.code)).toContain('approved-upstream-only');
  });
});

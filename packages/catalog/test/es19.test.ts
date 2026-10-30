import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/index.ts';
import { TASKS, taskProblems, CRITERIA } from '../evals/es19/tasks.ts';
import { changedFiles, scoreWorkspace } from '../evals/es19/score.ts';
import { liveGate } from '../evals/es19/plan.ts';
import { tmp, write } from './fixtures.ts';

/* ES19: comparative evaluation framework and evaluation records. No agent is run here. */
const ws = (files: Record<string, string>) => {
  const d = tmp('es19-');
  for (const [f, b] of Object.entries(files)) write(join(d, f), b);
  return d;
};
const byCriterion = (scores: ReturnType<typeof scoreWorkspace>) =>
  Object.fromEntries(scores.map((s) => [s.criterion, s.result]));

describe('tasks', () => {
  it('every task scores every criterion exactly once, so arms stay comparable', () => {
    expect(TASKS.flatMap(taskProblems)).toEqual([]);
    for (const t of TASKS)
      expect(t.criteria.map((c) => c.criterion).sort()).toEqual([...CRITERIA].sort());
  });

  it('covers every ES19 candidate, and design tasks name the approved alternative for arm C', () => {
    const covered = new Set(TASKS.flatMap((t) => t.skills));
    for (const id of [
      'gsap-core',
      'gsap-timeline',
      'gsap-scrolltrigger',
      'gsap-react',
      'gsap-performance',
      'web-quality-accessibility',
      'web-quality-core-web-vitals',
      'frontend-design',
      'hallmark',
      'taste-skill',
      'impeccable',
    ])
      expect(covered.has(id), id).toBe(true);
    expect(TASKS.find((t) => t.id === 'design-landing')!.alternative).toBe('frontend-design');
  });
});

describe('scoring (same criteria for every arm; judgement and tokens are never auto-scored)', () => {
  const task = TASKS.find((t) => t.id === 'gsap-react-entrance')!;
  const fixture = ws(task.files);

  it('the untouched fixture fails the automated checks it should fail', () => {
    const s = byCriterion(scoreWorkspace(task, fixture, fixture));
    expect(s.correctness).toBe('fail');
    expect(s.accessibility).toBe('fail');
    expect(s.quality).toBe('manual');
    expect(s['instruction-adherence']).toBe('manual');
    expect(s['token-usage']).toBe('not-measured');
  });

  it('a good solution passes every automated check', () => {
    const good = ws({
      ...task.files,
      'src/Cards.tsx':
        "import { useRef } from 'react';\nimport gsap from 'gsap';\nimport { useGSAP } from '@gsap/react';\nexport function Cards() {\n  const root = useRef(null);\n  useGSAP(() => {\n    const mm = gsap.matchMedia();\n    mm.add('(prefers-reduced-motion: no-preference)', () => {\n      gsap.from('.card', { autoAlpha: 0, y: 24, stagger: 0.1 });\n    });\n  }, { scope: root });\n  return <section ref={root} className=\"cards\"><article className=\"card\">One</article></section>;\n}\n",
    });
    const s = byCriterion(scoreWorkspace(task, fixture, good));
    for (const c of [
      'correctness',
      'maintainability',
      'accessibility',
      'performance',
      'unnecessary-changes',
    ])
      expect(s[c], c).toBe('pass');
  });

  it('a careless solution fails the specific criteria it breaks', () => {
    const bad = ws({
      ...task.files,
      'src/Cards.tsx':
        "import gsap from 'gsap';\nimport { useEffect } from 'react';\nexport function Cards() {\n  useEffect(() => { gsap.from('.card', { top: 40, opacity: 0 }); }, []);\n  return null;\n}\n",
      'src/extra.ts': 'export {};\n',
    });
    const s = byCriterion(scoreWorkspace(task, fixture, bad));
    expect(s.correctness).toBe('fail');
    expect(s.performance).toBe('fail');
    expect(s.accessibility).toBe('fail');
    expect(s['unnecessary-changes']).toBe('fail');
  });

  it('changedFiles ignores agent skill folders and reports added, removed and edited files', () => {
    const a = ws({ 'a.txt': '1', 'b.txt': '2' });
    const b = ws({ 'a.txt': '1', 'c.txt': '3', '.claude/skills/x/SKILL.md': 'x' });
    expect(changedFiles(a, b)).toEqual(['b.txt', 'c.txt']);
  });
});

describe('live-run gate', () => {
  it('refuses unreviewed candidates and only marks approved skills as eligible (still needing owner authorization)', () => {
    expect(liveGate('gsap-core')).toMatch(
      /unreviewed: its instructions have not been reviewed and approved/,
    );
    expect(liveGate('impeccable')).toMatch(/unreviewed/);
    expect(liveGate('frontend-design')).toBeUndefined();
    expect(liveGate('nope')).toMatch(/unknown skill/);
  });

  it('the planner builds identical arm workspaces without placing any skill content, and --live never runs an agent', () => {
    const pkg = resolve(__dirname, '..');
    const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
    const out = tmp('es19-plan-');
    const r = spawnSync(
      process.execPath,
      [TSX, join(pkg, 'evals/es19/plan.ts'), '--skill', 'web-quality-accessibility', '--out', out],
      { encoding: 'utf8' },
    );
    expect(r.status, r.stderr).toBe(0);
    const arms = readdirSync(join(out, 'a11y-signup-form')).sort();
    expect(arms).toEqual(['A-baseline', 'B-candidate', 'fixture']);
    for (const a of arms) {
      expect(readFileSync(join(out, 'a11y-signup-form', a, 'index.html'), 'utf8')).toBe(
        TASKS.find((t) => t.id === 'a11y-signup-form')!.files['index.html'],
      );
      expect(existsSync(join(out, 'a11y-signup-form', a, '.claude'))).toBe(false);
    }
    const plan = JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8'));
    expect(plan[0].prompt).toMatch(/Make index.html accessible/);
    const live = spawnSync(
      process.execPath,
      [TSX, join(pkg, 'evals/es19/plan.ts'), '--skill', 'gsap-react', '--live'],
      { encoding: 'utf8' },
    );
    expect(live.status).toBe(2);
    expect(live.stderr).toMatch(
      /Live agent runs are not performed by ES19[\s\S]*not run by an agent/,
    );
  }, 60_000);
});

describe('evaluation records', () => {
  const SHA = 'a'.repeat(40);
  const H = `sha256-${'b'.repeat(64)}`;
  const skill = (over = {}) => ({
    id: 'cand',
    name: 'C',
    description: 'd',
    category: 'general',
    origin: 'external',
    source: {
      type: 'external',
      upstream: { url: 'https://github.com/o/r' },
      path: 'skills/c',
      revision: SHA,
    },
    author: 'o',
    license: 'MIT',
    ...over,
  });
  const ev = (over = {}) => ({
    id: 'e1',
    skill: 'cand',
    kind: 'static-assessment',
    date: '2026-10-30',
    assessor: 'a',
    revision: SHA,
    contentHash: H,
    scope: 's',
    comparison: { status: 'not-run', summary: 's' },
    recommendation: 'review',
    ...over,
  });
  const errs = (raw: unknown) => {
    const r = buildCatalog(raw);
    return r.ok ? '' : r.errors.join('\n');
  };
  const reg = (evaluations: unknown[], extra = {}) => ({
    skills: [skill()],
    consumers: [],
    integrations: [],
    evaluations,
    ...extra,
  });

  it('a static assessment can never claim an agent comparison or cite run evidence', () => {
    expect(errs(reg([ev()]))).toBe('');
    expect(errs(reg([ev({ comparison: { status: 'run', summary: 's' } })]))).toMatch(
      /cannot report an agent comparison as run/,
    );
    expect(errs(reg([ev({ evidence: ['x'] })]))).toMatch(/cannot cite agent-run evidence/);
  });

  it('an agent-run evaluation must cite existing evidence for this skill', () => {
    expect(
      errs(reg([ev({ kind: 'agent-run', comparison: { status: 'run', summary: 's' } })])),
    ).toMatch(/must cite evidence records/);
    expect(
      errs(
        reg([
          ev({
            kind: 'agent-run',
            comparison: { status: 'run', summary: 's' },
            evidence: ['ghost'],
          }),
        ]),
      ),
    ).toMatch(/unknown evidence "ghost"/);
  });

  it('must pin the revision and hash it covers, and "keep-approved" needs an approved skill', () => {
    expect(errs(reg([ev({ revision: undefined })]))).toMatch(
      /must record the revision and contentHash/,
    );
    expect(errs(reg([ev({ recommendation: 'keep-approved' })]))).toMatch(
      /applies only to an approved skill/,
    );
    expect(errs(reg([ev(), ev()]))).toMatch(/duplicate evaluation id: e1/);
  });

  it('the real registry: 11 static assessments, none claiming a run, none changing an approval', () => {
    const root = resolve(__dirname, '../../..');
    const read = (n: string) =>
      JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8'));
    const r = buildCatalog({
      skills: read('skills'),
      consumers: read('consumers'),
      integrations: read('integrations'),
      evidence: read('evidence'),
      sources: read('sources'),
      releases: read('releases'),
      evaluations: read('evaluations'),
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.catalog.evaluations).toHaveLength(11);
    for (const e of r.catalog.evaluations) {
      expect(e.kind, e.id).toBe('static-assessment');
      expect(e.comparison.status, e.id).toBe('not-run');
      const s = r.catalog.skills.find((x) => x.id === e.skill)!;
      expect(e.revision, e.id).toBe(s.source.type === 'external' ? s.source.revision : undefined);
    }
    expect(
      r.catalog.skills
        .filter((s) => s.review.status === 'approved')
        .map((s) => s.id)
        .sort(),
    ).toEqual([
      'caveman',
      'frontend-design',
      'grilling',
      'ponytail',
      'verification-before-completion',
      'writing-plans',
    ]);
    const wq = r.catalog.evaluations.find((e) => e.skill === 'web-quality-core-web-vitals')!;
    expect(wq.blockers.join(' ')).toMatch(/\.\.\/performance/);
  });
});

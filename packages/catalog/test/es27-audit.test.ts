import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/consumers.ts';
import { llmsTxt, resourceExportToJson } from '../src/public.ts';
import {
  REVIEW_CATEGORIES,
  REVIEW_SCOPES,
  type Catalog,
  type Resource,
  type Skill,
} from '../src/schema.ts';
import { buildCatalog } from '../src/validate.ts';

/*
 * ES27 security audit: a structured, revision-pinned audit can be attached to a skill review or a resource's security
 * record. It records findings and a recommendation; it never approves, installs or assigns anything.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const reg = loadRegistry(ROOT);
const catalog: Catalog = reg.catalog;
type Raw = Record<string, unknown[]> & { skills: Skill[]; resources: Resource[] };
const raw = () => structuredClone(reg.raw) as Raw;
const errorsOf = (r: ReturnType<typeof buildCatalog>) => (r.ok ? [] : r.errors);

const ES26_CANDIDATES = [
  'bots',
  'ae-editable-project',
  'fact-checker',
  'stack-architect',
  'onetake',
  'gbro-collage-broll',
  'antislop',
  'antislop-code',
  'antislop-copywriting',
  'antislop-human',
  'antislop-layoutmobile',
  'antislop-ui',
  'directing-stickman-videos',
  'appllama-app-design-skill',
  'appllama-usage',
];
const AUDITED_RESOURCES = [
  'antislop-contrast-mcp',
  'appllama-mcp',
  'google-developer-knowledge-mcp',
  'hyperframes-mcp-connector',
  'spec-kit-mcp',
  'gstack',
  'spec-kit',
  'claude-code-game-studios',
  'claude-animation-base',
  'hyperframes-framework',
];
const allChecks = (result = 'no-issue-found') =>
  REVIEW_CATEGORIES.flatMap((category) =>
    REVIEW_SCOPES.map((scope) => ({ category, scope, result })),
  );

/** A skill with a valid complete audit, built from an unaudited ES26 candidate. */
function audited(r: Raw, id = 'antislop-code') {
  const s = r.skills.find((x) => x.id === id)!;
  if (s.source.type !== 'external') throw new Error('external expected');
  s.review = {
    status: 'reviewed',
    reviewedAt: '2026-11-08',
    reviewer: 'test',
    revision: s.source.revision,
    contentHash: s.discovery!.contentHash,
    findings: [],
    audit: {
      round: 'ES27',
      completeness: 'complete',
      scope: 'everything',
      recommendation: 'controlled-evaluation',
      rationale: 'test',
      issues: [],
      checks: allChecks() as never,
    },
  };
  return s;
}

describe('ES27 audit rules at the registry boundary', () => {
  it('accepts a complete, revision-pinned audit', () => {
    const input = raw();
    audited(input);
    expect(errorsOf(buildCatalog(input))).toEqual([]);
  });

  it('rejects audits that would overstate what was reviewed or imply a decision', () => {
    const cases: [string, (r: Raw) => void, RegExp][] = [
      [
        'audit on an unreviewed skill',
        (r) => (audited(r).review.status = 'unreviewed'),
        /review status must be "reviewed"/,
      ],
      [
        'approval on a partial audit',
        (r) => {
          const s = audited(r);
          s.review.audit!.completeness = 'partial';
          s.review.audit!.recommendation = 'defer';
          s.review.status = 'approved';
          s.review.approvedBy = 'x';
        },
        /approved on a partial audit/,
      ],
      [
        'complete audit missing a category',
        (r) => audited(r).review.audit!.checks.pop(),
        /must address tool-permissions\/supporting-files/,
      ],
      [
        'complete audit with an unevaluated check',
        (r) => (audited(r).review.audit!.checks[0]!.result = 'not-evaluated'),
        /cannot leave checks "not-evaluated"/,
      ],
      [
        'controlled evaluation on a partial audit',
        (r) => (audited(r).review.audit!.completeness = 'partial'),
        /needs a complete audit/,
      ],
      [
        'controlled evaluation with a high finding',
        (r) =>
          audited(r).review.audit!.issues.push({
            severity: 'high',
            title: 't',
            evidence: 'e',
          }),
        /not possible with open critical or high findings/,
      ],
      [
        'audit of different content',
        (r) => (audited(r).review.contentHash = `sha256-${'0'.repeat(64)}`),
        /the audit covers sha256-0+ but discovery recorded/,
      ],
      [
        'audit of a different revision',
        (r) => (audited(r).review.revision = 'f'.repeat(40)),
        /review covers revision f+ but source pins/,
      ],
      [
        'duplicate check',
        (r) => {
          const a = audited(r).review.audit!;
          a.checks.push({ ...a.checks[0]! });
        },
        /listed more than once/,
      ],
      [
        'an "approved" recommendation',
        (r) =>
          ((audited(r).review.audit as { recommendation: string }).recommendation = 'approved'),
        /recommendation/,
      ],
    ];
    for (const [name, mutate, re] of cases) {
      const input = raw();
      mutate(input);
      expect(errorsOf(buildCatalog(input)).join('\n'), name).toMatch(re);
    }
  });

  it('a resource is "reviewed" only with a complete audit of its pinned revision', () => {
    const mk = (r: Raw, completeness: 'complete' | 'partial') => {
      const x = r.resources.find((y) => y.id === 'cannon-es')!;
      const src = (r.sources as { id: string; revision?: string }[]).find(
        (s) => s.id === x.source,
      )!;
      x.security = {
        status: completeness === 'complete' ? 'reviewed' : 'notes-recorded',
        concerns: ['c'],
        audit: {
          round: 'ES27',
          completeness,
          scope: 's',
          recommendation: 'reference-only',
          rationale: 'r',
          issues: [],
          checks: [],
          reviewedAt: '2026-11-08',
          reviewer: 'test',
          revision: src.revision!,
        },
      };
      return x;
    };
    let input = raw();
    mk(input, 'complete');
    expect(errorsOf(buildCatalog(input))).toEqual([]);
    input = raw();
    mk(input, 'partial');
    expect(errorsOf(buildCatalog(input))).toEqual([]);
    const cases: [string, (r: Raw) => void, RegExp][] = [
      [
        'reviewed on a partial audit',
        (r) => (mk(r, 'partial').security.status = 'reviewed'),
        /needs a complete audit/,
      ],
      [
        'reviewed without any audit',
        (r) => {
          const x = mk(r, 'complete');
          delete x.security.audit;
        },
        /needs a complete audit/,
      ],
      [
        'audit marked not-reviewed',
        (r) => (mk(r, 'partial').security.status = 'not-reviewed'),
        /cannot be "not-reviewed"/,
      ],
      [
        'other revision',
        (r) => (mk(r, 'complete').security.audit!.revision = 'a'.repeat(40)),
        /audit covers a+ but the source pins/,
      ],
      [
        'complete without revision',
        (r) => delete mk(r, 'complete').security.audit!.revision,
        /names the revision it read/,
      ],
    ];
    for (const [name, mutate, re] of cases) {
      const i = raw();
      mutate(i);
      expect(errorsOf(buildCatalog(i)).join('\n'), name).toMatch(re);
    }
  });
});

describe('ES27 audit in the real registry', () => {
  const skills = new Map(catalog.skills.map((s) => [s.id, s]));

  it('every ES26 candidate skill carries an ES27 audit pinned to its registered revision and content', () => {
    for (const id of ES26_CANDIDATES) {
      const s = skills.get(id)!;
      expect(s.review.audit?.round, id).toBe('ES27');
      expect(s.review.status, id).toBe('reviewed');
      if (s.source.type !== 'external') throw new Error(id);
      expect(s.review.revision, id).toBe(s.source.revision);
      expect(s.review.contentHash, id).toBe(s.discovery!.contentHash);
      expect(s.review.audit!.checks.length, id).toBe(26);
    }
  });

  it('every audited resource has an ES27 audit; hosted services without source are never "reviewed"', () => {
    for (const id of AUDITED_RESOURCES) {
      const r = catalog.resources.find((x) => x.id === id)!;
      expect(r.security.audit?.round, id).toBe('ES27');
      if (!r.security.audit!.revision) {
        expect(r.security.audit!.completeness, id).toBe('partial');
        expect(r.security.status, id).toBe('notes-recorded');
      }
    }
  });

  it('the audit approved, installed and assigned nothing', () => {
    const approved = catalog.skills.filter((s) => s.review.status === 'approved').map((s) => s.id);
    expect(approved.sort()).toEqual(
      [
        'caveman',
        'frontend-design',
        'grilling',
        'ponytail',
        // Owner-authorized for Xpenz on 2026-11-09, after the audit; the audit itself approved nothing.
        'threejs-asset-pipeline',
        'threejs-lighting',
        'threejs-loaders',
        'threejs-react-three-fiber',
        'verification-before-completion',
        'writing-plans',
      ].sort(),
    );
    expect(catalog.releases.every((r) => r.approval.status === 'unapproved')).toBe(true);
    const assigned = new Set(catalog.consumers.flatMap((c) => c.assignments.map((a) => a.skill)));
    for (const id of ES26_CANDIDATES) expect(assigned.has(id), id).toBe(false);
  });

  it('public outputs carry the audit with its non-approval wording and no local paths', () => {
    const llms = llmsTxt(catalog);
    expect(llms).toContain('Review completeness (complete / partial)');
    expect(llms).toMatch(
      /audit ES27: review (complete|incomplete), recommendation [a-z-]+ \(not an approval\)/,
    );
    const json = resourceExportToJson(catalog);
    expect(json).toContain('"round": "ES27"');
    for (const out of [llms, json, JSON.stringify(catalog)])
      expect(out).not.toMatch(/\/Users\/|\/private\/tmp|scratchpad|\/home\//);
  });
});

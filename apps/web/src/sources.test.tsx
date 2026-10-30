import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import {
  filterSkills,
  filterSources,
  hasDiscoveryWarnings,
  parseRoute,
  sourceTreeUrl,
  stage,
  type Route,
} from './lib.ts';

const root = resolve(__dirname, '../../..');
const read = (n: string) =>
  JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8')) as unknown;
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
const catalog: Catalog = built.catalog;
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
const html = (route: Route) =>
  renderToString(
    <I18nProvider>
      <Page route={route} catalog={catalog} />
    </I18nProvider>,
  );

describe('Sources page', () => {
  it('has a clean route and renders every source once, grouped by batch', () => {
    expect(parseRoute('/sources')).toEqual({ page: 'sources' });
    expect(parseRoute('/sources/')).toEqual({ page: 'sources' });
    const out = html({ page: 'sources' });
    for (const x of catalog.sources) expect(out, x.id).toContain(`id="${x.id}"`);
    expect(text(out)).toContain(`${catalog.sources.length} of ${catalog.sources.length} sources`);
  });

  it('tells reference-only and unresolved sources apart from registered ones', () => {
    const out = text(html({ page: 'sources' }));
    expect(out).toContain('Reference only');
    expect(out).toContain('Unresolved');
    expect(out).toContain('Registered with warnings');
    // anti-slop-unresolved was resolved by the owner in ES26; Neuform AI remains an unresolved lead
    const lead = catalog.sources.find((x) => x.id === 'neuform-ai')!;
    expect(lead.skills).toEqual([]);
    expect(lead.needs).toBeTruthy();
  });

  it('filters by decision, kind and text', () => {
    const ref = filterSources(catalog, { decision: 'reference-only' });
    expect(ref.length).toBeGreaterThan(0);
    expect(ref.every((x) => x.skills.length === 0)).toBe(true);
    expect(filterSources(catalog, { q: 'hallmark' }).map((x) => x.id)).toContain(
      'nutlope-hallmark',
    );
    expect(filterSources(catalog, { kind: 'standard' }).map((x) => x.id)).toEqual([
      'agentskills-standard',
    ]);
  });
});

/** Discovered skills the owner approved for the Xpenz consumer (M0.6 onboarding, 2026-11-09). Exact list: any other approval fails. */
const XPENZ_APPROVED = [
  'threejs-asset-pipeline',
  'threejs-lighting',
  'threejs-loaders',
  'threejs-react-three-fiber',
];

describe('discovered candidates', () => {
  const discovered = catalog.skills.filter((s) => s.discovery);

  it('are external, unapproved and never installed or assigned by registration', () => {
    expect(discovered.length).toBeGreaterThan(100);
    for (const s of discovered) {
      expect(s.origin, s.id).toBe('external');
      if (XPENZ_APPROVED.includes(s.id)) {
        // Approved by the owner for exactly the reviewed bytes, assigned to the Xpenz consumer only, never given evidence.
        expect(stage(s), s.id).toBe('approved');
        expect(s.review.approvedBy, s.id).toMatch(/^Owner/);
        expect(s.review.contentHash, s.id).toBe(s.discovery!.contentHash);
        expect(
          catalog.consumers
            .filter((c) => c.assignments.some((a) => a.skill === s.id))
            .map((c) => c.id),
          s.id,
        ).toEqual(['web-xpenz']);
        expect(catalog.evidence.some((e) => e.skill === s.id)).toBe(false);
        continue;
      }
      // ES27 audited some candidates: "reviewed" records findings and only ever with that audit; nothing is approved.
      const audited = s.review.audit?.round === 'ES27';
      expect(s.review.status, s.id).toBe(audited ? 'reviewed' : 'unreviewed');
      expect(s.review.approvedBy, s.id).toBeUndefined();
      expect(stage(s), s.id).toBe(audited ? 'reviewed' : 'discovered');
      expect(catalog.consumers.flatMap((c) => c.assignments).some((a) => a.skill === s.id)).toBe(
        false,
      );
      expect(catalog.evidence.some((e) => e.skill === s.id)).toBe(false);
    }
  });

  it('show up under the "Candidate · discovered" status filter, not under Approved', () => {
    const d = filterSkills(catalog, { status: 'discovered' });
    const r = filterSkills(catalog, { status: 'reviewed' });
    const a = filterSkills(catalog, { status: 'approved' });
    for (const s of discovered.filter((x) => !XPENZ_APPROVED.includes(x.id)))
      expect(
        (s.review.audit ? r : d).map((x) => x.id),
        s.id,
      ).toContain(s.id);
    for (const s of discovered.filter((x) => !XPENZ_APPROVED.includes(x.id)))
      expect(a.map((x) => x.id)).not.toContain(s.id);
    // The four owner-approved skills are listed as Approved and as neither kind of candidate.
    for (const id of XPENZ_APPROVED) {
      expect(a.map((x) => x.id)).toContain(id);
      expect(d.map((x) => x.id)).not.toContain(id);
      expect(r.map((x) => x.id)).not.toContain(id);
    }
  });

  it('every skill page shows its discovery audit, warnings and the source link', () => {
    const warned = discovered.find(hasDiscoveryWarnings)!;
    const out = text(html({ page: 'skill', id: warned.id }));
    expect(out).toContain('Discovery scan');
    expect(out).toContain('Registered with warnings');
    expect(out).toContain(warned.discovery!.warnings[0]!.slice(0, 30));
    expect(html({ page: 'skill', id: warned.id })).toContain(
      `/sources#${warned.discovery!.source}`,
    );
    const clean = discovered.find((s) => !hasDiscoveryWarnings(s))!;
    expect(text(html({ page: 'skill', id: clean.id }))).toContain('Registered for review');
  });

  it('the skills list marks candidates that carry warnings', () => {
    expect(text(html({ page: 'skills' }))).toContain('Has warnings');
  });

  it('links a root-level skill to the repository tree at its pinned revision', () => {
    const root = catalog.skills.find((s) => s.source.type === 'external' && s.source.path === '.')!;
    expect(root).toBeTruthy();
    expect(sourceTreeUrl(root)).toMatch(/\/tree\/[0-9a-f]{40}$/);
  });
});

describe('existing registry facts are preserved', () => {
  it('keeps the six originally approved skills (plus the four authorized for Xpenz) and their verified assignments', () => {
    const approved = catalog.skills.filter((s) => s.review.status === 'approved').map((s) => s.id);
    expect(approved.sort()).toEqual(
      [
        'caveman',
        'frontend-design',
        'grilling',
        'ponytail',
        ...XPENZ_APPROVED,
        'verification-before-completion',
        'writing-plans',
      ].sort(),
    );
    expect(catalog.consumers.flatMap((c) => c.assignments).length).toBeGreaterThan(0);
    // The 24 records of ES6 to ES9.3 (up to 2026-10-27) are intact; later runs add exactly the four Gateway `gui*` records.
    expect(catalog.evidence.filter((e) => e.date <= '2026-10-30')).toHaveLength(24);
    expect(
      catalog.evidence
        .filter((e) => e.date > '2026-10-30')
        .map((e) => e.id)
        .sort(),
    ).toEqual([
      'gui12-verification-before-completion-claude-code-gateway',
      'gui12-verification-before-completion-codex-gateway',
      'gui2-gateway-mobile-checklist-claude-code-gateway',
      'gui2-gateway-mobile-checklist-codex-gateway',
    ]);
  });
});

describe('warnings and blockers are never hidden', () => {
  const discovered = catalog.skills.filter((s) => s.discovery);
  it('every warning, dependency and approval blocker appears on the skill page', () => {
    for (const s of discovered) {
      const out = text(html({ page: 'skill', id: s.id }));
      for (const w of s.discovery!.warnings)
        expect(out, `${s.id}: ${w.slice(0, 40)}`).toContain(w.replace(/"/g, '"'));
      for (const b of s.discovery!.approvalBlockers) expect(out, s.id).toContain(b);
      for (const d of s.discovery!.dependencies) expect(out, s.id).toContain(d);
      if (s.discovery!.approvalBlockers.length)
        expect(out).toContain('Must be resolved before approval');
      if (XPENZ_APPROVED.includes(s.id)) {
        // Warnings above are still shown for an approved skill; it just must no longer read as a candidate.
        expect(out, s.id).toContain('Approved');
        expect(out, s.id).not.toMatch(/Candidate · discovered|Candidate · reviewed/);
      } else if (s.review.audit) {
        // ES27: an audited candidate is "reviewed" and its review completeness is always stated.
        expect(out, s.id).toContain('Candidate · reviewed');
        expect(out, s.id).toContain(
          s.review.audit.completeness === 'complete' ? 'Review complete' : 'Review incomplete',
        );
        expect(out, s.id).not.toMatch(/Candidate · discovered|>Approved</);
      } else {
        expect(out, s.id).toContain('Candidate · discovered');
        expect(out, s.id).not.toMatch(/Candidate · reviewed|>Approved</);
      }
      expect(out, s.id).toContain(s.license ?? 'unknown');
    }
  });

  it('the scan is never called an audit or approval on the page', () => {
    const out = text(html({ page: 'skill', id: 'impeccable' }));
    expect(out).toContain('Discovery scan');
    expect(out).toContain('not a review');
    expect(out).not.toContain('Discovery audit');
    expect(out).toContain('not a security audit');
  });

  it('source cards show source-level warnings and per-source warning counts', () => {
    const out = text(html({ page: 'sources' }));
    for (const x of catalog.sources)
      for (const w of x.warnings) expect(out, x.id).toContain(w.replace(/"/g, '"').slice(0, 60));
    expect(out).toContain('Skills with warnings / approval blockers');
  });

  it('reference-only and unresolved sources never list skills or claim to be installable', () => {
    for (const x of catalog.sources.filter((y) =>
      ['reference-only', 'unresolved'].includes(y.decision),
    )) {
      const card = html({ page: 'sources' }).split(`id="${x.id}"`)[1]!.split('</li>')[0]!;
      expect(card, x.id).not.toContain('Registered skills');
      expect(card, x.id).not.toMatch(/href="\/skills\//);
    }
  });

  it('approved skills stay distinguishable from candidates', () => {
    for (const s of catalog.skills.filter((x) => x.review.status === 'approved')) {
      const out = text(html({ page: 'skill', id: s.id }));
      expect(out, s.id).toContain('Approved');
      expect(out, s.id).not.toMatch(/Candidate · discovered|Candidate · reviewed/);
      // Skills that were never discovered carry no discovery scan. An approved skill that was discovered keeps its provenance.
      if (!s.discovery) expect(out, s.id).not.toContain('Discovery scan');
    }
  });
});

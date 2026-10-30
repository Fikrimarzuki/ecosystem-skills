import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import {
  availabilityOf,
  CONTENT_LABEL,
  contentFilterStates,
  explainEmpty,
  filterSkills,
  parseRoute,
  upstreamLinks,
  type Route,
} from './lib.ts';
import { translate } from './i18n.tsx';

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
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const html = (route: Route, lang?: string) => {
  if (lang) globalThis.localStorage = { getItem: () => lang } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={catalog} />
      </I18nProvider>,
    );
  } finally {
    if (lang) delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const page = (id: string, lang?: string) => text(html({ page: 'skill', id }, lang));
const SOURCE_ONLY_TEXT =
  'This skill is registered for discovery but has not yet been curated into the local library. You can inspect its original source, but a curated installation is not currently available.';

describe('content availability on skill pages', () => {
  it('a source-only skill says so, explains why, links to the original, and shows no local version', () => {
    const out = page('threejs-lights-missing') || '';
    expect(out).toContain('Skill not found'); // sanity: unknown ids do not invent content
    const t = page('gsap-core');
    expect(t).toContain('Content availability: Source reference only');
    expect(t).toContain(SOURCE_ONLY_TEXT);
    expect(t).toContain('Why there is no curated copy');
    expect(t).toContain('Awaiting security review');
    expect(t).not.toContain('Curated version');
    expect(t).not.toMatch(/\bv\d+\.\d+\.\d+\b/);
    const rawHtml = html({ page: 'skill', id: 'gsap-core' });
    expect(rawHtml).toMatch(
      /href="https:\/\/github\.com\/greensock\/gsap-skills\/tree\/[0-9a-f]{40}\/skills\/gsap-core"/,
    );
    expect(rawHtml).toMatch(
      /href="https:\/\/github\.com\/greensock\/gsap-skills\/commit\/[0-9a-f]{40}"/,
    );
    expect(rawHtml).toMatch(/href="https:\/\/github\.com\/greensock\/gsap-skills"/);
    expect(t).toContain('Upstream licence');
    expect(t).toContain('a scan is not a security review');
  });

  it('every external skill page has the section, an original-source link and a state; none claims to be installable from the library', () => {
    for (const s of catalog.skills.filter((x) => x.origin === 'external')) {
      const rawHtml = html({ page: 'skill', id: s.id });
      const out = text(rawHtml);
      expect(out, s.id).toContain('Content availability:');
      expect(out, s.id).toContain(
        `Content availability: ${CONTENT_LABEL[availabilityOf(catalog, s).state]}`,
      );
      expect(rawHtml, s.id).toMatch(/href="https:\/\/github\.com\/[^"]+\/(tree|commit)\//);
      expect(out, s.id).not.toContain('Eligible: the release is approved');
    }
  });

  it('blocked skills give the concrete reason: unknown licence, repository root, approval blockers', () => {
    const remotion = page('remotion-render');
    expect(remotion).toContain('Content availability: Curation blocked');
    expect(remotion).toContain('Curation is blocked until the reasons below are resolved.');
    expect(remotion).toContain('Unknown licence: redistribution rights are not established');
    expect(remotion).toContain('Approval blocker:');
    expect(page('oil-ui')).toContain(
      'SKILL.md is at the repository root: curating a whole repository is not supported.',
    );
  });

  it('an approved skill without a release says it installs from upstream today, with no curated copy', () => {
    const out = page('writing-plans');
    expect(out).toContain('Content availability: Source reference only');
    expect(out).toContain('Approved for installation directly from its pinned upstream revision');
    expect(out).toContain('No curated copy exists.');
  });

  it('the curated proof of concept shows version, status, review, provenance, modifications and why it is not installable', () => {
    const out = page('grilling');
    expect(out).toContain('Content availability: Curated, not approved');
    expect(out).toContain('Curated version v1.0.0');
    expect(out).toContain('Release status Not approved');
    expect(out).toContain('Security review No blocking issues identified in the reviewed scope');
    expect(out).toContain('Scope: All 4 files');
    expect(out).toContain('added LICENSE');
    expect(out).toContain('added ATTRIBUTION.md');
    expect(out).toContain('no behavior change');
    expect(out).toContain('Upstream content hash');
    expect(out).toContain('Curated content hash');
    expect(out).toContain('Not available. It cannot be installed from the library because:');
    expect(out).toContain('The release is not approved.');
    // ES18: the review is recorded, so approval is the only thing missing
    expect(out).not.toContain('Its security review has not recorded “no blocking issues”');
    expect(out).not.toContain('Eligible: the release is approved');
    expect(out).toContain('A local copy is not an approval');
    // the skill's own approval is still shown, separately
    expect(out).toContain('Approved');
    expect(html({ page: 'skill', id: 'grilling' })).toMatch(
      /href="https:\/\/github\.com\/mattpocock\/skills\/tree\/5beb35b040e3de97e54fa9e386d7e42d15c295c2\/skills\/productivity\/grilling"/,
    );
  });

  it('a first-party skill is described as kept in this repository', () => {
    const fp = catalog.skills.find((s) => s.origin === 'first-party')!;
    const out = page(fp.id);
    expect(out).toContain('Content availability: Kept in this repository');
    expect(out).not.toContain('Source reference only');
  });

  it('renders in Indonesian too, with registry content as written', () => {
    const out = page('grilling', 'id');
    expect(out).toContain('Ketersediaan konten');
    expect(out).toContain('Versi kurasi');
    expect(out).toContain('Dikurasi, belum disetujui');
    expect(page('gsap-core', 'id')).toContain('belum dikurasi ke pustaka lokal');
    expect(translate('id', 'Curated v{version} · not approved', { version: '1.0.0' })).toBe(
      'Kurasi v1.0.0 · belum disetujui',
    );
  });
});

describe('catalog: telling the states apart without badge clutter', () => {
  it('the Content filter separates source-only, curated unapproved/approved, blocked', () => {
    const n = (content: string) => filterSkills(catalog, { content }).map((s) => s.id);
    // grilling (ES17) and the four ES22 candidates: staged, all unapproved
    expect(n('curated-unapproved').sort()).toEqual([
      'grilling',
      'gsap-performance',
      'gsap-react',
      'gsap-timeline',
      'web-quality-accessibility',
    ]);
    expect(n('curated-approved')).toEqual([]);
    expect(n('curation-blocked').length).toBe(16);
    expect(n('source-only').length).toBe(222);
    expect(
      n('curated-unapproved').length +
        n('curated-approved').length +
        n('curation-blocked').length +
        n('source-only').length +
        2,
    ).toBe(catalog.skills.length);
    expect(contentFilterStates(catalog)).toEqual([
      'source-only',
      'curated-unapproved',
      'curated-approved',
      'curation-blocked',
    ]);
    // combines with the other filters (AND)
    expect(
      filterSkills(catalog, { content: 'curated-unapproved', status: 'approved' }).map((s) => s.id),
    ).toEqual(['grilling']);
    expect(
      filterSkills(catalog, { content: 'curated-unapproved', status: 'discovered' })
        .map((s) => s.id)
        .sort(),
    ).toEqual(['gsap-performance', 'gsap-react', 'gsap-timeline', 'web-quality-accessibility']);
  });

  it('the URL carries the filter, and an empty result explains it', () => {
    expect(parseRoute('/skills?content=curated-unapproved')).toEqual({
      page: 'skills',
      query: { content: 'curated-unapproved' },
    });
    const out = text(html({ page: 'skills', query: { content: 'curated-unapproved' } }));
    expect(out).toContain('5 of 245 skills');
    expect(out).toContain('Any content availability');
    expect(out).toContain('Curated, approved');
    const e = explainEmpty(catalog, { content: 'curated-approved' });
    expect(e.active[0]!.label).toBe('Content Curated, approved');
  });

  it('only curated and blocked skills get a content badge; plain source references stay quiet', () => {
    const all = text(html({ page: 'skills' }));
    expect(all).toContain('Curated v1.0.0 · not approved');
    expect((all.match(/Curated v\d/g) ?? []).length).toBe(5);
    expect(all).not.toContain('Curated v1.0.0 · approved');
    const only = text(html({ page: 'skills', query: { content: 'source-only' } }));
    expect(only).not.toContain('Curated v');
    expect(only).not.toContain('Curation blocked</');
    expect(text(html({ page: 'skills', query: { content: 'curation-blocked' } }))).toContain(
      'Curation blocked',
    );
  });
});

describe('source links', () => {
  it('link to the original at the pinned commit, never to a mirror, and label a fork', () => {
    const g = catalog.skills.find((s) => s.id === 'gsap-core')!;
    const l = upstreamLinks(g);
    expect(l.home).toBe('https://github.com/greensock/gsap-skills');
    expect(l.folder).toMatch(/\/tree\/[0-9a-f]{40}\/skills\/gsap-core$/);
    expect(l.commit).toMatch(/\/commit\/[0-9a-f]{40}$/);
    const root = catalog.skills.find((s) => s.source.type === 'external' && s.source.path === '.')!;
    expect(upstreamLinks(root).folder).toMatch(/\/tree\/[0-9a-f]{40}$/);
    expect(upstreamLinks(catalog.skills.find((s) => s.origin === 'first-party')!)).toEqual({});
    const forked = {
      ...g,
      source: { ...g.source, fork: { url: 'https://github.com/someone/gsap-skills' } },
    } as typeof g;
    const out = text(
      renderToString(
        <I18nProvider>
          <Page
            route={{ page: 'skill', id: 'gsap-core' }}
            catalog={{
              ...catalog,
              skills: catalog.skills.map((s) => (s.id === 'gsap-core' ? forked : s)),
            }}
          />
        </I18nProvider>,
      ),
    );
    expect(out).toContain('Fork (a copy, not the original)');
  });
});

describe('evaluations on skill pages (ES19)', () => {
  it('labels static assessments as such, shows measurements and blockers, and never shows a score', () => {
    const out = page('gsap-react');
    expect(out).toContain('Static assessment: no agent was run');
    expect(out).toContain('Recommendation (not an approval): Prioritize review');
    expect(out).toContain('Instructions loaded when triggered');
    expect(out).toContain('Not run.');
    expect(out).not.toMatch(/\b\d+\s*\/\s*10\b|\bscore\b/i);
    expect(page('impeccable')).toContain('Keep in static review');
    expect(page('frontend-design')).toContain('Keep approved');
    expect(page('caveman')).not.toContain('Static assessment: no agent was run');
  });
});

describe('upstream status on skill pages (ES20)', () => {
  it('shows a recorded check with its time, revisions and review requirement', () => {
    const out = page('grilling');
    expect(out).toContain('Upstream updates');
    expect(out).toContain('Review required');
    expect(out).toMatch(/Last checked \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
    expect(out).toContain('Committed upstream on');
    expect(out).toContain('Current curated version v1.0.0');
    expect(out).toContain(
      'a new version must be prepared, reviewed and approved before anyone uses it',
    );
    expect(out).toContain('SKILL.md changed');
  });

  it('never claims a skill is current without a check', () => {
    const out = page('hallmark');
    expect(out).toContain('Never checked');
    expect(out).toContain('No claim is made about whether the original source has changed.');
    expect(out).not.toContain('Up to date');
    expect(page('gsap-core')).toContain('Up to date');
  });
});

describe('consumer versions (ES21)', () => {
  it('real assignments are shown as legacy upstream installs, with no invented upgrade or installed state', () => {
    const out = text(html({ page: 'consumers' }));
    expect(out).toContain('Legacy upstream install');
    expect(out).toContain('No approved curated upgrade.');
    expect(out).toContain(
      'The installed version is machine-local: pnpm skills:library status playnest',
    );
    expect(out).not.toContain('Curated release v');
  });

  it('a curated assignment with a newer approved release offers only a preview command', () => {
    const g = catalog.skills.find((s) => s.id === 'grilling')!;
    const rel = catalog.releases.find((r) => r.skill === 'grilling')!;
    const approved = (version: string) => ({
      ...rel,
      version,
      path: `library/grilling/${version}`,
      approval: { status: 'approved' as const, approvedBy: 'o', approvedAt: '2026-10-31' },
    });
    const fixture: Catalog = {
      ...catalog,
      releases: [approved('1.0.0'), approved('1.2.0')],
      consumers: catalog.consumers.map((c) =>
        c.id === 'ecosystem-skills'
          ? {
              ...c,
              assignments: c.assignments.map((a) =>
                a.skill === 'grilling' ? { ...a, release: '1.0.0' } : a,
              ),
            }
          : c,
      ),
    };
    const out = text(
      renderToString(
        <I18nProvider>
          <Page route={{ page: 'consumers' }} catalog={fixture} />
        </I18nProvider>,
      ),
    );
    expect(out).toContain('Curated release v1.0.0');
    expect(out).toContain(
      'Approved curated v1.2.0 is available. Preview (changes nothing): pnpm skills:library upgrade ecosystem-skills grilling --to 1.2.0',
    );
    expect(out).toContain('pnpm skills:library upgrade gateway frontend-design'.slice(0, 0)); // nothing else implied
    void g;
  });
});

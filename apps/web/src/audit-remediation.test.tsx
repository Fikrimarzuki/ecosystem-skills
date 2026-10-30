import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  REVIEW_CATEGORIES,
  REVIEW_SCOPES,
  type Catalog,
  type Release,
} from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import { availabilityOf, filterSkills } from './lib.ts';

/*
 * Audit remediation F6: a first-party skill with a curated release is presented by that release (review, provenance,
 * evidence, availability), and the restricted-installation message stays accurate. The releases are synthetic and
 * exist only in this test's catalog; nothing is staged or approved in the registry.
 */
const repo = resolve(__dirname, '../../..');
const read = (n: string) =>
  JSON.parse(readFileSync(join(repo, 'registry', `${n}.json`), 'utf8')) as unknown;
const raw = {
  skills: read('skills'),
  consumers: read('consumers'),
  integrations: read('integrations'),
  evidence: read('evidence'),
  sources: read('sources'),
  releases: read('releases') as unknown[],
  evaluations: read('evaluations'),
  updates: read('updates'),
};
/** Every catalog here goes through the real validator, so fixtures are schema- and rule-valid. */
const valid = (r: typeof raw): Catalog => {
  const b = buildCatalog(r);
  if (!b.ok) throw new Error(b.errors.join('\n'));
  return b.catalog;
};
const base: Catalog = valid(raw);
const HASH = `sha256-${'d'.repeat(64)}`;

function withRelease(status: Release['approval']['status'], skill = 'ecosystem-config'): Catalog {
  const release = {
    skill,
    version: '1.0.0',
    createdAt: '2026-10-31',
    path: `library/${skill}/1.0.0`,
    curatedHash: HASH,
    license: 'Proprietary',
    attribution: 'Owner',
    review: {
      outcome: 'no-blocking-issues',
      reviewer: 'Reviewer',
      reviewedAt: '2026-10-31',
      scope: 'all files',
      contentHash: HASH,
      checks: REVIEW_CATEGORIES.flatMap((category) =>
        REVIEW_SCOPES.map((scope) => ({ category, scope, result: 'no-issue-found' })),
      ),
      evidence: [{ method: 'manual-read', summary: 'read' }],
    },
    approval:
      status === 'unapproved'
        ? { status }
        : { status, approvedBy: 'Owner', approvedAt: '2026-10-31' },
    supportedAgents: ['claude-code'],
  };
  return valid({ ...raw, releases: [...raw.releases, release] });
}
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const page = (c: Catalog, id: string, lang?: string) => {
  if (lang) globalThis.localStorage = { getItem: () => lang } as unknown as Storage;
  try {
    return text(
      renderToString(
        <I18nProvider>
          <Page route={{ page: 'skill', id }} catalog={c} />
        </I18nProvider>,
      ),
    );
  } finally {
    if (lang) delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};

describe('F6 first-party curated releases on the website', () => {
  it('an approved release: state, review, provenance, evidence and the restricted install message', () => {
    const c = withRelease('approved');
    expect(
      availabilityOf(
        c,
        c.skills.find((s) => s.id === 'ecosystem-config')!,
      ).state,
    ).toBe('curated-approved');
    const t = page(c, 'ecosystem-config');
    expect(t).toContain('Content availability: Curated, approved');
    expect(t).toContain(
      'This skill is authored in this repository, at skills/shared/ecosystem-config.',
    );
    expect(t).toContain('Curated version v1.0.0');
    expect(t).toContain('Security review No blocking issues identified in the reviewed scope');
    expect(t).toContain(
      'Provenance First-party: made from content authored in this repository; there is no upstream.',
    );
    expect(t).toContain('Recorded modifications None recorded.');
    expect(t).not.toContain('identical to upstream');
    expect(t).toContain('Evidence by type');
    expect(t).toContain('Approved by Owner on 2026-10-31');
    expect(t).toContain(
      'This skill is restricted: installing also needs an explicit private authorization for the project, version and agent, which this site never sees or checks.',
    );
    // ownership and distribution: the release is reflected, the restriction message is unchanged
    expect(t).toContain('Review and approval Release 1.0.0 approved');
    expect(t).toContain(
      'This skill is developed for FM Ecosystem projects. Managed installation is restricted to authorized consumers.',
    );
    expect(t).toContain('Installation status Not published');
    // the lifecycle shows the release's security review, not "not applicable"
    expect(t).toContain(
      'Reviewed No blocking issues identified in the reviewed scope Security review of curated release 1.0.0.',
    );
    // the library filter and badge follow the same state
    expect(filterSkills(c, { content: 'curated-approved' }).map((s) => s.id)).toContain(
      'ecosystem-config',
    );
  });

  it('unapproved and withdrawn releases are shown as such, never as installable', () => {
    for (const [status, label, outcome, reason] of [
      [
        'unapproved',
        'Not approved',
        'Pending: no owner decision recorded',
        'The release is not approved.',
      ],
      [
        'withdrawn',
        'Withdrawn',
        'Approval withdrawn by the owner The owner withdrew the approval of this release; it cannot be installed.',
        'The release’s approval was withdrawn.',
      ],
    ] as const) {
      const c = withRelease(status);
      const t = page(c, 'ecosystem-config');
      expect(
        availabilityOf(
          c,
          c.skills.find((s) => s.id === 'ecosystem-config')!,
        ).state,
      ).toBe('curated-unapproved');
      expect(t, status).toContain(`Release status ${label}`);
      expect(t, status).toContain(`Human-reviewed outcome ${outcome}`);
      expect(t, status).toContain(
        `Not available. It cannot be installed from the library because: ${reason}`,
      );
      expect(t, status).toContain('Review and approval No approved release');
      // the restriction message is unchanged
      expect(t, status).toContain('Managed installation is restricted to authorized consumers.');
    }
    // a withdrawn release never reads as pending
    expect(page(withRelease('withdrawn'), 'ecosystem-config')).not.toContain(
      'Pending: no owner decision',
    );
    expect(page(withRelease('withdrawn'), 'ecosystem-config', 'id')).toContain(
      'Persetujuan ditarik oleh pemilik',
    );
  });

  it('a first-party skill without a release keeps its existing presentation', () => {
    const t = page(base, 'skill-discovery-smoke-test');
    expect(t).toContain('This skill is authored in this repository');
    expect(t).not.toContain('Curated version');
  });

  it('is translated into Indonesian', () => {
    const t = page(withRelease('approved'), 'ecosystem-config', 'id');
    expect(t).toContain('Asal-usul');
    expect(t).toContain('Pihak pertama: dibuat dari konten yang ditulis di repositori ini');
    expect(t).toContain('Perubahan yang dicatat');
    expect(t).toContain('Skill ini terbatas: pemasangan juga memerlukan otorisasi privat');
  });
});

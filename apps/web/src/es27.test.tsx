import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import { lifecycle } from './lib.ts';

/*
 * ES27 website: the security audit is shown with its completeness, scope and recommendation, the recommendation is
 * never presented as an approval, and resources are never shown as approved skills. Rendered from the real registry.
 */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const html = (route: Parameters<typeof Page>[0]['route'], store: Record<string, string> = {}) => {
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={catalog} />
      </I18nProvider>,
    );
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const page = (route: Parameters<typeof Page>[0]['route'], store?: Record<string, string>) =>
  text(html(route, store));
const skill = (id: string) => catalog.skills.find((s) => s.id === id)!;
const audited = catalog.skills.filter((s) => s.review.audit);
const partial = audited.filter((s) => s.review.audit!.completeness === 'partial');

describe('ES27 skill pages', () => {
  it('show the audit: completeness, recommendation (not an approval), scope, findings and all 26 checks', () => {
    expect(audited.length).toBe(15);
    for (const s of audited) {
      const t = page({ page: 'skill', id: s.id });
      const a = s.review.audit!;
      expect(t, s.id).toContain('Security audit (ES27)');
      expect(t, s.id).toContain(
        a.completeness === 'complete' ? 'Review complete' : 'Review incomplete',
      );
      expect(t, s.id).toContain('Audit recommendation:');
      expect(t, s.id).toContain('It is not an approval and installs nothing.');
      expect(t, s.id).toContain('Checks (26)');
      for (const f of a.issues) expect(t, `${s.id}: ${f.title}`).toContain(text(f.title).trim());
      expect(t, s.id).not.toMatch(/>Approved<|Approved by/);
    }
  });

  it('a partial audit is shown as incomplete everywhere: header, lifecycle and the skills list', () => {
    expect(partial.map((s) => s.id).sort()).toEqual(['directing-stickman-videos', 'onetake']);
    for (const s of partial) {
      const t = page({ page: 'skill', id: s.id });
      expect(t.indexOf('Review incomplete'), s.id).toBeLessThan(t.indexOf('Source and provenance'));
      const row = lifecycle(catalog, s).find((r) => r.key === 'reviewed')!;
      expect(row.kind, s.id).toBe('warn');
      expect(row.value, s.id).toMatch(/^Incomplete/);
    }
    const list = page({ page: 'skills', query: { q: 'onetake' } });
    expect(list).toContain('Review incomplete');
    const done = lifecycle(catalog, skill('fact-checker')).find((r) => r.key === 'reviewed')!;
    expect(done.kind).toBe('ok');
    expect(done.detail).toContain('Audit recommendation: Suitable for controlled evaluation');
  });

  it('findings are listed most severe first, with evidence', () => {
    const s = skill('gbro-collage-broll');
    const t = page({ page: 'skill', id: s.id });
    const order = ['Medium', 'Low', 'Info'].map((w) =>
      t.indexOf(` ${w} `, t.indexOf('Findings (')),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toContain('Evidence:');
  });

  it('unaudited skills render exactly as before (no audit block)', () => {
    const t = page({ page: 'skill', id: 'impeccable' });
    expect(t).not.toContain('Security audit (');
    expect(t).not.toContain('Review incomplete');
  });
});

describe('ES27 resource pages', () => {
  it('audited resources show completeness and the audit; none is shown as an approved skill', () => {
    const rs = catalog.resources.filter((r) => r.security.audit);
    expect(rs.length).toBe(10);
    for (const r of rs) {
      const t = page({ page: 'resource', id: r.id });
      const a = r.security.audit!;
      expect(t, r.id).toContain('Security audit (ES27)');
      expect(t, r.id).toContain(
        a.completeness === 'complete' ? 'Review complete' : 'Review incomplete',
      );
      expect(t, r.id).toContain(
        r.security.status === 'reviewed'
          ? 'Security reviewed'
          : 'Concerns noted, not fully reviewed',
      );
      expect(t, r.id).toContain(`revision ${a.revision!.slice(0, 12)}`);
      expect(t, r.id).toMatch(/not a skill/);
      expect(t, r.id).not.toMatch(/\bApproved\b|\binstallable\b(?! through)/);
    }
  });

  it('a complete audit is "Security reviewed"; a partial one never is', () => {
    for (const r of catalog.resources)
      if (r.security.status === 'reviewed')
        expect(r.security.audit?.completeness, r.id).toBe('complete');
    const list = page({ page: 'resources' });
    expect(list).toContain('Review incomplete');
    expect(list).toContain('Security reviewed');
  });

  it('remote MCP servers keep their external-service facts next to the audit', () => {
    const t = page({ page: 'resource', id: 'appllama-mcp' });
    expect(t).toContain('This site never connects to an MCP server.');
    expect(t).toContain('Official endpoint (not connected)');
    expect(t).toContain('Defer pending more evidence');
  });

  it('Indonesian renders the audit chrome', () => {
    const t = page({ page: 'skill', id: 'onetake' }, { lang: 'id' });
    expect(t).toContain('Audit keamanan (ES27)');
    expect(t).toContain('Tinjauan belum lengkap');
    expect(t).toContain('Ini bukan persetujuan dan tidak memasang apa pun.');
  });
});

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLinks } from '../src/links.ts';
import { buildCatalog } from '../src/index.ts';

const skill = {
  id: 'demo',
  name: 'Demo',
  description: 'd',
  category: 'general',
  origin: 'first-party',
  source: { type: 'first-party', path: 'skills/shared/demo' },
  agents: ['claude-code', 'codex'],
};

describe('checkLinks', () => {
  it('checks external skills against their managed install, for every agent', () => {
    const repo = mkdtempSync(join(tmpdir(), 'es-repo-'));
    const proj = mkdtempSync(join(tmpdir(), 'es-proj-'));
    mkdirSync(join(repo, 'external/skills/ext'), { recursive: true });
    mkdirSync(join(proj, '.claude/skills'), { recursive: true });
    mkdirSync(join(proj, '.agents/skills'), { recursive: true });
    const r = buildCatalog({
      skills: [
        {
          ...skill,
          id: 'ext',
          origin: 'external',
          agents: ['claude-code'], // documented upstream for one agent only; both dirs are still checked
          source: {
            type: 'external',
            upstream: { url: 'https://github.com/o/r' },
            path: 'skills/ext',
            revision: 'a'.repeat(40),
          },
          author: 'o',
          license: 'MIT',
        },
      ],
      consumers: [],
      integrations: [],
    });
    if (!r.ok) throw new Error(r.errors.join());
    symlinkSync(join(repo, 'external/skills/ext'), join(proj, '.claude/skills/ext'));
    const state = Object.fromEntries(
      checkLinks(repo, r.catalog.skills, proj).map((x) => [x.agent, x.state]),
    );
    expect(state).toEqual({ 'claude-code': 'linked', codex: 'missing' });
  });

  it('reports linked, copy, broken, wrong-target and missing', () => {
    const repo = mkdtempSync(join(tmpdir(), 'es-repo-'));
    const proj = mkdtempSync(join(tmpdir(), 'es-proj-'));
    mkdirSync(join(repo, 'skills/shared/demo'), { recursive: true });
    mkdirSync(join(repo, 'other'));
    mkdirSync(join(proj, '.claude/skills'), { recursive: true });
    mkdirSync(join(proj, '.agents/skills'), { recursive: true });
    const r = buildCatalog({ skills: [skill], consumers: [], integrations: [] });
    if (!r.ok) throw new Error(r.errors.join());
    const state = () =>
      Object.fromEntries(checkLinks(repo, r.catalog.skills, proj).map((x) => [x.agent, x.state]));

    expect(state()).toEqual({ 'claude-code': 'missing', codex: 'missing' });
    symlinkSync(join(repo, 'skills/shared/demo'), join(proj, '.claude/skills/demo'));
    mkdirSync(join(proj, '.agents/skills/demo'));
    writeFileSync(join(proj, '.agents/skills/demo/SKILL.md'), 'x');
    expect(state()).toEqual({ 'claude-code': 'linked', codex: 'copy' });
  });

  it('detects broken and wrong-target links', () => {
    const repo = mkdtempSync(join(tmpdir(), 'es-repo-'));
    const proj = mkdtempSync(join(tmpdir(), 'es-proj-'));
    mkdirSync(join(repo, 'skills/shared/demo'), { recursive: true });
    mkdirSync(join(repo, 'other'));
    mkdirSync(join(proj, '.claude/skills'), { recursive: true });
    mkdirSync(join(proj, '.agents/skills'), { recursive: true });
    symlinkSync(join(repo, 'nowhere'), join(proj, '.claude/skills/demo'));
    symlinkSync(join(repo, 'other'), join(proj, '.agents/skills/demo'));
    const r = buildCatalog({ skills: [skill], consumers: [], integrations: [] });
    if (!r.ok) throw new Error(r.errors.join());
    const s = Object.fromEntries(
      checkLinks(repo, r.catalog.skills, proj).map((x) => [x.agent, x.state]),
    );
    expect(s).toEqual({ 'claude-code': 'broken', codex: 'wrong-target' });
  });
});

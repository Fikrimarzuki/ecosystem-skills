import { registrySchema, type Catalog, type Registry } from './schema.ts';

// Public catalog must not carry machine-specific paths or credentials.
const FORBIDDEN: [RegExp, string][] = [
  [/(^|[\s"'(])\/(Users|home|private|var|tmp)\//, 'absolute local path'],
  [/[A-Za-z]:\\/, 'Windows path'],
  [/\bfile:\/\//, 'file:// URL'],
  [/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/https?:\/\/[^\s/:@]+:[^\s/@]+@/, 'credentials in URL'],
];

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value))
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortedUnique = <T extends string>(xs: T[]) => [...new Set(xs)].sort();

/** The exact bytes of catalog.json: stable (sorted, no timestamps), shared by the CLI and the site build. */
export const catalogToJson = (catalog: Catalog): string => JSON.stringify(catalog, null, 2) + '\n';

export type ValidationResult = { ok: true; catalog: Catalog } | { ok: false; errors: string[] };

/** Validate raw registry data and, if valid, produce the normalized catalog. */
export function buildCatalog(raw: unknown): ValidationResult {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const reg: Registry = parsed.data;
  const errors: string[] = [];

  for (const [kind, items] of Object.entries(reg)) {
    for (const d of duplicates(items.map((x) => x.id))) errors.push(`duplicate ${kind} id: ${d}`);
    for (const [p, s] of strings(items, kind))
      for (const [re, label] of FORBIDDEN)
        if (re.test(s)) errors.push(`${p}: contains ${label}; not allowed in public catalog`);
  }

  const skillIds = new Set(reg.skills.map((s) => s.id));
  // Stale verifications (verified at an older revision) are allowed; the site and CLI flag them.
  const integrations = new Map(reg.integrations.map((i) => [i.id, i]));

  for (const s of reg.skills) {
    const at = `skill ${s.id}`;
    if (s.origin !== s.source.type)
      errors.push(`${at}: origin "${s.origin}" does not match source type "${s.source.type}"`);
    if (s.source.type === 'external') {
      if (!s.author) errors.push(`${at}: external skills require "author"`);
      if (!s.license)
        errors.push(
          `${at}: external skills require "license" (use "unknown" if upstream states none)`,
        );
      if (s.source.fork && s.source.fork.url === s.source.upstream.url)
        errors.push(`${at}: fork url must differ from upstream url`);
    }
    const r = s.review;
    if (r.status !== 'unreviewed') {
      if (!r.reviewedAt || !r.reviewer)
        errors.push(`${at}: review status "${r.status}" requires "reviewedAt" and "reviewer"`);
      if (s.source.type === 'external' && r.status !== 'rejected') {
        if (r.revision !== s.source.revision)
          errors.push(
            `${at}: review covers revision ${r.revision ?? '(none)'} but source pins ${s.source.revision}; re-review`,
          );
        if (!r.contentHash)
          errors.push(`${at}: review of an external skill requires "contentHash"`);
      }
    }
    if (r.status === 'approved' && !r.approvedBy)
      errors.push(`${at}: approved review requires "approvedBy"`);
    if (r.status !== 'approved' && r.approvedBy)
      errors.push(`${at}: "approvedBy" is only allowed on approved reviews`);
    for (const dep of s.requiresSkills) {
      const d = reg.skills.find((x) => x.id === dep);
      if (!d) errors.push(`${at}: requires unknown skill "${dep}"`);
      else if (dep === s.id) errors.push(`${at}: cannot require itself`);
      else if (s.review.status === 'approved' && d.review.status !== 'approved')
        errors.push(`${at}: approved, but required skill "${dep}" is ${d.review.status}`);
    }
    for (const r of s.requires)
      if (!integrations.has(r)) errors.push(`${at}: requires unknown integration "${r}"`);
  }

  for (const c of reg.consumers) {
    const at = `consumer ${c.id}`;
    for (const d of duplicates(c.assignments.map((a) => a.skill)))
      errors.push(`${at}: skill "${d}" assigned more than once`);
    for (const a of c.assignments) {
      if (!skillIds.has(a.skill)) errors.push(`${at}: assigns unknown skill "${a.skill}"`);
      for (const ag of a.agents)
        if (c.agents.length && !c.agents.includes(ag))
          errors.push(
            `${at}: assignment "${a.skill}" targets agent "${ag}" not listed on the consumer`,
          );
      const v = a.verification;
      if (v.status === 'verified' && (!v.verifiedAt || !v.method))
        errors.push(`${at}: verified assignment "${a.skill}" requires "verifiedAt" and "method"`);
      const target = reg.skills.find((s) => s.id === a.skill);
      if (v.status === 'verified' && target?.source.type === 'external' && !v.revision)
        errors.push(`${at}: verified external assignment "${a.skill}" requires "revision"`);
    }
  }

  for (const ev of reg.evidence) {
    const at = `evidence ${ev.id}`;
    const sk = reg.skills.find((x) => x.id === ev.skill);
    if (!sk) errors.push(`${at}: unknown skill "${ev.skill}"`);
    else if (sk.source.type === 'external' && !ev.revision)
      errors.push(`${at}: external skill evidence requires "revision"`);
    const checks = [ev.discovery, ev.instructions, ev.invocation];
    if (ev.result === 'verified' && checks.some((c) => c !== 'pass'))
      errors.push(`${at}: "verified" requires discovery, instructions and invocation to all pass`);
    const tr = ev.trials;
    if (tr) {
      const sum = (t: { passed: number; partial: number; failed: number; inconclusive: number }) =>
        t.passed + t.partial + t.failed + t.inconclusive;
      if (sum(tr.treatment) !== tr.treatment.runs)
        errors.push(`${at}: treatment outcome counts do not add up to runs`);
      if (tr.treatment.invoked > tr.treatment.runs) errors.push(`${at}: invoked exceeds runs`);
      if (tr.control && sum(tr.control) !== tr.control.runs)
        errors.push(`${at}: control outcome counts do not add up to runs`);
      if (ev.trigger !== 'natural')
        errors.push(`${at}: trials are only meaningful for natural triggering`);
      if (ev.result === 'verified' && tr.treatment.invoked !== tr.treatment.runs)
        errors.push(
          `${at}: "verified" natural evidence requires the skill to be invoked in every treatment run`,
        );
    }
    // Some agents (Codex) do not expose their skill list, so a natural-trigger run that never loads the skill
    // cannot show discovery. That is accepted only when another record for the same skill, agent and
    // revision demonstrates discovery; it is never assumed.
    const discoveryShownElsewhere = reg.evidence.some(
      (o) =>
        o.id !== ev.id &&
        o.skill === ev.skill &&
        o.agent === ev.agent &&
        o.revision === ev.revision &&
        o.discovery === 'pass',
    );
    const discoveryOk =
      ev.discovery === 'pass' ||
      (ev.trigger === 'natural' && ev.discovery === 'not-tested' && discoveryShownElsewhere);
    if (ev.result === 'partial' && !discoveryOk)
      errors.push(`${at}: "partial" requires discovery to pass`);
  }

  for (const i of reg.integrations)
    if (i.transport && i.type !== 'mcp-server')
      errors.push(`integration ${i.id}: "transport" only applies to mcp-server`);

  if (errors.length) return { ok: false, errors };

  // Normalize: stable ordering so output is deterministic regardless of authoring order.
  const catalog: Catalog = {
    schemaVersion: 1,
    skills: reg.skills
      .map((s) => ({
        ...s,
        tags: sortedUnique(s.tags),
        agents: sortedUnique(s.agents),
        requires: sortedUnique(s.requires),
        requiresSkills: sortedUnique(s.requiresSkills),
      }))
      .sort(byId),
    consumers: reg.consumers
      .map((c) => ({
        ...c,
        agents: sortedUnique(c.agents),
        assignments: c.assignments
          .map((a) => ({ ...a, agents: sortedUnique(a.agents) }))
          .sort((a, b) => (a.skill < b.skill ? -1 : 1)),
      }))
      .sort(byId),
    integrations: [...reg.integrations].sort(byId),
    evidence: [...reg.evidence].sort(byId),
  };
  return { ok: true, catalog };
}

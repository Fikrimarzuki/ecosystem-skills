import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { releaseInstallProblems, releasesOf } from './availability.ts';
import { kindOf } from './fsguard.ts';
import { PRIVATE_LABEL, type Workspace } from './private.ts';
import type { Agent, Catalog, Consumer, Skill } from './schema.ts';
import { visibilityOf } from './validate.ts';
import { SUPPORTED_AGENTS } from './consumers.ts';
import { decide, describePolicy, distributionOf, isRestricted, OWNERSHIP_TEXT } from './policy.ts';

/*
 * Ecosystem mappings and local visibility views (ES24). Read-only: nothing here writes, installs or edits another
 * repository. Source checkouts are located by integration identity (current name or a former name), so a repository
 * rename is a change to one registry record.
 */

type Integration = Catalog['integrations'][number];
export const SOURCES_LOCAL_FILE = 'sources.local.json';

export interface Located {
  integration: string;
  /** Absolute path of the checkout, when found. */
  path?: string;
  /** The repository name the checkout was found under (current or former). */
  matchedName?: string;
  how: 'sources.local.json' | 'sibling' | 'missing';
}

/**
 * Find a local checkout of an integration's repository: first an explicit entry in the git-ignored sources.local.json
 * ({ "<integration-id>": "<path>" }, relative to the repository root), then a sibling folder of this repository named
 * after the current or a former repository name. Nothing is cloned or downloaded.
 */
export function locateSource(repoRoot: string, integration: Integration): Located {
  const at: Located = { integration: integration.id, how: 'missing' };
  const repo = integration.repository;
  if (!repo) return at;
  const local = join(repoRoot, SOURCES_LOCAL_FILE);
  if (kindOf(local) === 'file') {
    const map = JSON.parse(readFileSync(local, 'utf8')) as Record<string, unknown>;
    const v = map[integration.id];
    if (typeof v === 'string' && v.trim()) {
      const p = isAbsolute(v) ? v : resolve(repoRoot, v);
      return kindOf(p) === 'dir' ? { ...at, path: p, how: 'sources.local.json' } : at;
    }
  }
  for (const name of [repo.name, ...repo.formerNames]) {
    const p = join(dirname(repoRoot), name);
    if (kindOf(p) === 'dir') return { ...at, path: p, matchedName: name, how: 'sibling' };
  }
  return at;
}

export interface MappingCheck {
  consumer: string;
  check: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

function readJsonIfFile(p: string): unknown {
  if (kindOf(p) !== 'file') return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Validate the ecosystem references of each consumer against local checkouts: the source exists, its documented
 * contract files exist, and the project id exists in the source. Reads only the documented files; prints counts and
 * ids that are already in the public registry, never asset contents or paths.
 */
export function validateMappings(
  repoRoot: string,
  catalog: Catalog,
  consumerId?: string,
): MappingCheck[] {
  const out: MappingCheck[] = [];
  const integrations = new Map(catalog.integrations.map((i) => [i.id, i]));
  const located = new Map<string, Located>();
  const loc = (i: Integration) => {
    if (!located.has(i.id)) located.set(i.id, locateSource(repoRoot, i));
    return located.get(i.id)!;
  };
  for (const c of catalog.consumers) {
    if (consumerId && c.id !== consumerId) continue;
    if (!c.ecosystem) continue;
    for (const src of c.ecosystem.sources) {
      const i = integrations.get(src)!;
      const l = loc(i);
      if (!l.path) {
        out.push({
          consumer: c.id,
          check: `${src}: source available`,
          status: 'warn',
          detail: `no local checkout (looked for ${[i.repository!.name, ...i.repository!.formerNames].join(' or ')} next to this repository, and ${SOURCES_LOCAL_FILE})`,
        });
        continue;
      }
      out.push({
        consumer: c.id,
        check: `${src}: source available`,
        status: 'ok',
        detail:
          l.how === 'sibling'
            ? `found as ${l.matchedName}${l.matchedName !== i.repository!.name ? ' (a former name)' : ''}`
            : `found via ${SOURCES_LOCAL_FILE}`,
      });
      for (const d of i.contract!.docs)
        if (kindOf(join(l.path, d)) !== 'file')
          out.push({
            consumer: c.id,
            check: `${src}: contract docs`,
            status: 'error',
            detail: `${d} is missing`,
          });
      if (i.type === 'config-registry') {
        const art = i.contract!.reads.map((r) => readJsonIfFile(join(l.path!, r))).find(Boolean) as
          { version?: unknown; projects?: Record<string, unknown> } | undefined;
        if (!art || art.version !== 1 || !art.projects)
          out.push({
            consumer: c.id,
            check: `${src}: generated output`,
            status: 'error',
            detail: 'no readable version-1 output',
          });
        else if (c.ecosystem.project)
          out.push({
            consumer: c.id,
            check: `${src}: project ${c.ecosystem.project}`,
            status: c.ecosystem.project in art.projects ? 'ok' : 'error',
            detail:
              c.ecosystem.project in art.projects ? 'record exists' : 'no such project record',
          });
      }
      if (i.type === 'asset-catalog') {
        const inv = readJsonIfFile(join(l.path, 'catalog-output/internal.json')) as
          { assets?: { projectId?: string }[] } | undefined;
        if (!inv?.assets)
          out.push({
            consumer: c.id,
            check: `${src}: catalog`,
            status: 'warn',
            detail:
              'catalog-output/internal.json is not generated; the owner can run the documented catalog build',
          });
        else {
          const label = c.ecosystem.project ?? c.id;
          const n = inv.assets.filter((a) => a.projectId === label).length;
          out.push({
            consumer: c.id,
            check: `${src}: assets for ${label}`,
            status: n ? 'ok' : 'warn',
            detail: n ? `${n} catalog record(s)` : 'no catalog records with this project id',
          });
        }
      }
    }
  }
  return out;
}

export interface VisibilityRow {
  id: string;
  name: string;
  visibility: 'public' | 'private' | 'local';
  /** ES25: ownership and distribution, e.g. "owner FM Ecosystem; distribution restricted (owner-only)". */
  policy: string;
  review: string;
  releases: { version: string; approval: string; installable: boolean }[];
  /** Consumers allowed to use it: public assignments, or private access records (with versions and agents). */
  consumers: string[];
}

/** One row per skill visible in this local context. Private rows carry no description or source location. */
export function visibilityRows(ws: Workspace, skillId?: string): VisibilityRow[] {
  const rows: VisibilityRow[] = [];
  for (const s of ws.catalog.skills) {
    if (skillId && s.id !== skillId) continue;
    const vis = visibilityOf(s);
    rows.push({
      id: s.id,
      name: s.name,
      visibility: vis,
      policy: describePolicy(s),
      review: s.review.status,
      releases: releasesOf(ws.catalog.releases, s.id).map((r) => ({
        version: r.version,
        approval: r.approval.status,
        installable:
          releaseInstallProblems(s as Skill, r).length === 0 &&
          distributionOf(s).policy !== 'not-distributable',
      })),
      // open skills: public assignments; restricted or private skills: the private access records
      consumers: !isRestricted(s)
        ? ws.catalog.consumers
            .filter((c: Consumer) => c.assignments.some((a) => a.skill === s.id))
            .map((c) => c.id)
        : ws.access
            .filter((a) => a.skill === s.id)
            .map(
              (a) =>
                `${a.consumer} (versions ${a.releases.join(', ')}; agents ${a.agents.join(', ')}${a.release ? `; desired ${a.release}` : ''})`,
            ),
    });
  }
  return rows;
}

export function formatVisibility(rows: VisibilityRow[], privateConfigured: boolean): string {
  const lines = rows.map((r) => {
    const rel = r.releases.length
      ? r.releases
          .map((x) => `${x.version} ${x.approval}${x.installable ? ', installable' : ''}`)
          .join('; ')
      : 'none';
    return `${r.id}  [${r.visibility}]  ${r.policy}  review ${r.review}  releases: ${rel}  consumers: ${r.consumers.join('; ') || 'none'}`;
  });
  const pub = rows.filter((r) => r.visibility === 'public').length;
  lines.push(
    `${rows.length} skill(s): ${pub} public, ${rows.length - pub} private or local. ${
      privateConfigured
        ? `Private records come from ${PRIVATE_LABEL}.`
        : 'No private root is configured, so only public skills are shown and restricted skills cannot be authorized.'
    } Visibility is not approval, approval is not authorization, and ownership grants nothing.`,
  );
  return lines.join('\n');
}

/**
 * Why a consumer may or may not install a skill through the managed path, from the same decision the installer uses
 * (policy.ts). Read-only. Integrity of the library and store and the project's links are checked by the install
 * preview itself. Denials never name other consumers' grants, who authorized what, or the private root's location.
 */
export function explainEligibility(
  ws: Workspace,
  skillId: string,
  consumerId: string,
  opts: { version?: string; agents?: Agent[] } = {},
): { lines: string[]; eligible: boolean } {
  const skill = ws.catalog.skills.find((s) => s.id === skillId)!;
  const consumer = ws.catalog.consumers.find((c) => c.id === consumerId)!;
  const rels = releasesOf(ws.catalog.releases, skill.id);
  const release = opts.version ? rels.find((r) => r.version === opts.version) : rels[0];
  const agents = opts.agents ?? consumer.agents.filter((a) => SUPPORTED_AGENTS.includes(a));
  const d = decide({
    skill,
    path: isRestricted(skill) || skill.source.type === 'external' ? 'curated' : 'assignment',
    consumer,
    release,
    version: opts.version,
    agents,
    access: ws.privateRoot ? ws.access : undefined,
  });
  const lines = [
    `${skill.id} for ${consumer.id}${release ? ` @ ${release.version}` : ''} (agents: ${agents.join(', ') || 'none'})`,
    `  visibility:    ${visibilityOf(skill)}`,
    `  ownership:     ${OWNERSHIP_TEXT[d.ownership]}${skill.ownership ? '' : ' (not declared; derived from origin)'}`,
    `  distribution:  ${d.distribution.policy}${d.distribution.access ? ` (${d.distribution.access})` : ''}`,
    `  consumer:      ${consumer.kind}; ownership ${consumer.ownership ?? 'not declared'}`,
    `  authorization: ${!isRestricted(skill) ? 'not needed (open)' : ws.privateRoot ? 'checked against the private access records' : 'no private authorization source configured'}`,
  ];
  const blockers = [
    ...d.denials.map((x) => x.message),
    ...(opts.version && !release ? [`${skill.id} has no curated release ${opts.version}`] : []),
    ...(skill.source.type === 'external' || isRestricted(skill)
      ? release
        ? d.release.map(
            (p) => `${skill.id}@${release.version}: ${p.code}${p.detail ? ` (${p.detail})` : ''}`,
          )
        : opts.version
          ? []
          : [`${skill.id} has no curated release`]
      : []),
  ];
  for (const b of blockers) lines.push(`  BLOCKED: ${b}`);
  lines.push(
    blockers.length
      ? `Not eligible (${blockers.length} reason(s)). Nothing was changed.`
      : 'Eligible by policy. Library and store integrity and the project links are checked by the install preview (pnpm skills:library install).',
  );
  return { lines, eligible: !blockers.length };
}

export function formatMappings(catalog: Catalog, ws: Workspace, consumerId?: string): string {
  const out: string[] = [];
  const integrations = new Map(catalog.integrations.map((i) => [i.id, i]));
  for (const c of catalog.consumers) {
    if (consumerId && c.id !== consumerId) continue;
    if (c.kind === 'global') continue;
    // access records are listed below; their derived assignments are not repeated here
    const pub = c.assignments
      .filter((a) => !ws.access.some((x) => x.consumer === c.id && x.skill === a.skill))
      .map((a) => a.skill + (a.release ? `@${a.release}` : ''));
    const priv = ws.access
      .filter((a) => a.consumer === c.id)
      .map((a) => {
        const s = catalog.skills.find((x) => x.id === a.skill);
        return `${a.skill} (${s && visibilityOf(s) === 'public' ? 'restricted, authorized' : 'private'})`;
      });
    out.push(`${c.id}`);
    out.push(`  skills: ${[...pub, ...priv].join(', ') || 'none'}`);
    out.push(
      `  owner-controlled: ${c.ownership === 'fm-ecosystem' ? 'yes (ownership fm-ecosystem)' : `no (ownership ${c.ownership ?? 'not declared'}); owner-only skills cannot be authorized for it`}`,
    );
    if (c.ecosystem?.project) out.push(`  Ecosystem Config project: ${c.ecosystem.project}`);
    for (const src of c.ecosystem?.sources ?? []) {
      const i = integrations.get(src)!;
      out.push(
        `  ${i.type === 'asset-catalog' ? 'assets' : 'config'}: ${src} (repository ${i.repository!.name})`,
      );
    }
    if (c.ecosystem?.note) out.push(`  note: ${c.ecosystem.note}`);
    if (!c.ecosystem) out.push('  no ecosystem sources recorded');
  }
  out.push(
    'A mapping is a reference only: it grants no permission to read, edit or install anything.',
  );
  return out.join('\n');
}

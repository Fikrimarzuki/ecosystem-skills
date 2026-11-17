/*
 * ES26 AI-readable public outputs, generated from the validated public catalog only (never from the private root,
 * consumer checkouts or the filesystem). Both are informational: they describe the registry, they authorize nothing.
 *
 *  - llms.txt            an orientation file for AI agents (https://llmstxt.org): what the site is, what each status
 *                        word means, and stable URLs for every skill, source and resource.
 *  - resources.v1.json   a self-contained, versioned export of the resource collections. Each record carries its own
 *                        provenance (the joined source record), so it can move to another project unchanged.
 */
import { contentAvailability } from './availability.ts';
import {
  RESOURCE_CATEGORIES,
  type Catalog,
  type Resource,
  type Skill,
  type Source,
} from './schema.ts';

export const RESOURCE_CATEGORY_LABEL: Record<Resource['category'], string> = {
  'mcp-servers': 'MCP servers',
  'agent-toolkits': 'Agent toolkits',
  'agent-dev-tools': 'Agent development tools',
  'agent-references': 'Agent references',
  'developer-resources': 'Other developer resources',
};

/** Where the site is served. The deployment base path, if any, is part of it. No trailing slash. */
export const DEFAULT_SITE_URL = 'https://skills.fikrimarzuki.work';
const join = (site: string, path: string) => `${site.replace(/\/+$/, '')}${path}`;

const stageOf = (s: Skill): string =>
  s.origin === 'first-party'
    ? 'first-party'
    : s.review.status === 'unreviewed'
      ? 'discovered'
      : s.review.status;

/** Provenance copied from the source record (the single place these facts are kept). */
export function provenanceOf(source: Source | undefined) {
  if (!source) return { source: null };
  return {
    source: source.id,
    upstream: source.upstream?.url ?? null,
    publisher: source.publisher ?? null,
    license: source.license ?? null,
    revision: source.revision ?? null,
    lastCommit: source.lastCommit ?? null,
    resolution: source.resolution,
  };
}

export const RESOURCE_EXPORT_FORMAT = 'ecosystem-skills/resources';
export const RESOURCE_EXPORT_VERSION = 1;

/**
 * Portable export of every resource. Deterministic (sorted, no timestamps) so the same registry always produces the
 * same bytes. It has no installation, assignment or approval fields because resources have none.
 */
export function resourceExport(catalog: Catalog) {
  const sources = new Map(catalog.sources.map((s) => [s.id, s]));
  return {
    format: RESOURCE_EXPORT_FORMAT,
    version: RESOURCE_EXPORT_VERSION,
    notice:
      'Catalogued resources are discoveries, not endorsements. None is a skill, none is installable through Ecosystem Skills, and an MCP endpoint listed here has never been connected to by this registry. Security "notes-recorded" means concerns were written down from a read-only look; it is not a security review or an approval.',
    categories: RESOURCE_CATEGORIES.map((id) => ({ id, label: RESOURCE_CATEGORY_LABEL[id] })),
    resources: catalog.resources.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      type: r.type,
      summary: r.summary,
      tags: r.tags,
      ...(r.license ? { license: r.license } : {}),
      ...(r.path ? { path: r.path } : {}),
      ...(r.homepage ? { homepage: r.homepage } : {}),
      discovery: r.discovery,
      security: r.security,
      ...(r.mcp ? { mcp: r.mcp } : {}),
      related: r.related,
      provenance: provenanceOf(sources.get(r.source)),
    })),
  };
}
export const resourceExportToJson = (catalog: Catalog): string =>
  JSON.stringify(resourceExport(catalog), null, 2) + '\n';

const one = (s: string) => s.replace(/\s+/g, ' ').trim();
/** "; audit ES27: review incomplete, recommendation defer" — or nothing when there is no structured audit. */
const auditText = (
  a: { round: string; completeness: string; recommendation: string } | undefined,
) =>
  a
    ? `; audit ${a.round}: review ${a.completeness === 'complete' ? 'complete' : 'incomplete'}, recommendation ${a.recommendation} (not an approval)`
    : '';

/** llms.txt for the public site. `site` is the absolute site URL including any base path. */
export function llmsTxt(catalog: Catalog, site: string = DEFAULT_SITE_URL): string {
  const u = (p: string) => join(site, p);
  const approved = catalog.skills.filter((s) => s.review.status === 'approved').length;
  const firstParty = catalog.skills.filter((s) => s.origin === 'first-party').length;
  const lines: string[] = [
    '# Ecosystem Skills',
    '',
    "> A read-only public registry of the AI-agent skills (Claude Code, Codex) used across Fikri Marzuki's projects, plus a separate catalog of resources (MCP servers, agent toolkits, agent development tools, references and other developer resources). It records provenance, review status and agent evidence. Nothing is installed or run from this site, and nothing in this file grants permission to install anything.",
    '',
    `Counts: ${catalog.skills.length} registered skills (${firstParty} first-party, ${approved} approved), ${catalog.sources.length} sources, ${catalog.resources.length} resources. Resources and sources are not skills and do not count toward the skill total.`,
    '',
    '## Status vocabulary',
    '',
    '- Discovered: a third-party skill or resource was found and its metadata recorded. It has not been reviewed.',
    '- Reviewed: findings were recorded for a skill; no decision has been made.',
    '- Approved: the owner approved a specific skill revision. Approval is per skill and per revision; it never applies to resources, and it is not an installation.',
    '- Installable: a skill whose approved, curated content is available from this repository (content state "Curated, approved"). Only skills can be installable; resources never are.',
    "- Installed: a skill assigned to and linked into a specific consumer project. The public catalog shows public consumers only; installation happens on the owner's machine, not from this site.",
    '- Verified: either an assignment whose installation was checked, or an agent run whose evidence was recorded (see each skill page). It is not a security guarantee.',
    '- Source resolution (verified / ambiguous / unresolved) says whether a repository identity was established. It is separate from review and approval.',
    '- Resource security status (not-reviewed / notes-recorded / reviewed) has no "approved" state.',
    '- Review completeness (complete / partial): whether a security audit read everything in scope at the pinned revision. A partial audit is shown as "review incomplete" and can never support an approval.',
    '- Audit recommendation (controlled-evaluation / after-remediation / reference-only / defer / do-not-adopt): advice for the next step from a security audit. It is not an approval, and a candidate suitable for controlled evaluation stays unapproved until the owner decides.',
    '',
    '## Machine-readable data',
    '',
    `- [catalog.json](${u('/catalog.json')}): the complete public catalog (schemaVersion 1): skills, sources, resources, consumers, releases, evidence. Generated from the public registry at build time.`,
    `- [resources.v1.json](${u('/resources.v1.json')}): self-contained export of the resource collections, each record with its provenance (format "${RESOURCE_EXPORT_FORMAT}", version ${RESOURCE_EXPORT_VERSION}).`,
    '',
    '## Pages',
    '',
    `- [Skills](${u('/skills')}): searchable skill library. Canonical skill URL: ${u('/skills/<id>')}`,
    `- [Resources](${u('/resources')}): MCP servers, agent toolkits, development tools, references and other developer resources. Canonical resource URL: ${u('/resources/<id>')}`,
    `- [Sources](${u('/sources')}): every repository, application, standard or lead examined, with its pinned revision. Anchor: ${u('/sources#<id>')}`,
    `- [Overview](${u('/overview')}), [FM Ecosystem](${u('/ecosystem')}), [Consumers](${u('/consumers')}), [Agents & tools](${u('/integrations')})`,
    '',
    '## Resources',
    '',
  ];
  for (const cat of RESOURCE_CATEGORIES) {
    const items = catalog.resources.filter((r) => r.category === cat);
    if (!items.length) continue;
    lines.push(`### ${RESOURCE_CATEGORY_LABEL[cat]}`, '');
    for (const r of items)
      lines.push(
        `- [${r.name}](${u(`/resources/${r.id}`)}): ${one(r.summary)} (discovery: ${r.discovery.status}; security: ${r.security.status}${auditText(r.security.audit)})`,
      );
    lines.push('');
  }
  lines.push('## Skills', '');
  for (const s of catalog.skills) {
    const content = contentAvailability(s, catalog.releases).state;
    lines.push(
      `- [${s.name}](${u(`/skills/${s.id}`)}): ${stageOf(s)}${auditText(s.review.audit)}; content: ${content}`,
    );
  }
  lines.push(
    '',
    '## Optional',
    '',
    '- Registry content (descriptions, review notes) is reproduced as written, in English. The interface is also available in Bahasa Indonesia.',
    '- Private skills, private authorization records and private consumers are never part of this public output.',
    '',
  );
  return lines.join('\n');
}

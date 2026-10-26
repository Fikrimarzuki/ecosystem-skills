import { useEffect, useState } from 'react';
import type { Catalog, Consumer, Evidence, Skill } from '@ecosystem-skills/catalog';

export type { Catalog, Evidence, Skill };
type Assignment = Consumer['assignments'][number];

/**
 * Public lifecycle of a skill. "Installed" is deliberately absent: installs are machine-local
 * (external/installed.json) and never part of the public catalog.
 */
export type Stage = 'first-party' | 'discovered' | 'reviewed' | 'approved' | 'rejected';
export function stage(s: Skill): Stage {
  if (s.origin === 'first-party') return 'first-party';
  return s.review.status === 'unreviewed' ? 'discovered' : s.review.status;
}
export const STAGE_LABEL: Record<Stage, string> = {
  'first-party': 'First-party',
  discovered: 'Candidate · discovered',
  reviewed: 'Candidate · reviewed',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Browse URL for the exact reviewed folder, e.g. https://github.com/o/r/tree/<sha>/<path>. */
export function sourceTreeUrl(s: Skill): string | undefined {
  if (s.source.type !== 'external') return undefined;
  const base = s.source.upstream.url.replace(/\.git$/, '').replace(/\/$/, '');
  return /^https:\/\/github\.com\//.test(base)
    ? `${base}/tree/${s.source.revision}/${s.source.path}`
    : undefined;
}

/** Evidence is stale when it was recorded against a revision other than the one now pinned. */
export function isEvidenceStale(ev: Evidence, s: Skill | undefined): boolean {
  return s?.source.type === 'external' && ev.revision !== s.source.revision;
}

export const evidenceFor = (c: Catalog, skillId: string) =>
  c.evidence.filter((e) => e.skill === skillId);

export interface AgentSummary {
  /** An explicit-invocation run verified this skill at the current revision. */
  explicit: boolean;
  /** Natural-trigger treatment runs, and how many of them loaded the skill. */
  naturalRuns: number;
  naturalInvoked: number;
}

/** Per-agent evidence summary for a skill; derived from evidence only, never from link state. */
export function agentSummary(c: Catalog, s: Skill | undefined, agent: string): AgentSummary {
  const ev = s
    ? evidenceFor(c, s.id).filter((e) => e.agent === agent && !isEvidenceStale(e, s))
    : [];
  const natural = ev.flatMap((e) =>
    e.trigger === 'natural' && e.trials ? [e.trials.treatment] : [],
  );
  return {
    explicit: ev.some((e) => (e.trigger ?? 'explicit') === 'explicit' && e.result === 'verified'),
    naturalRuns: natural.reduce((n, t) => n + t.runs, 0),
    naturalInvoked: natural.reduce((n, t) => n + t.invoked, 0),
  };
}

/** Agents with current (non-stale) "verified" evidence for a skill. */
export function verifiedAgents(c: Catalog, s: Skill): string[] {
  return [
    ...new Set(
      evidenceFor(c, s.id)
        .filter((e) => e.result === 'verified' && !isEvidenceStale(e, s))
        .map((e) => e.agent),
    ),
  ].sort();
}

/** A verification is stale when it was made against a revision other than the one now pinned. */
export function isStale(a: Assignment, s: Skill | undefined): boolean {
  return (
    a.verification.status === 'verified' &&
    s?.source.type === 'external' &&
    !!a.verification.revision &&
    a.verification.revision !== s.source.revision
  );
}

export type Route =
  | { page: 'dashboard' }
  | { page: 'skills' }
  | { page: 'skill'; id: string }
  | { page: 'consumers' }
  | { page: 'integrations' };

export function parseRoute(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/');
  if (a === 'skills') return b ? { page: 'skill', id: decodeURIComponent(b) } : { page: 'skills' };
  if (a === 'consumers') return { page: 'consumers' };
  if (a === 'integrations') return { page: 'integrations' };
  return { page: 'dashboard' };
}

export const skillHref = (id: string) => `#/skills/${encodeURIComponent(id)}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function useCatalog(): { catalog?: Catalog; error?: string } {
  const [state, setState] = useState<{ catalog?: Catalog; error?: string }>({});
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalog.json`)
      .then((r) =>
        r.ok ? (r.json() as Promise<Catalog>) : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((catalog) => setState({ catalog }))
      .catch((e: unknown) => setState({ error: e instanceof Error ? e.message : String(e) }));
  }, []);
  return state;
}

export function summarize(c: Catalog) {
  const count = (type: string) => c.integrations.filter((i) => i.type === type).length;
  return {
    skills: c.skills.length,
    firstParty: c.skills.filter((s) => s.origin === 'first-party').length,
    external: c.skills.filter((s) => s.origin === 'external').length,
    consumers: c.consumers.length,
    agents: [
      ...new Set([...c.skills.flatMap((s) => s.agents), ...c.consumers.flatMap((x) => x.agents)]),
    ].sort(),
    integrations: c.integrations.length,
    mcp: count('mcp-server'),
    cli: count('cli-tool'),
    dependencies: count('dependency'),
    discovered: c.skills.filter((x) => stage(x) === 'discovered').length,
    reviewed: c.skills.filter((x) => stage(x) === 'reviewed').length,
    approved: c.skills.filter((x) => stage(x) === 'approved').length,
    rejected: c.skills.filter((x) => stage(x) === 'rejected').length,
    agentVerifiedSkills: c.skills.filter((x) => verifiedAgents(c, x).length > 0).length,
    verifiedAssignments: c.consumers
      .flatMap((x) => x.assignments)
      .filter((a) => a.verification.status === 'verified').length,
  };
}

/** Consumers that have been assigned a skill (intent, not installation). */
export function consumersOf(c: Catalog, skillId: string) {
  return c.consumers.flatMap((consumer) =>
    consumer.assignments
      .filter((a) => a.skill === skillId)
      .map((assignment) => ({ consumer, assignment })),
  );
}

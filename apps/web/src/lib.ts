import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Catalog, Consumer, Evidence, Skill } from '@ecosystem-skills/catalog';
import { tEn, type T } from './i18n.tsx';
import { currentUrl, href as routerHref, subscribe } from './router.ts';

export type { Catalog, Consumer, Evidence, Skill };
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
/** Short label for the review state of an external skill (first-party skills have no review stage). */
export const REVIEW_LABEL: Record<Stage, string> = {
  'first-party': 'First-party',
  discovered: 'Discovered',
  reviewed: 'Reviewed',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * Browsing groups. They are derived from existing registry metadata, not keyword guesses: skills kept under
 * `skills/projects/` are project-specific, every other skill is mapped from its registry `category`. The
 * mapping is explicit so a new category has to be placed deliberately (a test fails if one is unmapped), and
 * the finer `category` stays visible on the skill page and in search.
 */
export const GROUPS = [
  'Coding',
  'Design',
  'Planning',
  'Communication',
  'Verification',
  'Project-specific',
] as const;
export type Group = (typeof GROUPS)[number] | 'Other';
export const GROUP_OF_CATEGORY: Record<string, (typeof GROUPS)[number]> = {
  accessibility: 'Design',
  'ai-engineering': 'Coding',
  architecture: 'Coding',
  'code-quality': 'Coding',
  'code-review': 'Verification',
  communication: 'Communication',
  database: 'Coding',
  debugging: 'Coding',
  documentation: 'Communication',
  'frontend-design': 'Design',
  'graphics-3d': 'Coding',
  illustration: 'Design',
  planning: 'Planning',
  react: 'Coding',
  security: 'Verification',
  testing: 'Verification',
  tooling: 'Verification',
  vue: 'Coding',
};
export function groupOf(s: Skill): Group {
  if (s.source.type === 'first-party' && s.source.path.startsWith('skills/projects/'))
    return 'Project-specific';
  return GROUP_OF_CATEGORY[s.category] ?? 'Other';
}
/** Groups that have at least one skill, in display order. */
export function groupsInUse(c: Catalog): Group[] {
  const used = new Set(c.skills.map(groupOf));
  return [...GROUPS, 'Other' as const].filter((g) => used.has(g));
}

export const AGENT_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
};
export const agentName = (a: string) => AGENT_LABEL[a] ?? a;
/** Agents the project has actually tested; others (e.g. Cursor) are only referenced by upstream docs. */
export const TESTED_AGENTS = ['claude-code', 'codex'] as const;

/** Browse URL for the exact reviewed folder, e.g. https://github.com/o/r/tree/<sha>/<path>. */
export function sourceTreeUrl(s: Skill): string | undefined {
  if (s.source.type !== 'external') return undefined;
  const base = s.source.upstream.url.replace(/\.git$/, '').replace(/\/$/, '');
  return /^https:\/\/github\.com\//.test(base)
    ? `${base}/tree/${s.source.revision}/${s.source.path}`
    : undefined;
}

/** "owner/repo" for GitHub sources, otherwise the host. */
export function sourceLabel(s: Skill): string {
  if (s.source.type !== 'external') return s.source.path;
  return s.source.upstream.url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '');
}

/** Evidence is stale when it was recorded against a revision other than the one now pinned. */
export function isEvidenceStale(ev: Evidence, s: Skill | undefined): boolean {
  return s?.source.type === 'external' && ev.revision !== s.source.revision;
}

export const evidenceFor = (c: Catalog, skillId: string) =>
  c.evidence.filter((e) => e.skill === skillId);

export type Level = 'pass' | 'fail' | 'untested';
export type ExplicitLevel = 'verified' | 'partial' | 'failed' | 'untested';

export interface AgentStatus {
  agent: string;
  /** Any current evidence record shows the agent listed and could load the skill. */
  discovery: Level;
  /** Explicit invocation (the prompt names the skill). */
  explicit: ExplicitLevel;
  /** Natural triggering: how many runs loaded the skill, out of how many. Undefined = never tested. */
  natural?: { runs: number; invoked: number };
  /** Behavior in natural-trigger trials (judged separately from invocation). */
  behavior?: { runs: number; passed: number };
  /** Same trials with the skill unavailable. */
  control?: { runs: number; passed: number };
  /** Evidence records ignored because they were made against an older pinned revision. */
  staleRecords: number;
}

/**
 * Per-agent status derived from evidence only. Link state and installation are not public, and one
 * successful run is never reported as universal compatibility.
 */
export function agentStatus(c: Catalog, s: Skill | undefined, agent: string): AgentStatus {
  const all = s ? evidenceFor(c, s.id).filter((e) => e.agent === agent) : [];
  const ev = all.filter((e) => !isEvidenceStale(e, s));
  const explicitRecs = ev.filter((e) => (e.trigger ?? 'explicit') === 'explicit');
  const naturalRecs = ev.filter((e) => e.trigger === 'natural');
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
  // ES7-style natural records carry no trial counts: they are one run.
  const naturalRuns = sum(naturalRecs, (e) => e.trials?.treatment.runs ?? 1);
  const trialRecs = naturalRecs.filter((e) => e.trials);
  const withControl = trialRecs.filter((e) => e.trials?.control);
  return {
    agent,
    discovery: ev.some((e) => e.discovery === 'pass')
      ? 'pass'
      : ev.some((e) => e.discovery === 'fail')
        ? 'fail'
        : 'untested',
    explicit: explicitRecs.some((e) => e.result === 'verified')
      ? 'verified'
      : explicitRecs.some((e) => e.result === 'partial')
        ? 'partial'
        : explicitRecs.some((e) => e.result === 'failed')
          ? 'failed'
          : 'untested',
    natural: naturalRecs.length
      ? {
          runs: naturalRuns,
          invoked: sum(naturalRecs, (e) =>
            e.trials ? e.trials.treatment.invoked : e.invocation === 'pass' ? 1 : 0,
          ),
        }
      : undefined,
    behavior: trialRecs.length
      ? {
          runs: sum(trialRecs, (e) => e.trials!.treatment.runs),
          passed: sum(trialRecs, (e) => e.trials!.treatment.passed),
        }
      : undefined,
    control: withControl.length
      ? {
          runs: sum(withControl, (e) => e.trials!.control!.runs),
          passed: sum(withControl, (e) => e.trials!.control!.passed),
        }
      : undefined,
    staleRecords: all.length - ev.length,
  };
}

/** Agents with a current explicit "verified" run for a skill. */
export function verifiedAgents(c: Catalog, s: Skill): string[] {
  return TESTED_AGENTS.filter((a) => agentStatus(c, s, a).explicit === 'verified');
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

export type Query = Record<string, string>;
export type Route =
  | { page: 'home' }
  | { page: 'dashboard' }
  | { page: 'skills'; query?: Query }
  | { page: 'skill'; id: string }
  | { page: 'consumers' }
  | { page: 'integrations' }
  | { page: 'notfound'; path: string };

/**
 * Route for an app path with optional query ("/skills/caveman", "/skills?status=approved"). Query parameters only
 * ever belong to the Skills page and are never read as path segments. A trailing slash is ignored; anything that is
 * not a known page is `notfound`.
 */
export function parseRoute(url: string): Route {
  const [path = '', search = ''] = url.split('?');
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  const notfound: Route = { page: 'notfound', path: path || '/' };
  if (parts.length === 0) return { page: 'home' };
  if (a === 'skills') {
    if (parts.length === 1) {
      const query = Object.fromEntries(new URLSearchParams(search));
      return Object.keys(query).length ? { page: 'skills', query } : { page: 'skills' };
    }
    if (parts.length === 2) {
      try {
        return { page: 'skill', id: decodeURIComponent(b!) };
      } catch {
        return notfound; // malformed %-escape
      }
    }
    return notfound;
  }
  if (parts.length === 1) {
    if (a === 'overview') return { page: 'dashboard' };
    if (a === 'consumers') return { page: 'consumers' };
    if (a === 'integrations') return { page: 'integrations' };
  }
  return notfound;
}

/** Clean URLs for internal links; the deployment base path (if any) is added. */
export const homeHref = () => routerHref('/');
export const pageHref = (page: 'overview' | 'skills' | 'consumers' | 'integrations') =>
  routerHref(`/${page}`);
export const skillHref = (id: string) => routerHref(`/skills/${encodeURIComponent(id)}`);
export const skillsHref = (q: Query) => {
  const s = new URLSearchParams(q).toString();
  return routerHref(s ? `/skills?${s}` : '/skills');
};
/** App path (no base) for the Skills page with these filters; what `navigate` takes. */
export const skillsPath = (q: Query) => {
  const s = new URLSearchParams(q).toString();
  return s ? `/skills?${s}` : '/skills';
};

/** The current route; re-renders on link navigation, Back/Forward and pasted legacy hash URLs. */
export function useRoute(): Route {
  // Server rendering (tests) has no window: it reads `location` if one is provided, otherwise shows the home page.
  const snapshot = () => (typeof location === 'undefined' ? '/' : currentUrl());
  const url = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => parseRoute(url), [url]);
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

/** Everything here is computed from the catalog; nothing is a usage statistic. */
export function summarize(c: Catalog) {
  const count = (type: string) => c.integrations.filter((i) => i.type === type).length;
  const withAssignments = c.consumers.filter((x) => x.assignments.length > 0);
  return {
    skills: c.skills.length,
    firstParty: c.skills.filter((s) => s.origin === 'first-party').length,
    external: c.skills.filter((s) => s.origin === 'external').length,
    consumers: c.consumers.length,
    consumersWithAssignments: withAssignments.length,
    assignments: c.consumers.reduce((n, x) => n + x.assignments.length, 0),
    integrations: c.integrations.length,
    mcp: count('mcp-server'),
    cli: count('cli-tool'),
    dependencies: count('dependency'),
    discovered: c.skills.filter((x) => stage(x) === 'discovered').length,
    reviewed: c.skills.filter((x) => stage(x) === 'reviewed').length,
    approved: c.skills.filter((x) => stage(x) === 'approved').length,
    rejected: c.skills.filter((x) => stage(x) === 'rejected').length,
    evidence: c.evidence.length,
    agentVerifiedSkills: c.skills.filter((x) => verifiedAgents(c, x).length > 0).length,
    verifiedAssignments: c.consumers
      .flatMap((x) => x.assignments)
      .filter((a) => a.verification.status === 'verified').length,
  };
}

export interface AgentOverview {
  agent: string;
  /** Skills with a current explicit-verified run on this agent. */
  explicitSkills: number;
  natural?: { runs: number; invoked: number };
  behavior?: { runs: number; passed: number };
  control?: { runs: number; passed: number };
  /** Skills with any evidence for this agent. */
  skillsWithEvidence: number;
}

export function agentOverview(c: Catalog): AgentOverview[] {
  return TESTED_AGENTS.map((agent) => {
    const rows = c.skills.map((s) => agentStatus(c, s, agent));
    const add = (
      pick: (r: AgentStatus) => { runs: number; [k: string]: number } | undefined,
      key: string,
    ) => {
      const xs = rows.map(pick).filter((x): x is NonNullable<typeof x> => !!x);
      return xs.length
        ? {
            runs: xs.reduce((n, x) => n + x.runs, 0),
            [key]: xs.reduce((n, x) => n + (x[key] ?? 0), 0),
          }
        : undefined;
    };
    return {
      agent,
      explicitSkills: rows.filter((r) => r.explicit === 'verified').length,
      natural: add((r) => r.natural, 'invoked') as AgentOverview['natural'],
      behavior: add((r) => r.behavior, 'passed') as AgentOverview['behavior'],
      control: add((r) => r.control, 'passed') as AgentOverview['control'],
      skillsWithEvidence: c.skills.filter((s) =>
        evidenceFor(c, s.id).some((e) => e.agent === agent),
      ).length,
    };
  });
}

/** Newest evidence first (by date, then by position in the registry, which is append-only). */
export function recentEvidence(c: Catalog, n: number): Evidence[] {
  return c.evidence
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? b.i - a.i : a.e.date < b.e.date ? 1 : -1))
    .slice(0, n)
    .map((x) => x.e);
}

/** Consumers that have been assigned a skill (intent, not installation). */
export function consumersOf(c: Catalog, skillId: string) {
  return c.consumers.flatMap((consumer) =>
    consumer.assignments
      .filter((a) => a.skill === skillId)
      .map((assignment) => ({ consumer, assignment })),
  );
}

/** Filter rules for the library; shared by the page and the tests. */
export interface SkillFilter {
  q?: string;
  group?: string;
  origin?: string;
  status?: string;
  /** An agent id, "any" (verified on at least one agent) or "none" (verified on no agent). */
  agent?: string;
}
export const FILTER_KEYS = ['q', 'group', 'origin', 'status', 'agent'] as const;

export function filterSkills(c: Catalog, f: SkillFilter): Skill[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return c.skills
    .filter((s) => {
      const verified = f.agent ? verifiedAgents(c, s) : [];
      return (
        (!f.group || groupOf(s) === f.group) &&
        (!f.origin || s.origin === f.origin) &&
        (!f.status || stage(s) === f.status) &&
        (!f.agent ||
          (f.agent === 'any'
            ? verified.length > 0
            : f.agent === 'none'
              ? verified.length === 0
              : verified.includes(f.agent))) &&
        (!q ||
          [s.id, s.name, s.description, s.category, groupOf(s), ...s.tags, s.author ?? ''].some(
            (t) => t.toLowerCase().includes(q),
          ))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const ORIGIN_LABEL: Record<string, string> = {
  'first-party': 'First-party',
  external: 'Third-party',
};
/** Short form for the dropdown, which must fit a 320px-wide screen once an option is selected. */
export const AGENT_OPTION_LABEL = (v: string, t: T = tEn) =>
  v === 'any'
    ? t('Explicit run: any agent')
    : v === 'none'
      ? t('No verified run')
      : t('Explicit run: {agent}', { agent: agentName(v) });
export const AGENT_FILTER_LABEL = (v: string, t: T = tEn) =>
  v === 'any'
    ? t('Explicit run verified on any agent')
    : v === 'none'
      ? t('No verified agent run')
      : t('Explicit run verified on {agent}', { agent: agentName(v) });

/** Human-readable description of one active filter, for the "why is this empty" explanation. */
export function describeFilter(
  key: (typeof FILTER_KEYS)[number],
  value: string,
  t: T = tEn,
): string {
  switch (key) {
    case 'q':
      return t('Search “{value}”', { value });
    case 'group':
      return t('Category {value}', { value: t(value) });
    case 'origin':
      return t('Source {value}', { value: t(ORIGIN_LABEL[value] ?? value) });
    case 'status':
      return t('Status {value}', { value: t(STAGE_LABEL[value as Stage] ?? value) });
    case 'agent':
      return AGENT_FILTER_LABEL(value, t);
  }
}

export interface EmptyExplanation {
  /** Every active filter, in a fixed order. */
  active: { key: (typeof FILTER_KEYS)[number]; label: string }[];
  /** Filters whose removal alone would bring results back, with how many. */
  relaxable: { key: (typeof FILTER_KEYS)[number]; label: string; count: number }[];
}
export function explainEmpty(c: Catalog, f: SkillFilter, t: T = tEn): EmptyExplanation {
  const active = FILTER_KEYS.filter((k) => f[k]).map((key) => ({
    key,
    label: describeFilter(key, f[key]!, t),
  }));
  const relaxable = active
    .map((a) => ({ ...a, count: filterSkills(c, { ...f, [a.key]: undefined }).length }))
    .filter((a) => a.count > 0);
  return { active, relaxable };
}

export type LifecycleKey =
  'registered' | 'reviewed' | 'approved' | 'installed' | 'assigned' | 'activated' | 'verified';
export interface LifecycleRow {
  key: LifecycleKey;
  label: string;
  /** ok = yes; none = no / not applicable; warn = partial; bad = rejected; unknown = this site cannot know. */
  kind: 'ok' | 'none' | 'warn' | 'bad' | 'unknown';
  value: string;
  detail: string;
}

/**
 * The seven separate states of a skill. They are independent facts, not a progress bar: approval says nothing
 * about installation, and nothing here is inferred from anything else. Installation and activation are
 * machine-local, so the static site reports them as "not tracked" rather than guessing; assignment and
 * verification come from the registry. `t` translates the interface wording (default English).
 */
export function lifecycle(c: Catalog, s: Skill, t: T = tEn): LifecycleRow[] {
  const users = consumersOf(c, s.id);
  const external = s.origin === 'external';
  const st = stage(s);
  const verified = verifiedAgents(c, s);
  const natural = TESTED_AGENTS.map((a) => ({ a, n: agentStatus(c, s, a).natural })).filter(
    (x) => x.n,
  );
  const verifiedAssignments = users.filter((u) => u.assignment.verification.status === 'verified');
  const records = evidenceFor(c, s.id).filter((e) => !isEvidenceStale(e, s));
  const names = (xs: typeof users) => xs.map((u) => u.consumer.name).join(', ');
  const NOT_PROVEN = t(
    'This does not establish natural triggering (the agent using the skill unprompted) or a behavioral benefit.',
  );
  const row = (
    key: LifecycleKey,
    label: string,
    kind: LifecycleRow['kind'],
    value: string,
    detail: string,
  ): LifecycleRow => ({ key, label: t(label), kind, value, detail });
  /**
   * Evidence records (per-run, in registry/evidence.json) and assignment verification (per consumer, in
   * registry/consumers.json) are different sources; the row names which one supports it.
   */
  const verifiedRow = (): LifecycleRow => {
    const naturalText = natural.length
      ? t('Natural triggering: {list}. ', {
          list: natural
            .map((x) =>
              t('{agent} {invoked} of {runs} runs', {
                agent: agentName(x.a),
                invoked: x.n!.invoked,
                runs: x.n!.runs,
              }),
            )
            .join('; '),
        })
      : t('Natural triggering has not been tested. ');
    if (verified.length)
      return row(
        'verified',
        'Verified',
        'ok',
        t('Explicit run on {agents}', { agents: verified.map(agentName).join(', ') }),
        `${naturalText}${
          verifiedAssignments.length
            ? t('Assignment verified for {names}. ', { names: names(verifiedAssignments) })
            : ''
        }${t('Explicit use does not establish natural triggering, and neither establishes a behavioral benefit.')}`,
      );
    if (verifiedAssignments.length)
      return row(
        'verified',
        'Verified',
        'ok',
        t('Assignment verified for {names}', { names: names(verifiedAssignments) }),
        `${t('The registry records this assignment as verified (see its notes under Consumers). There are no per-run evidence records for this skill, so the agent status table below is empty.')} ${NOT_PROVEN}`,
      );
    if (records.length)
      return row(
        'verified',
        'Verified',
        'warn',
        t('No verified explicit run'),
        `${t('{n} agent run(s) are recorded, but none is a verified explicit run.', { n: records.length })} ${naturalText}${t('See Agent status.')}`,
      );
    return row(
      'verified',
      'Verified',
      'none',
      t('No agent evidence'),
      t(
        'No agent run is recorded for this skill, and no consumer assignment is verified. Approval and review are not evidence that an agent can use it.',
      ),
    );
  };
  const reviewed = !external
    ? row(
        'reviewed',
        'Reviewed',
        'none',
        t('Not applicable'),
        t('First-party skills are authored here and need no third-party review.'),
      )
    : st === 'discovered'
      ? row(
          'reviewed',
          'Reviewed',
          'none',
          t('No'),
          t('Discovered only. Its content has not been read or scanned.'),
        )
      : row(
          'reviewed',
          'Reviewed',
          'ok',
          `${t('Yes')}${s.review.reviewedAt ? `, ${s.review.reviewedAt}` : ''}`,
          t('Findings are recorded for the pinned revision. A review is not a decision.'),
        );
  const approved = !external
    ? row(
        'approved',
        'Approved',
        'none',
        t('Not applicable'),
        t('No third-party approval is needed for first-party skills.'),
      )
    : st === 'approved'
      ? row(
          'approved',
          'Approved',
          'ok',
          t('Yes'),
          t(
            'The owner allows installing this exact revision. Approval does not install, assign or activate it.',
          ),
        )
      : st === 'rejected'
        ? row(
            'approved',
            'Approved',
            'bad',
            t('Rejected'),
            t('The owner decided against it. It cannot be installed or assigned.'),
          )
        : row(
            'approved',
            'Approved',
            'none',
            t('No'),
            t('Needs an owner decision before it can be installed or assigned.'),
          );
  const rows: LifecycleRow[] = [
    row(
      'registered',
      'Registered',
      'ok',
      t('Yes'),
      external
        ? t('Listed in the registry with a pinned upstream revision.')
        : t('Listed in the registry; the skill lives in this repository.'),
    ),
    reviewed,
    approved,
    external
      ? row(
          'installed',
          'Installed',
          'unknown',
          t('Not tracked here'),
          t(
            'Installs are per machine and are not part of this catalog. Check with pnpm skills:status.',
          ),
        )
      : row(
          'installed',
          'Installed',
          'none',
          t('Not applicable'),
          t('First-party skills are used from their folder in this repository.'),
        ),
    users.length
      ? row(
          'assigned',
          'Assigned',
          'ok',
          users.length === 1
            ? t('{n} consumer', { n: users.length })
            : t('{n} consumers', { n: users.length }),
          `${names(users)}. ${t('This is desired state in the registry.')}`,
        )
      : row(
          'assigned',
          'Assigned',
          'none',
          t('No consumer'),
          t('No consumer in the registry has this skill assigned.'),
        ),
    users.length
      ? row(
          'activated',
          'Activated',
          'unknown',
          t('Not tracked here'),
          t(
            'Activation is a project-local link on a machine. An assignment does not create it. Check with pnpm skills:verify <consumer>.',
          ),
        )
      : row(
          'activated',
          'Activated',
          'none',
          t('Not expected'),
          t('It is not assigned, so no consumer should have it linked.'),
        ),
    verifiedRow(),
  ];
  return rows;
}

import { compareVersions, curationBlockers, releaseInstallProblems } from './availability.ts';
import { distributionOf, isRestricted, ownershipOf } from './ownership.ts';
import {
  REVIEW_CATEGORIES,
  REVIEW_SCOPES,
  registrySchema,
  type Catalog,
  type Registry,
} from './schema.ts';

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

export interface BuildOptions {
  /**
   * public (default): the public registry, where every record must be public. workspace: the public registry merged
   * with the private root on this machine (private.ts); never used to generate anything that is published.
   */
  scope?: 'public' | 'workspace';
}

/** Visibility of a record; absent means public (the private loader labels every private record explicitly). */
export const visibilityOf = (x: { visibility?: 'public' | 'private' | 'local' }) =>
  x.visibility ?? 'public';

/** Validate raw registry data and, if valid, produce the normalized catalog. */
export function buildCatalog(
  raw: unknown,
  { scope = 'public' }: BuildOptions = {},
): ValidationResult {
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
    // releases have no id of their own: their (skill, version) uniqueness is checked with the release rules
    if (kind !== 'releases' && kind !== 'evaluations' && kind !== 'updates')
      for (const d of duplicates((items as { id: string }[]).map((x) => x.id)))
        errors.push(`duplicate ${kind} id: ${d}`);
    for (const [p, s] of strings(items, kind))
      for (const [re, label] of FORBIDDEN)
        if (re.test(s)) errors.push(`${p}: contains ${label}; not allowed in public catalog`);
  }

  // ---- visibility (ES24): the public registry holds public records only; exclusion happens here, before any output
  if (scope === 'public')
    for (const [kind, items] of [
      ['skill', reg.skills.map((x) => [x.id, x] as const)],
      ['source', reg.sources.map((x) => [x.id, x] as const)],
      ['release', reg.releases.map((x) => [`${x.skill}@${x.version}`, x] as const)],
    ] as const)
      for (const [key, x] of items)
        if (visibilityOf(x) !== 'public')
          errors.push(
            `${kind} ${key}: visibility "${visibilityOf(x)}" is not allowed in the public registry; private records belong in the private root`,
          );
  for (const r of reg.releases) {
    const sk = reg.skills.find((k) => k.id === r.skill);
    if (sk && visibilityOf(sk) === 'public' && visibilityOf(r) !== 'public')
      errors.push(
        `release ${r.skill}@${r.version}: a private release of a public skill would leak through public assignments; register the private copy as a private skill`,
      );
    if (sk && visibilityOf(sk) !== 'public' && visibilityOf(r) === 'public')
      errors.push(
        `release ${r.skill}@${r.version}: ${r.skill} is ${visibilityOf(sk)}, so its releases cannot be public`,
      );
  }

  // ---- ownership and distribution (ES25): explicit, consistent with the source, never inferred from a name
  for (const s of reg.skills) {
    const at = `skill ${s.id}`;
    if (s.ownership === 'third-party' && s.origin !== 'external')
      errors.push(`${at}: ownership "third-party" requires an external skill`);
    if (s.ownership && s.ownership !== 'third-party' && s.origin !== 'first-party')
      errors.push(
        `${at}: ownership "${s.ownership}" requires a first-party skill whose content is maintained here or in the private root; an external upstream cannot establish ownership`,
      );
    const d = distributionOf(s);
    if (d.policy === 'restricted' && !d.access)
      errors.push(`${at}: a restricted distribution needs an "access" policy`);
    if (d.policy !== 'restricted' && d.access)
      errors.push(`${at}: "access" applies to restricted distribution only`);
    if (d.access === 'owner-only' && ownershipOf(s) === 'third-party')
      errors.push(
        `${at}: owner-only access applies to skills the owner maintains, not third-party`,
      );
    if (visibilityOf(s) !== 'public' && d.policy === 'open')
      errors.push(
        `${at}: a ${visibilityOf(s)} skill cannot be open; installing it always needs an authorization`,
      );
  }
  for (const c of reg.consumers)
    if (c.kind === 'global' && c.ownership)
      errors.push(`consumer ${c.id}: global consumers have no ownership and are never authorized`);

  // ---- integrations with a repository contract (ES24)
  const repoNames = new Map<string, string>();
  for (const i of reg.integrations) {
    const at = `integration ${i.id}`;
    const sourceType = i.type === 'asset-catalog' || i.type === 'config-registry';
    if (sourceType && (!i.repository || !i.contract))
      errors.push(`${at}: an ${i.type} needs "repository" and "contract"`);
    if (!sourceType && (i.repository || i.contract))
      errors.push(
        `${at}: "repository" and "contract" apply to asset-catalog and config-registry only`,
      );
    if (i.repository) {
      if (i.repository.visibility === 'private' && i.repository.url)
        errors.push(`${at}: a private repository is named only, never linked`);
      for (const n of [i.repository.name, ...i.repository.formerNames]) {
        const other = repoNames.get(n.toLowerCase());
        if (other) errors.push(`${at}: repository name "${n}" is also used by ${other}`);
        repoNames.set(n.toLowerCase(), i.id);
      }
    }
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
    for (const src of c.ecosystem?.sources ?? []) {
      const i = integrations.get(src);
      if (!i) errors.push(`${at}: ecosystem source "${src}" is not a registered integration`);
      else if (i.type !== 'asset-catalog' && i.type !== 'config-registry')
        errors.push(
          `${at}: ecosystem source "${src}" is a ${i.type}, not an asset catalog or config registry`,
        );
    }
    if (
      c.ecosystem?.project &&
      !c.ecosystem.sources.some((x) => integrations.get(x)?.type === 'config-registry')
    )
      errors.push(`${at}: an Ecosystem Config project id needs a config-registry source`);
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
      // ES25: restricted skills are authorized only by private access records, never by a public assignment;
      // not-distributable skills are never assigned at all (in the workspace, access records become assignments)
      if (target && distributionOf(target).policy === 'not-distributable')
        errors.push(`${at}: "${a.skill}" is not distributable; it cannot be assigned or installed`);
      else if (target && scope === 'public' && isRestricted(target))
        errors.push(
          `${at}: "${a.skill}" is restricted; it is authorized only by an access record in the private root, never assigned in registry/consumers.json`,
        );
      if (a.release) {
        // curated assignment: the approved release, not the skill's legacy approval, is the gate
        const rel = reg.releases.find((r) => r.skill === a.skill && r.version === a.release);
        // open public first-party skills live in this repository and are not released; private and restricted
        // ones are (ES24, ES25)
        if (
          !target ||
          (target.source.type !== 'external' &&
            visibilityOf(target) === 'public' &&
            !isRestricted(target))
        )
          errors.push(
            `${at}: assignment "${a.skill}" pins a curated release, but only external or private skills have releases`,
          );
        else if (!rel)
          errors.push(`${at}: assignment "${a.skill}" pins unknown release ${a.release}`);
        else {
          const problems = releaseInstallProblems(target, rel);
          if (problems.length)
            errors.push(
              `${at}: assignment "${a.skill}" pins ${a.skill}@${a.release}, which is not installable (${problems.map((p) => p.code).join(', ')})`,
            );
        }
        if (a.install !== 'symlink')
          errors.push(`${at}: curated assignment "${a.skill}" supports symlink activation only`);
      } else if (target?.source.type === 'external' && target.review.status !== 'approved')
        errors.push(
          `${at}: assigns external skill "${a.skill}" whose review status is "${target.review.status}"; only approved external skills can be assigned`,
        );
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

  const sources = new Map(reg.sources.map((x) => [x.id, x]));
  for (const x of reg.sources) {
    const at = `source ${x.id}`;
    const registers =
      x.decision === 'register-for-review' || x.decision === 'register-with-warnings';
    if (x.resolution === 'verified') {
      if (!x.upstream) errors.push(`${at}: a verified source requires "upstream"`);
      if (registers && !x.revision)
        errors.push(
          `${at}: a source that registers skills requires the pinned "revision" examined`,
        );
    } else {
      if (x.decision !== 'unresolved' && x.decision !== 'reject')
        errors.push(
          `${at}: resolution "${x.resolution}" only allows decision "unresolved" or "reject"`,
        );
      if (x.revision) errors.push(`${at}: an ${x.resolution} source must not carry a "revision"`);
    }
    if (x.decision === 'unresolved' && !x.needs)
      errors.push(
        `${at}: an unresolved source must say what information would resolve it ("needs")`,
      );
    if (registers && x.skills.length === 0)
      errors.push(`${at}: decision "${x.decision}" requires at least one registered skill`);
    if (!registers && x.skills.length > 0)
      errors.push(`${at}: decision "${x.decision}" cannot list registered skills`);
    for (const d of duplicates(x.skills)) errors.push(`${at}: skill "${d}" listed more than once`);
    for (const sid of x.skills) {
      const sk = reg.skills.find((k) => k.id === sid);
      if (!sk) errors.push(`${at}: lists unknown skill "${sid}"`);
      else if (sk.source.type !== 'external' || sk.source.upstream.url !== x.upstream?.url)
        errors.push(
          `${at}: skill "${sid}" does not come from ${x.upstream?.url ?? '(no upstream)'}`,
        );
      else if (
        x.decision === 'register-for-review' &&
        sk.discovery?.outcome === 'register-with-warnings'
      )
        errors.push(
          `${at}: skill "${sid}" has warnings, so the source decision must be register-with-warnings`,
        );
    }
  }
  for (const s of reg.skills) {
    const d = s.discovery;
    if (!d) continue;
    const at = `skill ${s.id}`;
    const src = sources.get(d.source);
    if (s.source.type !== 'external')
      errors.push(`${at}: only external skills carry a discovery record`);
    if (!src) errors.push(`${at}: discovery names unknown source "${d.source}"`);
    else if (!src.skills.includes(s.id))
      errors.push(`${at}: source "${src.id}" does not list this skill`);
    if (d.outcome === 'register-with-warnings' && d.warnings.length === 0)
      errors.push(`${at}: outcome register-with-warnings requires at least one warning`);
    if (d.outcome === 'register-for-review' && d.warnings.length > 0)
      errors.push(`${at}: outcome register-for-review cannot carry warnings`);
    if (d.approvalBlockers.length > 0 && d.warnings.length === 0)
      errors.push(`${at}: approval blockers must also be visible as warnings`);
    if (s.source.type === 'external') {
      const r = s.review;
      // A review of the pinned revision covers the same bytes the discovery scan hashed.
      if (
        r.status !== 'unreviewed' &&
        r.status !== 'rejected' &&
        r.revision === s.source.revision &&
        r.contentHash &&
        r.contentHash !== d.contentHash
      )
        errors.push(
          `${at}: review contentHash differs from the discovery contentHash at the same revision`,
        );
      if (r.status === 'approved') {
        if (d.approvalBlockers.length > 0)
          errors.push(
            `${at}: approved, but discovery lists ${d.approvalBlockers.length} approval blocker(s); resolve them and clear the list first`,
          );
        if (d.warnings.length > 0 && r.findings.length === 0)
          errors.push(
            `${at}: approved without review findings, but discovery recorded ${d.warnings.length} warning(s); the review must address them`,
          );
      }
    }
  }
  // A repository-root skill cannot be installed (the installer refuses whole repositories), so it cannot be approved.
  for (const s of reg.skills)
    if (s.source.type === 'external' && s.source.path === '.' && s.review.status === 'approved')
      errors.push(
        `skill ${s.id}: a repository-root skill ("path": ".") cannot be approved until a subset install strategy exists`,
      );

  // ---- curated releases (ES17): content availability is separate from review, security review and approval
  const releaseKeys = new Set<string>();
  const skillById = new Map(reg.skills.map((k) => [k.id, k]));
  for (const k of reg.skills) {
    if (k.curation && reg.releases.some((r) => r.skill === k.id))
      errors.push(
        `skill ${k.id}: "curation" records intent for a skill without a release, but a curated release exists; remove it`,
      );
    if (k.curation && k.source.type === 'first-party')
      errors.push(
        `skill ${k.id}: first-party skills are not curated (their content already lives here)`,
      );
  }
  for (const r of reg.releases) {
    const at = `release ${r.skill}@${r.version}`;
    const key = `${r.skill}@${r.version}`;
    if (releaseKeys.has(key)) errors.push(`${at}: duplicate version for this skill`);
    releaseKeys.add(key);
    const sk = skillById.get(r.skill);
    if (!sk) {
      errors.push(`${at}: unknown skill "${r.skill}"`);
      continue;
    }
    if (r.path !== `library/${r.skill}/${r.version}`)
      errors.push(`${at}: path must be library/${r.skill}/${r.version}`);
    const lic = r.license.trim().toLowerCase();
    if (lic === 'unknown' || lic === 'none')
      errors.push(
        `${at}: a curated release needs a known licence (redistribution rights must be established)`,
      );
    if (sk.source.type === 'first-party') {
      if (r.upstream) errors.push(`${at}: a first-party skill has no upstream`);
      if (r.modifications.length)
        errors.push(`${at}: modifications are relative to an upstream; none applies`);
    } else {
      const u = r.upstream;
      if (!u) errors.push(`${at}: a release of an external skill must record its upstream`);
      else {
        if (u.url !== sk.source.upstream.url || u.path !== sk.source.path)
          errors.push(
            `${at}: upstream does not match the skill's registered source (${sk.source.upstream.url} ${sk.source.path})`,
          );
        const same = r.curatedHash === u.contentHash;
        if (same && r.modifications.length)
          errors.push(
            `${at}: lists modifications although the curated hash equals the upstream hash`,
          );
        if (!same && r.modifications.length === 0)
          errors.push(
            `${at}: the curated hash differs from the upstream hash, so the modifications must be listed`,
          );
      }
      for (const b of curationBlockers(sk))
        errors.push(
          `${at}: curation is blocked for this skill (${b.code}${b.detail ? `: ${b.detail}` : ''})`,
        );
    }
    const paths = r.modifications.map((m) => m.path);
    for (const d of duplicates(paths))
      errors.push(`${at}: modification path "${d}" listed more than once`);

    // -- security review record
    const rv = r.review;
    const done = rv.outcome !== 'not-evaluated';
    if (!done) {
      if (rv.evidence.length || rv.checks.some((c) => c.result !== 'not-evaluated'))
        errors.push(`${at}: review outcome is not-evaluated but it records evidence or results`);
    } else {
      if (!rv.reviewer || !rv.reviewedAt || !rv.scope)
        errors.push(
          `${at}: review outcome "${rv.outcome}" requires reviewer, reviewedAt and scope`,
        );
      if (rv.evidence.length === 0)
        errors.push(`${at}: review outcome "${rv.outcome}" requires evidence`);
      if (rv.contentHash !== r.curatedHash)
        errors.push(
          `${at}: review must record the contentHash it covered, equal to the release's curatedHash`,
        );
    }
    const has = (res: string) => rv.checks.some((c) => c.result === res);
    if (rv.outcome === 'no-blocking-issues') {
      for (const cat of REVIEW_CATEGORIES)
        for (const sc of REVIEW_SCOPES)
          if (
            !rv.checks.some(
              (c) => c.category === cat && c.scope === sc && c.result === 'no-issue-found',
            )
          )
            errors.push(
              `${at}: "no-blocking-issues" requires ${cat} / ${sc} to be checked with no issue found`,
            );
      if (!rv.evidence.some((e) => e.method === 'manual-read'))
        errors.push(
          `${at}: "no-blocking-issues" requires manual-read evidence; a static scan alone is not a review`,
        );
      if (has('issue-found') || has('needs-manual-review'))
        errors.push(
          `${at}: "no-blocking-issues" contradicts a recorded issue or open manual review`,
        );
    }
    if (rv.outcome === 'requires-changes' && !has('issue-found'))
      errors.push(`${at}: "requires-changes" must record at least one issue-found check`);
    if (rv.outcome === 'requires-manual-review' && !has('needs-manual-review'))
      errors.push(
        `${at}: "requires-manual-review" must record at least one needs-manual-review check`,
      );
    if (rv.outcome === 'blocked' && (!has('issue-found') || !rv.notes))
      errors.push(`${at}: "blocked" must record an issue-found check and notes`);

    // -- out-of-folder references (ES22)
    for (const ref of r.references) {
      const where = `${at}: reference ${ref.path} -> ${ref.target}`;
      if (ref.resolution === 'unresolved') {
        if (ref.requires)
          errors.push(`${where}: an unresolved reference cannot name a required release`);
        continue;
      }
      if (!ref.requires) {
        errors.push(`${where}: requires-release must name the required skill and version`);
        continue;
      }
      const dep = reg.releases.find(
        (x) => x.skill === ref.requires!.skill && x.version === ref.requires!.version,
      );
      if (!dep)
        errors.push(
          `${where}: required release ${ref.requires.skill}@${ref.requires.version} does not exist`,
        );
      // the link only resolves if the sibling is installed under the folder name the link expects
      const expected = ref.target
        .replace(/^\.\/+/, '')
        .split('/')
        .find((seg) => seg !== '..' && seg !== '.');
      if (ref.target.startsWith('../') && expected && expected !== ref.requires.skill)
        errors.push(
          `${where}: mismatched dependency: the link expects a sibling folder "${expected}", but ${ref.requires.skill} installs as "${ref.requires.skill}"`,
        );
      if (r.approval.status === 'approved' && dep && dep.approval.status !== 'approved')
        errors.push(
          `${where}: approved, but the required release ${dep.skill}@${dep.version} is not approved`,
        );
    }

    // -- release approval
    const ap = r.approval;
    if (ap.status === 'unapproved' && (ap.approvedBy || ap.approvedAt))
      errors.push(`${at}: an unapproved release cannot carry approvedBy/approvedAt`);
    if (ap.status === 'approved') {
      if (!ap.approvedBy || !ap.approvedAt)
        errors.push(`${at}: an approved release requires approvedBy and approvedAt`);
      if (rv.outcome !== 'no-blocking-issues')
        errors.push(`${at}: approved, but the security review outcome is "${rv.outcome}"`);
      if (sk.review.status === 'rejected')
        errors.push(`${at}: approved, but the skill is rejected`);
      for (const b of sk.discovery?.approvalBlockers ?? [])
        errors.push(`${at}: approved, but the skill has an unresolved approval blocker: ${b}`);
      for (const ref of r.references)
        if (ref.resolution === 'unresolved')
          errors.push(
            `${at}: approved, but ${ref.path} links outside the release (${ref.target}) and the reference is unresolved`,
          );
    }
  }

  // ---- evaluations (ES19): static assessments never pose as agent runs; recommendations never approve
  for (const ev of reg.evaluations) {
    const at = `evaluation ${ev.id}`;
    const sk = reg.skills.find((x) => x.id === ev.skill);
    if (!sk) {
      errors.push(`${at}: unknown skill "${ev.skill}"`);
      continue;
    }
    if (sk.source.type === 'external' && (!ev.revision || !ev.contentHash))
      errors.push(
        `${at}: an external skill's evaluation must record the revision and contentHash it covers`,
      );
    if (ev.comparison.alternative && !reg.skills.some((x) => x.id === ev.comparison.alternative))
      errors.push(`${at}: unknown alternative "${ev.comparison.alternative}"`);
    if (ev.kind === 'static-assessment') {
      if (ev.comparison.status !== 'not-run')
        errors.push(`${at}: a static assessment cannot report an agent comparison as run`);
      if (ev.evidence.length)
        errors.push(`${at}: a static assessment cannot cite agent-run evidence`);
    } else {
      if (ev.comparison.status !== 'run')
        errors.push(`${at}: an agent-run evaluation must have run its comparison`);
      if (!ev.evidence.length)
        errors.push(`${at}: an agent-run evaluation must cite evidence records`);
      for (const e of ev.evidence) {
        const rec = reg.evidence.find((x) => x.id === e);
        if (!rec) errors.push(`${at}: unknown evidence "${e}"`);
        else if (rec.skill !== ev.skill && rec.skill !== ev.comparison.alternative)
          errors.push(`${at}: evidence "${e}" is for another skill`);
      }
    }
    if (ev.recommendation === 'keep-approved' && sk.review.status !== 'approved')
      errors.push(`${at}: "keep-approved" applies only to an approved skill`);
  }
  for (const d of duplicates(reg.evaluations.map((x) => x.id)))
    errors.push(`duplicate evaluation id: ${d}`);

  // ---- upstream checks (ES20): one record per external skill; a check never changes a pin or an approval
  for (const d of duplicates(reg.updates.map((x) => x.skill)))
    errors.push(`duplicate upstream check for ${d}`);
  for (const u of reg.updates) {
    const sk = reg.skills.find((x) => x.id === u.skill);
    if (!sk) errors.push(`upstream check ${u.skill}: unknown skill`);
    else if (sk.source.type !== 'external')
      errors.push(`upstream check ${u.skill}: first-party skills have no upstream`);
    if (
      (u.status === 'up-to-date' ||
        u.status === 'update-available' ||
        u.status === 'review-required') &&
      !u.latestRevision
    )
      errors.push(
        `upstream check ${u.skill}: ${u.status} requires the latest revision that was seen`,
      );
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
    sources: reg.sources.map((x) => ({ ...x, skills: sortedUnique(x.skills) })).sort(byId),
    evaluations: [...reg.evaluations].sort(byId),
    updates: [...reg.updates].sort((a, b) => (a.skill < b.skill ? -1 : 1)),
    releases: [...reg.releases].sort((a, b) =>
      a.skill === b.skill ? compareVersions(a.version, b.version) : a.skill < b.skill ? -1 : 1,
    ),
  };
  return { ok: true, catalog };
}

import { useMemo } from 'react';
import { useT } from '../i18n.tsx';
import {
  AGENT_OPTION_LABEL,
  agentName,
  availabilityOf,
  CONTENT_LABEL,
  consumersOf,
  DISTRIBUTION_LABEL,
  OWNERSHIP_LABEL,
  contentFilterStates,
  explainEmpty,
  FILTER_KEYS,
  filterSkills,
  groupOf,
  groupsInUse,
  hasDiscoveryWarnings,
  isRestricted,
  ORIGIN_LABEL,
  skillHref,
  skillsPath,
  sourceLabel,
  STAGE_LABEL,
  TESTED_AGENTS,
  verifiedAgents,
  type Catalog,
  type Query,
  type Skill,
  type SkillFilter,
  type Stage,
} from '../lib.ts';
import { navigate } from '../router.ts';
import { Badge, CheckIcon, Empty, PageHeader, SearchIcon } from '../ui.tsx';
import { DistributionBadge, OwnershipBadge, SourceBadge, StageBadge } from './shared.tsx';

const control =
  'h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100';

/** One badge for the content states that matter; plain source references (the default) carry none. */
function ContentBadge({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const a = availabilityOf(catalog, skill);
  if (a.release)
    return (
      <Badge tone={a.state === 'curated-approved' ? 'green' : 'amber'}>
        {a.state === 'curated-approved'
          ? t('Curated v{version} · approved', { version: a.release.version })
          : t('Curated v{version} · not approved', { version: a.release.version })}
      </Badge>
    );
  if (a.state === 'curation-blocked' || a.state === 'curation-pending')
    return <Badge>{t(CONTENT_LABEL[a.state])}</Badge>;
  return null;
}

export function SkillCard({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const verified = verifiedAgents(catalog, skill);
  const assigned = consumersOf(catalog, skill.id).length;
  return (
    <li className="relative flex min-w-0">
      <div className="surface surface-hover relative flex w-full flex-col p-4 focus-within:ring-2 focus-within:ring-indigo-500">
        <h2 className="text-base font-semibold tracking-tight [overflow-wrap:anywhere]">
          {/* Stretched link: the whole card is one focusable target. */}
          <a
            href={skillHref(skill.id)}
            className="card-link after:absolute after:inset-0 after:content-['']"
          >
            {skill.name}
          </a>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SourceBadge skill={skill} />
          <OwnershipBadge skill={skill} />
          <DistributionBadge skill={skill} />
          <StageBadge skill={skill} />
          <Badge>{t(groupOf(skill))}</Badge>
          {hasDiscoveryWarnings(skill) && <Badge tone="amber">{t('Has warnings')}</Badge>}
          <ContentBadge catalog={catalog} skill={skill} />
        </div>
        <p className="mt-3 line-clamp-3 text-sm [overflow-wrap:anywhere] text-zinc-600 dark:text-zinc-400">
          {skill.description}
        </p>
        <div className="mt-auto pt-3">
          {verified.length ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-emerald-800 dark:text-emerald-400">
              {verified.map((a) => (
                <span key={a} className="inline-flex items-center gap-1">
                  <CheckIcon width={13} height={13} />
                  {t('Explicit run verified on {agent}', { agent: agentName(a) })}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('No verified agent run')}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {isRestricted(skill)
              ? t('Authorizations are not published')
              : assigned
                ? assigned === 1
                  ? t('Assigned to {n} consumer', { n: assigned })
                  : t('Assigned to {n} consumers', { n: assigned })
                : t('Not assigned')}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {skill.origin === 'external'
              ? `${sourceLabel(skill)} · ${skill.license ?? t('no license')}`
              : skill.source.type === 'first-party'
                ? skill.source.path
                : ''}
          </p>
        </div>
      </div>
    </li>
  );
}

export function SkillsExplorer({ catalog, query }: { catalog: Catalog; query?: Query }) {
  const t = useT();
  // The URL is the single source of truth for the filters: opening a filtered URL restores them, and Back and
  // Forward step through earlier filter states. Only the known filter parameters are read.
  const f = useMemo<SkillFilter>(() => {
    const out: SkillFilter = {};
    for (const k of FILTER_KEYS) if (query?.[k]) out[k] = query[k];
    return out;
  }, [query]);
  const groups = useMemo(() => groupsInUse(catalog), [catalog]);
  const shown = filterSkills(catalog, f);
  const active = FILTER_KEYS.filter((k) => f[k]);

  /** Update one filter. Typing in the search box replaces the history entry; choosing a filter adds one. */
  const set = (k: keyof SkillFilter) => (v: string) => {
    const next: SkillFilter = { ...f, [k]: v || undefined };
    const q = Object.fromEntries(FILTER_KEYS.filter((x) => next[x]).map((x) => [x, next[x]!]));
    navigate(skillsPath(q), { replace: k === 'q' });
  };

  return (
    <>
      <PageHeader
        title={t('Skills')}
        subtitle={t(
          'Reusable agent capabilities registered here: first-party skills and third-party candidates. Open a skill for its lifecycle, provenance, review and agent evidence.',
        )}
      />
      {catalog.skills.length === 0 ? (
        <Empty title={t('No skills registered yet')}>
          {t('External skills are added only after discovery and review.')}
        </Empty>
      ) : (
        <>
          <form
            role="search"
            aria-label={t('Filter skills')}
            className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="relative col-span-2 sm:col-span-3 lg:col-span-1">
              <span className="sr-only">{t('Search skills')}</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
              <input
                type="search"
                placeholder={t('Search name, description, tags…')}
                value={f.q ?? ''}
                onChange={(e) => set('q')(e.target.value)}
                className={`${control} pl-9`}
              />
            </label>
            <label>
              <span className="sr-only">{t('Category')}</span>
              <select
                value={f.group ?? ''}
                onChange={(e) => set('group')(e.target.value)}
                className={control}
              >
                <option value="">{t('All categories')}</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {t(g)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Source')}</span>
              <select
                value={f.origin ?? ''}
                onChange={(e) => set('origin')(e.target.value)}
                className={control}
              >
                <option value="">{t('All sources')}</option>
                <option value="first-party">{t(ORIGIN_LABEL['first-party']!)}</option>
                <option value="external">{t(ORIGIN_LABEL.external!)}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Owner')}</span>
              <select
                value={f.owner ?? ''}
                onChange={(e) => set('owner')(e.target.value)}
                className={control}
              >
                <option value="">{t('All owners')}</option>
                {Object.entries(OWNERSHIP_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Review and approval status')}</span>
              <select
                value={f.status ?? ''}
                onChange={(e) => set('status')(e.target.value)}
                className={control}
              >
                <option value="">{t('Any review status')}</option>
                {(Object.keys(STAGE_LABEL) as Stage[])
                  .filter((k) => k !== 'first-party') // first-party is a source, chosen with the Source filter
                  .map((k) => (
                    <option key={k} value={k}>
                      {t(STAGE_LABEL[k])}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Content availability')}</span>
              <select
                value={f.content ?? ''}
                onChange={(e) => set('content')(e.target.value)}
                className={control}
              >
                <option value="">{t('Any content availability')}</option>
                {contentFilterStates(catalog).map((k) => (
                  <option key={k} value={k}>
                    {t(CONTENT_LABEL[k])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Agent verification evidence')}</span>
              <select
                value={f.agent ?? ''}
                onChange={(e) => set('agent')(e.target.value)}
                className={control}
              >
                <option value="">{t('Any evidence')}</option>
                <option value="any">{AGENT_OPTION_LABEL('any', t)}</option>
                {TESTED_AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {AGENT_OPTION_LABEL(a, t)}
                  </option>
                ))}
                <option value="none">{AGENT_OPTION_LABEL('none', t)}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t('Distribution')}</span>
              <select
                value={f.distribution ?? ''}
                onChange={(e) => set('distribution')(e.target.value)}
                className={control}
              >
                <option value="">{t('Any distribution')}</option>
                {Object.entries(DISTRIBUTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            <p aria-live="polite">
              {t('{n} of {total} skills', { n: shown.length, total: catalog.skills.length })}
            </p>
            {active.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(skillsPath({}))}
                className="rounded-md px-2 py-1 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {t('Clear filters')}
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <NoMatches catalog={catalog} filter={f} onRemove={(k) => set(k)('')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => (
                <SkillCard key={s.id} catalog={catalog} skill={s} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** Says which filters are active and which single one, if removed, would bring results back. */
function NoMatches({
  catalog,
  filter,
  onRemove,
}: {
  catalog: Catalog;
  filter: SkillFilter;
  onRemove: (key: (typeof FILTER_KEYS)[number]) => void;
}) {
  const t = useT();
  const { active, relaxable } = explainEmpty(catalog, filter, t);
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="font-medium">{t('No skills match these filters')}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {t('Every filter must match at once. Active: {list}.', {
          list: active.map((a) => a.label).join(' + '),
        })}
      </p>
      {relaxable.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {relaxable.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onRemove(r.key)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {r.count === 1
                  ? t('Remove {label} to show {n} skill', { label: r.label, n: r.count })
                  : t('Remove {label} to show {n} skills', { label: r.label, n: r.count })}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t('No single filter is the cause; the combination is too narrow. Use “Clear filters”.')}
        </p>
      )}
    </div>
  );
}

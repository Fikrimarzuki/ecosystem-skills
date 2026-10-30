import { useId, useMemo, useState } from 'react';
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
  hiddenMatch,
  isRestricted,
  ORIGIN_LABEL,
  skillHref,
  skillsPath,
  skillSourceLink,
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
import { Highlight } from '../highlight.tsx';
import { navigate } from '../router.ts';
import { Badge, CheckIcon, Empty, ExternalIcon, PageHeader, SearchIcon } from '../ui.tsx';
import { useViewMode, ViewToggle } from '../view.tsx';
import { DistributionBadge, OwnershipBadge, SourceBadge, StageBadge } from './shared.tsx';

const control = 'control';

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

export function SkillCard({
  catalog,
  skill,
  query,
}: {
  catalog: Catalog;
  skill: Skill;
  query?: string;
}) {
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
            <Highlight text={skill.name} query={query} />
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
          <Highlight text={skill.description} query={query} />
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
            {skill.origin === 'external' ? (
              <>
                <Highlight text={sourceLabel(skill)} query={query} />
                {` · ${skill.license ?? t('no license')}`}
              </>
            ) : skill.source.type === 'first-party' ? (
              skill.source.path
            ) : (
              ''
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

/** One labelled dropdown of the filter sidebar. A chosen value is marked with an indigo border. */
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${control} ${value ? 'border-indigo-500 dark:border-indigo-400' : ''}`}
      >
        {children}
      </select>
    </label>
  );
}

const LIST_COLS = 'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start md:gap-4';

/** List view: exactly two columns. Review, approval, evidence and distribution stay on the skill page. */
function SkillRow({ catalog, skill, query }: { catalog: Catalog; skill: Skill; query?: string }) {
  const t = useT();
  const src = skillSourceLink(catalog, skill);
  const hidden = hiddenMatch(skill, query);
  return (
    <li
      className={`space-y-1.5 border-b border-zinc-200 px-3 py-3 last:border-b-0 md:space-y-0 dark:border-zinc-800 ${LIST_COLS}`}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold [overflow-wrap:anywhere]">
          <a href={skillHref(skill.id)} className="underline-offset-2 hover:underline">
            <Highlight text={skill.name} query={query} />
          </a>
        </h2>
        <p className="mt-0.5 line-clamp-2 text-sm [overflow-wrap:anywhere] text-zinc-600 dark:text-zinc-400">
          <Highlight text={skill.description} query={query} />
        </p>
        {hidden && (
          <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-zinc-600 dark:text-zinc-400">
            {t('Matches')} ·{' '}
            {
              {
                Tags: t('Tags'),
                'Skill ID': t('Skill ID'),
                Author: t('Author'),
                Category: t('Category'),
              }[hidden.field]
            }
            : <Highlight text={hidden.value} query={query} />
          </p>
        )}
      </div>
      <div className="flex min-w-0 gap-2 text-sm md:block">
        <span className="w-20 shrink-0 text-zinc-500 md:sr-only dark:text-zinc-400">
          {t('Source')}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {src.url ? (
            <a
              href={src.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
            >
              <Highlight text={src.label} query={query} />
              <ExternalIcon width={12} height={12} />
              <span className="sr-only">
                {' '}
                {t('{name} (opens in a new tab)', { name: skill.name })}
              </span>
            </a>
          ) : (
            <Highlight text={src.label} query={query} />
          )}
        </span>
      </div>
    </li>
  );
}

export function SkillsExplorer({ catalog, query }: { catalog: Catalog; query?: Query }) {
  const t = useT();
  const panelId = useId();
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useViewMode('skills');
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
  const activeFilters = active.filter((k) => k !== 'q'); // the sidebar's own filters; search lives above the results

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
        <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-x-8">
          {/* Search and view toggle: above the results on every width. */}
          <form
            role="search"
            aria-label={t('Search skills')}
            className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:col-start-2 lg:row-start-1"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="relative col-span-2 sm:col-span-1">
              <span className="sr-only">{t('Search skills')}</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
              <input
                type="search"
                placeholder={t('Search name, description, tags…')}
                value={f.q ?? ''}
                onChange={(e) => set('q')(e.target.value)}
                className={`${control} control-search`}
              />
            </label>
            <div className="col-span-2 sm:col-span-1">
              <ViewToggle mode={view} onChange={setView} label={t('Show skills as')} />
            </div>
          </form>

          {/* Filters: one set of controls, a sticky sidebar from lg and a disclosure panel below it. */}
          <aside className="mb-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mb-0">
            <button
              type="button"
              aria-expanded={panelOpen}
              aria-controls={panelId}
              onClick={() => setPanelOpen(!panelOpen)}
              className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white/90 px-3 text-sm shadow-sm hover:border-zinc-400 lg:hidden dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-zinc-500"
            >
              <span>{t('Filters')}</span>
              {activeFilters.length > 0 && (
                <Badge tone="indigo">{t('{n} active', { n: activeFilters.length })}</Badge>
              )}
            </button>
            <div
              id={panelId}
              role="group"
              aria-label={t('Filter skills')}
              className={`${panelOpen ? 'mt-2 block' : 'hidden'} surface p-3 lg:sticky lg:top-20 lg:mt-0 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-1 lg:shadow-none lg:backdrop-blur-none dark:lg:bg-transparent`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t('Filters')}</h2>
                {active.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(skillsPath({}))}
                    className="rounded-md px-2 py-1 text-sm underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {t('Clear all')}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <FilterSelect label={t('Category')} value={f.group} onChange={set('group')}>
                  <option value="">{t('All categories')}</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {t(g)}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect label={t('Source')} value={f.origin} onChange={set('origin')}>
                  <option value="">{t('All sources')}</option>
                  <option value="first-party">{t(ORIGIN_LABEL['first-party']!)}</option>
                  <option value="external">{t(ORIGIN_LABEL.external!)}</option>
                </FilterSelect>
                <FilterSelect label={t('Owner')} value={f.owner} onChange={set('owner')}>
                  <option value="">{t('All owners')}</option>
                  {Object.entries(OWNERSHIP_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {t(v)}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label={t('Review and approval status')}
                  value={f.status}
                  onChange={set('status')}
                >
                  <option value="">{t('Any review status')}</option>
                  {(Object.keys(STAGE_LABEL) as Stage[])
                    .filter((k) => k !== 'first-party') // first-party is a source, chosen with the Source filter
                    .map((k) => (
                      <option key={k} value={k}>
                        {t(STAGE_LABEL[k])}
                      </option>
                    ))}
                </FilterSelect>
                <FilterSelect
                  label={t('Content availability')}
                  value={f.content}
                  onChange={set('content')}
                >
                  <option value="">{t('Any content availability')}</option>
                  {contentFilterStates(catalog).map((k) => (
                    <option key={k} value={k}>
                      {t(CONTENT_LABEL[k])}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label={t('Agent verification evidence')}
                  value={f.agent}
                  onChange={set('agent')}
                >
                  <option value="">{t('Any evidence')}</option>
                  <option value="any">{AGENT_OPTION_LABEL('any', t)}</option>
                  {TESTED_AGENTS.map((a) => (
                    <option key={a} value={a}>
                      {AGENT_OPTION_LABEL(a, t)}
                    </option>
                  ))}
                  <option value="none">{AGENT_OPTION_LABEL('none', t)}</option>
                </FilterSelect>
                <FilterSelect
                  label={t('Distribution')}
                  value={f.distribution}
                  onChange={set('distribution')}
                >
                  <option value="">{t('Any distribution')}</option>
                  {Object.entries(DISTRIBUTION_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {t(v)}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
          </aside>

          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
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
            ) : view === 'cards' ? (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((s) => (
                  <SkillCard key={s.id} catalog={catalog} skill={s} query={f.q} />
                ))}
              </ul>
            ) : (
              <div className="surface overflow-hidden">
                <div
                  aria-hidden="true"
                  className={`hidden border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 ${LIST_COLS}`}
                >
                  <span>{t('Skill')}</span>
                  <span>{t('Source')}</span>
                </div>
                <ul aria-label={t('Skills')}>
                  {shown.map((s) => (
                    <SkillRow key={s.id} catalog={catalog} skill={s} query={f.q} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
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

import { useEffect, useId, useMemo, useState } from 'react';
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
  skillsHref,
  type Catalog,
  type Group,
  type Query,
  type Skill,
  type SkillFilter,
  type Stage,
} from '../lib.ts';
import { Archivist, Glyph, GlyphSlot } from '../art.tsx';
import { companion, CUE_HANDLERS } from '../codex/companion.tsx';
import { GROUP_REACTION, reactionOf } from '../codex/reactions.ts';
import { SkillTree } from '../codex/tree.tsx';
import '../codex/codex.css';
import { Highlight } from '../highlight.tsx';
import { navigate } from '../router.ts';
import {
  Badge,
  CheckIcon,
  Empty,
  ExternalIcon,
  Ledger,
  LedgerCell,
  LedgerName,
  LedgerRow,
  PageHeader,
  SearchIcon,
} from '../ui.tsx';
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
    <li className="relative flex min-w-0" data-react={reactionOf(skill)} data-label={skill.name}>
      {/* ES28: one inventory frame for every skill. Nothing about it depends on review or approval status. */}
      <div className="sx-card cw-item surface surface-hover cw-pointer relative flex w-full flex-col p-4">
        {/* ES29: RPG selection corners on hover and focus (decoration; the focus ring is the card's outline). */}
        <span aria-hidden="true" className="sx-brackets" />
        <div className="flex min-w-0 items-start gap-3">
          <GlyphSlot name={groupOf(skill)} />
          <h2 className="min-w-0 pt-2.5 text-base font-bold [overflow-wrap:anywhere]">
            {/* Stretched link: the whole card is one focusable target. */}
            <a
              href={skillHref(skill.id)}
              className="card-link after:absolute after:inset-0 after:content-['']"
            >
              <Highlight text={skill.name} query={query} />
            </a>
          </h2>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SourceBadge skill={skill} />
          <OwnershipBadge skill={skill} />
          <DistributionBadge skill={skill} />
          <StageBadge skill={skill} />
          <Badge>{t(groupOf(skill))}</Badge>
          {hasDiscoveryWarnings(skill) && <Badge tone="amber">{t('Has warnings')}</Badge>}
          <ContentBadge catalog={catalog} skill={skill} />
        </div>
        <p className="mt-3 line-clamp-3 text-sm [overflow-wrap:anywhere] text-(--cw-muted)">
          <Highlight text={skill.description} query={query} />
        </p>
        <div className="cw-record mt-auto pt-3">
          <p className="mb-2 text-sm font-bold [overflow-wrap:anywhere]">
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
          {verified.length ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-emerald-800 dark:text-emerald-400">
              {verified.map((a) => (
                <span key={a} className="inline-flex items-center gap-1">
                  <CheckIcon width={13} height={13} />
                  {t('Explicit run verified on {agent}', { agent: agentName(a) })}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-xs text-(--cw-muted)">{t('No verified agent run')}</p>
          )}
          <p className="mt-1 text-xs text-(--cw-muted)">
            {isRestricted(skill)
              ? t('Authorizations are not published')
              : assigned
                ? assigned === 1
                  ? t('Assigned to {n} consumer', { n: assigned })
                  : t('Assigned to {n} consumers', { n: assigned })
                : t('Not assigned')}
          </p>
        </div>
      </div>
    </li>
  );
}

/** One labelled dropdown of the filter sidebar. A chosen value is marked with a signal border and a bold label. */
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
      <span
        className={`mb-1 block text-xs ${value ? 'font-bold text-(--cw-ink)' : 'text-(--cw-muted)'}`}
      >
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${control} ${value ? 'border-signal-600 dark:border-signal-300' : ''}`}
      >
        {children}
      </select>
    </label>
  );
}

/** List view: exactly two columns. Review, approval, evidence and distribution stay on the skill page. */
function SkillRow({ catalog, skill, query }: { catalog: Catalog; skill: Skill; query?: string }) {
  const t = useT();
  const src = skillSourceLink(catalog, skill);
  const hidden = hiddenMatch(skill, query);
  return (
    <LedgerRow>
      <LedgerName>
        <a
          href={skillHref(skill.id)}
          className="font-bold underline-offset-2 hover:underline"
          data-react={reactionOf(skill)}
          data-label={skill.name}
        >
          <Highlight text={skill.name} query={query} />
        </a>
        <span className="mt-0.5 line-clamp-2 block text-(--cw-muted)">
          <Highlight text={skill.description} query={query} />
        </span>
        {hidden && (
          <span className="mt-0.5 block text-xs text-(--cw-muted)">
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
          </span>
        )}
      </LedgerName>
      <LedgerCell label={t('Source')}>
        {src.url ? (
          <a
            href={src.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-bold text-signal-700 underline-offset-2 hover:underline dark:text-signal-300"
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
      </LedgerCell>
    </LedgerRow>
  );
}

/** ES29: the Skills page's two views. Plain links (the view is part of the URL), styled as an RPG menu. */
function CodexViews({ mode, filter }: { mode: 'browse' | 'tree'; filter: SkillFilter }) {
  const t = useT();
  const q = Object.fromEntries(FILTER_KEYS.filter((k) => filter[k]).map((k) => [k, filter[k]!]));
  return (
    <nav aria-label={t('Skills views')} className="sx-views">
      <a
        href={skillsHref(mode === 'browse' ? q : {})}
        aria-current={mode === 'browse' ? 'page' : undefined}
        className="sx-view"
      >
        <Glyph name="ledger" />
        {t('Browse Skills')}
      </a>
      <a
        // From a category filter, the tree opens on that branch.
        href={skillsHref({
          view: 'tree',
          ...(mode === 'browse' && filter.group ? { branch: filter.group } : {}),
        })}
        aria-current={mode === 'tree' ? 'page' : undefined}
        className="sx-view"
      >
        <Glyph name="tree" />
        {t('Skill Tree')}
      </a>
    </nav>
  );
}

export function SkillsExplorer({ catalog, query }: { catalog: Catalog; query?: Query }) {
  const t = useT();
  const mode = query?.view === 'tree' ? 'tree' : 'browse';
  // The URL is the single source of truth for the filters: opening a filtered URL restores them, and Back and
  // Forward step through earlier filter states. Only the known filter parameters are read.
  const f = useMemo<SkillFilter>(() => {
    const out: SkillFilter = {};
    if (mode === 'browse') for (const k of FILTER_KEYS) if (query?.[k]) out[k] = query[k];
    return out;
  }, [query, mode]);

  return (
    <>
      <PageHeader
        kicker={{ text: t('Skill Codex'), glyph: 'ledger' }}
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
          <CodexViews mode={mode} filter={f} />
          {/* Keyed by view: switching replays the short menu transition (codex.css); nothing waits on it. */}
          <div key={mode} className="sx-enter">
            {mode === 'tree' ? (
              <SkillTree catalog={catalog} query={query} />
            ) : (
              <BrowseSkills catalog={catalog} f={f} />
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Browse Skills: search, filters, Cards/List, exactly as before, with the Archivist reacting to what is browsed. */
function BrowseSkills({ catalog, f }: { catalog: Catalog; f: SkillFilter }) {
  const t = useT();
  const panelId = useId();
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useViewMode('skills');
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

  // ES29.4: choosing a category makes the Archivist react once (this is how touch screens see reactions too).
  useEffect(() => {
    const g = f.group as Group | undefined;
    if (g && g in GROUP_REACTION) companion.pulse(GROUP_REACTION[g], t(g));
  }, [f.group, t]);

  return (
    <>
      <div className="lg:grid lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-x-8">
        {/* Search and view toggle: above the results on every width. */}
        <form
          role="search"
          aria-label={t('Search skills')}
          className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:col-start-2 lg:row-start-1"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="relative col-span-2 sm:col-span-1">
            <span className="sr-only">{t('Search skills')}</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--cw-muted)" />
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
          <div className="sx-side">
            <button
              type="button"
              aria-expanded={panelOpen}
              aria-controls={panelId}
              onClick={() => setPanelOpen(!panelOpen)}
              className="inline-flex h-10 w-full items-center justify-between gap-2 border-2 border-(--cw-edge) bg-(--cw-window) px-3 text-sm font-bold hover:bg-(--cw-sunken) lg:hidden"
            >
              <span>{t('Filters')}</span>
              {activeFilters.length > 0 && (
                <Badge tone="signal">{t('{n} active', { n: activeFilters.length })}</Badge>
              )}
            </button>
            <div
              id={panelId}
              role="group"
              aria-label={t('Filter skills')}
              className={`${panelOpen ? 'mt-2 block' : 'hidden'} surface p-3 lg:mt-0 lg:block`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 border-b-2 border-dashed border-(--cw-rule) pb-2">
                <h2 className="text-sm font-bold">{t('Filters')}</h2>
                {active.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(skillsPath({}))}
                    className="inline-flex min-h-10 items-center px-2 text-sm underline underline-offset-2 hover:text-(--cw-ink)"
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
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-(--cw-muted)">
            <p aria-live="polite">
              {t('{n} of {total} skills', { n: shown.length, total: catalog.skills.length })}
            </p>
            {active.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(skillsPath({}))}
                className="inline-flex min-h-10 items-center px-2 underline underline-offset-2 hover:text-(--cw-ink)"
              >
                {t('Clear filters')}
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <NoMatches catalog={catalog} filter={f} onRemove={(k) => set(k)('')} />
          ) : view === 'cards' ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" {...CUE_HANDLERS}>
              {shown.map((s) => (
                <SkillCard key={s.id} catalog={catalog} skill={s} query={f.q} />
              ))}
            </ul>
          ) : (
            <div className="sx-rows" {...CUE_HANDLERS}>
              <Ledger
                label={t('Skills')}
                columns={[
                  { label: t('Skill'), className: 'w-2/3' },
                  { label: t('Source'), className: 'w-1/3' },
                ]}
              >
                {shown.map((s) => (
                  <SkillRow key={s.id} catalog={catalog} skill={s} query={f.q} />
                ))}
              </Ledger>
            </div>
          )}
        </div>
      </div>
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
    <div className="surface flex gap-4 p-5 sm:p-6">
      <Archivist pose="lost" scale={2} className="hidden self-start min-[360px]:block" />
      <div className="min-w-0">
        <p className="font-bold">{t('No skills match these filters')}</p>
        <p className="mt-1 text-sm text-(--cw-muted)">
          {t('Every filter must match at once. Active: {list}.', {
            list: active.map((a) => a.label).join(' + '),
          })}
        </p>
        {relaxable.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-4">
            {relaxable.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onRemove(r.key)}
                  className="btn-secondary cw-pointer px-3! py-1.5! font-normal!"
                >
                  {r.count === 1
                    ? t('Remove {label} to show {n} skill', { label: r.label, n: r.count })
                    : t('Remove {label} to show {n} skills', { label: r.label, n: r.count })}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-(--cw-muted)">
            {t(
              'No single filter is the cause; the combination is too narrow. Use “Clear filters”.',
            )}
          </p>
        )}
      </div>
    </div>
  );
}

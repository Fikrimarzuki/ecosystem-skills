import { useMemo, useState } from 'react';
import { Archivist, GlyphSlot } from '../art.tsx';
import { useT } from '../i18n.tsx';
import {
  filterSources,
  RESOURCE_CATEGORY_LABEL,
  resourceHref,
  resourcesOfSource,
  skillHref,
  SOURCE_BATCH_LABEL,
  SOURCE_DECISION_LABEL,
  SOURCE_DECISIONS_ORDER,
  SOURCE_KIND_LABEL,
  SOURCE_RESOLUTION_LABEL,
  type Catalog,
  type Source,
} from '../lib.ts';
import {
  Badge,
  Card,
  Empty,
  ExternalIcon,
  ExternalLink,
  Field,
  Ledger,
  LedgerCell,
  LedgerName,
  LedgerRow,
  PageHeader,
  SearchIcon,
  Section,
  type Tone,
} from '../ui.tsx';
import { useViewMode, ViewToggle } from '../view.tsx';
import { UrlText } from './shared.tsx';

const control = 'control';

/** A code repository (GitHub, GitLab, Codeberg) gets the label "Repository"; anything else is "Upstream". */
const isRepository = (s: Source) =>
  !!s.upstream && /^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\//.test(s.upstream.url);

const decisionTone: Record<Source['decision'], Tone> = {
  'register-for-review': 'signal',
  'register-with-warnings': 'amber',
  'reference-only': 'neutral',
  unresolved: 'red',
  reject: 'red',
};

function SourceCard({ catalog, source }: { catalog: Catalog; source: Source }) {
  const t = useT();
  const names = (ids: string[]) =>
    ids.map((id) => ({ id, name: catalog.skills.find((s) => s.id === id)?.name ?? id }));
  return (
    <li id={source.id} className="flex min-w-0 scroll-mt-24">
      {/* ES28.2 archive record: one frame for every source whatever its decision. */}
      <Card className="cw-item w-full">
        <div className="flex min-w-0 items-start gap-3">
          <GlyphSlot name="shelf" />
          <div className="min-w-0">
            <h3 className="text-base font-bold [overflow-wrap:anywhere]">{source.name}</h3>
            {source.requestedAs && source.requestedAs !== source.name && (
              <p className="mt-0.5 text-xs text-(--cw-muted)">
                {t('Requested as “{name}”', { name: source.requestedAs })}
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={decisionTone[source.decision]}>
            {t(SOURCE_DECISION_LABEL[source.decision])}
          </Badge>
          <Badge>{t(SOURCE_KIND_LABEL[source.kind])}</Badge>
          <Badge tone={source.resolution === 'verified' ? 'green' : 'amber'}>
            {t(SOURCE_RESOLUTION_LABEL[source.resolution])}
          </Badge>
        </div>
        <p className="mt-3 text-sm [overflow-wrap:anywhere]">{source.summary}</p>
        <dl className="cw-record mt-4 grid gap-4 pt-3 sm:grid-cols-2">
          <Field label={isRepository(source) ? t('Repository') : t('Upstream')}>
            {source.upstream ? (
              <ExternalLink href={source.upstream.url}>
                <UrlText url={source.upstream.url} />
              </ExternalLink>
            ) : (
              <span className="text-(--cw-muted)">{t('No upstream')}</span>
            )}
          </Field>
          <Field label={t('Publisher')}>{source.publisher ?? t('Not established')}</Field>
          {source.revision && (
            <Field label={t('Revision examined')}>
              <code className="break-all">{source.revision}</code>
            </Field>
          )}
          {source.license && <Field label={t('License')}>{source.license}</Field>}
          {source.lastCommit && <Field label={t('Last commit seen')}>{source.lastCommit}</Field>}
          <Field label={t('Skills found / registered')}>
            {source.skillsFound} / {source.skills.length}
          </Field>
          {source.skills.length > 0 && (
            <Field label={t('Skills with warnings / approval blockers')}>
              {
                source.skills.filter(
                  (id) => catalog.skills.find((s) => s.id === id)?.discovery?.warnings.length,
                ).length
              }{' '}
              /{' '}
              {
                source.skills.filter(
                  (id) =>
                    catalog.skills.find((s) => s.id === id)?.discovery?.approvalBlockers.length,
                ).length
              }
            </Field>
          )}
        </dl>
        {source.skills.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold">{t('Registered skills')}</h4>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {names(source.skills).map((s) => (
                <li key={s.id}>
                  <a href={skillHref(s.id)} className="cw-chip">
                    {s.id}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SourceResources catalog={catalog} source={source} />
        {source.needs && (
          <div className="mt-4">
            <h4 className="text-sm font-bold">{t('Needed to resolve')}</h4>
            <p className="mt-1 text-sm [overflow-wrap:anywhere]">{source.needs}</p>
          </div>
        )}
        {source.alternatives.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold">{t('Other candidates considered')}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
              {source.alternatives.map((a) => (
                <li key={a.url}>
                  <ExternalLink href={a.url}>{a.url}</ExternalLink> — {a.note}
                </li>
              ))}
            </ul>
          </div>
        )}
        {source.warnings.length > 0 && (
          <details className="mt-4 text-sm" open={source.warnings.length <= 3}>
            <summary className="cursor-pointer font-bold">
              {t('Warnings ({n})', { n: source.warnings.length })}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {source.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </li>
  );
}

/** Resources (ES26) catalogued from this source: the same repository can provide several separate items. */
function SourceResources({ catalog, source }: { catalog: Catalog; source: Source }) {
  const t = useT();
  const items = resourcesOfSource(catalog, source.id);
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-sm font-bold">{t('Catalogued resources')}</h4>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((r) => (
          <li key={r.id}>
            <a href={resourceHref(r.id)} className="cw-chip">
              {r.name} · {t(RESOURCE_CATEGORY_LABEL[r.category])}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Warnings stay visible in the compact list: a count with a text label, never colour alone. */
function WarningCount({ n }: { n: number }) {
  const t = useT();
  if (!n) return null;
  return <Badge tone="amber">{n === 1 ? t('⚠ 1 warning') : t('⚠ {n} warnings', { n })}</Badge>;
}

/** Ledger row for the List view (ES28.3: a real table row). On narrow screens it stacks into labelled lines. */
function SourceRow({ source }: { source: Source }) {
  const t = useT();
  return (
    <LedgerRow id={source.id}>
      <LedgerName>
        <span className="font-bold">{source.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Badge tone={decisionTone[source.decision]}>
            {t(SOURCE_DECISION_LABEL[source.decision])}
          </Badge>
          <WarningCount n={source.warnings.length} />
        </span>
        {/* The compact view keeps the warnings themselves one keypress away, not only their count. */}
        {source.warnings.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer underline-offset-2 hover:underline">
              {t('Show warnings')}
              <span className="sr-only"> {t('for {name}', { name: source.name })}</span>
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {source.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </LedgerName>
      <LedgerCell label={t('Type')}>{t(SOURCE_KIND_LABEL[source.kind])}</LedgerCell>
      <LedgerCell label={t('Publisher')}>{source.publisher ?? t('Not established')}</LedgerCell>
      <LedgerCell label={t('Discovery status')}>
        {t(SOURCE_RESOLUTION_LABEL[source.resolution])}
        {source.skills.length > 0 && (
          <span className="text-(--cw-muted)">
            {' · '}
            {t('{n} skills', { n: source.skills.length })}
          </span>
        )}
      </LedgerCell>
      <LedgerCell label={t('Last verified')}>{source.discoveredAt}</LedgerCell>
      <LedgerCell label={t('Actions')} className="md:text-right">
        {source.upstream ? (
          <a
            href={source.upstream.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-10 items-center gap-1 font-bold text-signal-700 underline-offset-2 hover:underline md:min-h-0 dark:text-signal-300"
          >
            {isRepository(source) ? t('Repository') : t('Upstream')}
            <ExternalIcon width={12} height={12} />
            <span className="sr-only">
              {' '}
              {t('{name} (opens in a new tab)', { name: source.name })}
            </span>
          </a>
        ) : (
          <span className="text-(--cw-muted)">{t('No upstream')}</span>
        )}
      </LedgerCell>
    </LedgerRow>
  );
}

export function Sources({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const [f, setF] = useState<{ q: string; decision: string; kind: string }>({
    q: '',
    decision: '',
    kind: '',
  });
  const [view, setView] = useViewMode('sources');
  const shown = useMemo(() => filterSources(catalog, f), [catalog, f]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        SOURCE_DECISIONS_ORDER.map((d) => [
          d,
          catalog.sources.filter((x) => x.decision === d).length,
        ]),
      ) as Record<Source['decision'], number>,
    [catalog],
  );
  const batches = (Object.keys(SOURCE_BATCH_LABEL) as Source['batch'][]).filter((b) =>
    shown.some((x) => x.batch === b),
  );
  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <PageHeader
          title={t('Sources')}
          subtitle={t(
            'Repositories, applications, standards and leads that were examined during discovery. A source is not a skill: only verified sources are registered as unapproved candidates, and reference-only and unresolved ones register nothing.',
          )}
        />
        {/* Decorative: the Archivist searching the archive, next to the explanation of discovery. */}
        <Archivist pose="searching" scale={3} className="hidden shrink-0 md:block" />
      </div>
      {catalog.sources.length === 0 ? (
        <Empty title={t('No sources recorded yet')} />
      ) : (
        <>
          <ul className="mb-6 flex flex-wrap gap-2" aria-label={t('Sources by decision')}>
            {SOURCE_DECISIONS_ORDER.filter((d) => counts[d] > 0).map((d) => (
              <li key={d}>
                <button
                  type="button"
                  aria-pressed={f.decision === d}
                  onClick={() => setF({ ...f, decision: f.decision === d ? '' : d })}
                  className="min-h-10 border-2 border-(--cw-edge) bg-(--cw-window) px-3 py-1.5 text-sm hover:bg-(--cw-sunken) aria-pressed:bg-(--cw-signal) aria-pressed:font-bold aria-pressed:text-(--cw-on-signal)"
                >
                  {t(SOURCE_DECISION_LABEL[d])} · {counts[d]}
                </button>
              </li>
            ))}
          </ul>
          <form
            role="search"
            aria-label={t('Filter sources')}
            className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="relative col-span-2 lg:col-span-1">
              <span className="sr-only">{t('Search sources')}</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--cw-muted)" />
              <input
                type="search"
                placeholder={t('Search name, publisher, summary…')}
                value={f.q}
                onChange={(e) => setF({ ...f, q: e.target.value })}
                className={`${control} control-search`}
              />
            </label>
            <label className="col-span-2 lg:col-span-1">
              <span className="sr-only">{t('Kind')}</span>
              <select
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value })}
                className={control}
              >
                <option value="">{t('All kinds')}</option>
                {(Object.keys(SOURCE_KIND_LABEL) as Source['kind'][]).map((k) => (
                  <option key={k} value={k}>
                    {t(SOURCE_KIND_LABEL[k])}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-2 lg:col-span-1">
              <ViewToggle mode={view} onChange={setView} label={t('Show sources as')} />
            </div>
          </form>
          <p className="mb-4 text-sm text-(--cw-muted)" aria-live="polite">
            {t('{n} of {total} sources', { n: shown.length, total: catalog.sources.length })}
          </p>
          {shown.length === 0 ? (
            <Empty title={t('No sources match these filters')} pose="lost">
              <button
                type="button"
                onClick={() => setF({ q: '', decision: '', kind: '' })}
                className="underline"
              >
                {t('Clear filters')}
              </button>
            </Empty>
          ) : (
            batches.map((b) => (
              <Section key={b} id={`batch-${b}`} title={t(SOURCE_BATCH_LABEL[b])}>
                {view === 'cards' ? (
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {shown
                      .filter((x) => x.batch === b)
                      .map((x) => (
                        <SourceCard key={x.id} catalog={catalog} source={x} />
                      ))}
                  </ul>
                ) : (
                  <Ledger
                    label={t(SOURCE_BATCH_LABEL[b])}
                    columns={[
                      { label: t('Source'), className: 'w-[28%]' },
                      { label: t('Type'), className: 'w-[13%]' },
                      { label: t('Publisher'), className: 'w-[15%]' },
                      { label: t('Discovery status'), className: 'w-[17%]' },
                      { label: t('Last verified'), className: 'w-[13%]' },
                      { label: t('Actions'), className: 'w-[14%] text-right' },
                    ]}
                  >
                    {shown
                      .filter((x) => x.batch === b)
                      .map((x) => (
                        <SourceRow key={x.id} source={x} />
                      ))}
                  </Ledger>
                )}
              </Section>
            ))
          )}
        </>
      )}
    </>
  );
}

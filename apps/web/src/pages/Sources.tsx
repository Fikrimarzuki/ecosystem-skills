import { useMemo, useState } from 'react';
import { useT } from '../i18n.tsx';
import {
  filterSources,
  skillHref,
  SOURCE_BATCH_LABEL,
  SOURCE_DECISION_LABEL,
  SOURCE_DECISIONS_ORDER,
  SOURCE_KIND_LABEL,
  SOURCE_RESOLUTION_LABEL,
  type Catalog,
  type Source,
} from '../lib.ts';
import { Badge, Card, Empty, ExternalLink, Field, PageHeader, Section, type Tone } from '../ui.tsx';

const control =
  'h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white/90 px-3 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100';

const decisionTone: Record<Source['decision'], Tone> = {
  'register-for-review': 'indigo',
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
    <li id={source.id} className="min-w-0 scroll-mt-20">
      <Card>
        <h3 className="text-base font-semibold tracking-tight [overflow-wrap:anywhere]">
          {source.name}
        </h3>
        {source.requestedAs && source.requestedAs !== source.name && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {t('Requested as “{name}”', { name: source.requestedAs })}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={decisionTone[source.decision]}>
            {t(SOURCE_DECISION_LABEL[source.decision])}
          </Badge>
          <Badge>{t(SOURCE_KIND_LABEL[source.kind])}</Badge>
          <Badge tone={source.resolution === 'verified' ? 'green' : 'amber'}>
            {t(SOURCE_RESOLUTION_LABEL[source.resolution])}
          </Badge>
          {source.license && source.license.length <= 24 && <Badge>{source.license}</Badge>}
        </div>
        <p className="mt-3 text-sm [overflow-wrap:anywhere]">{source.summary}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {source.upstream && (
            <Field label={t('Upstream')}>
              <ExternalLink href={source.upstream.url}>{source.upstream.url}</ExternalLink>
            </Field>
          )}
          {source.revision && (
            <Field label={t('Revision examined')}>
              <code className="break-all">{source.revision}</code>
            </Field>
          )}
          {source.publisher && <Field label={t('Publisher')}>{source.publisher}</Field>}
          {source.license && source.license.length > 24 && (
            <Field label={t('License')}>{source.license}</Field>
          )}
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
            <h4 className="text-sm font-medium">{t('Registered skills')}</h4>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {names(source.skills).map((s) => (
                <li key={s.id}>
                  <a
                    href={skillHref(s.id)}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs underline-offset-2 hover:underline dark:bg-zinc-800"
                  >
                    {s.id}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {source.needs && (
          <div className="mt-4">
            <h4 className="text-sm font-medium">{t('Needed to resolve')}</h4>
            <p className="mt-1 text-sm [overflow-wrap:anywhere]">{source.needs}</p>
          </div>
        )}
        {source.alternatives.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium">{t('Other candidates considered')}</h4>
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
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">
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

export function Sources({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const [f, setF] = useState<{ q: string; decision: string; kind: string }>({
    q: '',
    decision: '',
    kind: '',
  });
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
      <PageHeader
        title={t('Sources')}
        subtitle={t(
          'Repositories, applications, standards and leads that were examined during discovery. A source is not a skill: only verified sources are registered as unapproved candidates, and reference-only and unresolved ones register nothing.',
        )}
      />
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
                  className={`rounded-full border px-3 py-1 text-sm ${
                    f.decision === d
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-100'
                      : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t(SOURCE_DECISION_LABEL[d])} · {counts[d]}
                </button>
              </li>
            ))}
          </ul>
          <form
            role="search"
            aria-label={t('Filter sources')}
            className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="col-span-2 lg:col-span-1">
              <span className="sr-only">{t('Search sources')}</span>
              <input
                type="search"
                placeholder={t('Search name, publisher, summary…')}
                value={f.q}
                onChange={(e) => setF({ ...f, q: e.target.value })}
                className={control}
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
          </form>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {t('{n} of {total} sources', { n: shown.length, total: catalog.sources.length })}
          </p>
          {shown.length === 0 ? (
            <Empty title={t('No sources match these filters')} />
          ) : (
            batches.map((b) => (
              <Section key={b} id={`batch-${b}`} title={t(SOURCE_BATCH_LABEL[b])}>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {shown
                    .filter((x) => x.batch === b)
                    .map((x) => (
                      <SourceCard key={x.id} catalog={catalog} source={x} />
                    ))}
                </ul>
              </Section>
            ))
          )}
        </>
      )}
    </>
  );
}

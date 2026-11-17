import { useMemo } from 'react';
import { Glyph, GlyphSlot, type GlyphName } from '../art.tsx';
import { useT } from '../i18n.tsx';
import {
  AUDIT_COMPLETENESS_LABEL,
  filterResources,
  MCP_DEPLOYMENT_LABEL,
  pageHref,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_HINT,
  RESOURCE_CATEGORY_LABEL,
  RESOURCE_DISCOVERY_LABEL,
  RESOURCE_FILTER_KEYS,
  RESOURCE_SECURITY_LABEL,
  RESOURCE_TYPE_LABEL,
  resourceExternalUrl,
  resourceHref,
  resourceSource,
  resourceTypesIn,
  resourcesPath,
  skillHref,
  SOURCE_RESOLUTION_LABEL,
  sourceHref,
  type Catalog,
  type Query,
  type Resource,
  type ResourceFilter,
} from '../lib.ts';
import { href as routerHref, navigate } from '../router.ts';
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
import { AuditSummary } from './Audit.tsx';
import { RecordSummary, UrlText } from './shared.tsx';

/** The resource's own licence when its source's licence does not cover it (a hosted service), else the source's. */
const licenseOf = (r: Resource, src: { license?: string } | undefined) => r.license ?? src?.license;

const securityTone: Record<Resource['security']['status'], Tone> = {
  'not-reviewed': 'neutral',
  'notes-recorded': 'amber',
  reviewed: 'signal',
};
const discoveryTone: Record<Resource['discovery']['status'], Tone> = {
  discovered: 'neutral',
  verified: 'green',
  unresolved: 'red',
};

/** Status badges shown on every view: discovery and security, plus a count of recorded concerns (never colour alone). */
function ResourceBadges({ resource }: { resource: Resource }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={discoveryTone[resource.discovery.status]}>
        {t(RESOURCE_DISCOVERY_LABEL[resource.discovery.status])}
      </Badge>
      <Badge tone={securityTone[resource.security.status]}>
        {t(RESOURCE_SECURITY_LABEL[resource.security.status])}
      </Badge>
      {resource.security.audit && (
        <Badge tone={resource.security.audit.completeness === 'complete' ? 'green' : 'amber'}>
          {t(AUDIT_COMPLETENESS_LABEL[resource.security.audit.completeness])}
        </Badge>
      )}
      {resource.security.concerns.length > 0 && (
        <Badge tone="amber">
          {resource.security.concerns.length === 1
            ? t('⚠ 1 concern')
            : t('⚠ {n} concerns', { n: resource.security.concerns.length })}
        </Badge>
      )}
    </div>
  );
}

/** Inventory glyph per resource category (ES28.2). Decorative: the category and type are always written out. */
export const CATEGORY_GLYPH: Record<Resource['category'], GlyphName> = {
  'mcp-servers': 'plug',
  'agent-toolkits': 'satchel',
  'agent-dev-tools': 'hammer',
  'agent-references': 'book',
  'developer-resources': 'Other',
};

/**
 * The verified upstream, as a visible link that shows where it goes (never an MCP endpoint). It is a sibling of the
 * card's stretched title link and sits above it (relative z-10), so both stay separately clickable and focusable.
 */
function SourceLink({ resource, url }: { resource: Resource; url: string }) {
  const t = useT();
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={t('Original source of {name}', { name: resource.name })}
      className="relative z-10 inline-flex min-h-10 max-w-full items-center gap-1.5 text-sm font-bold text-signal-700 underline-offset-2 hover:underline dark:text-signal-300"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <UrlText url={url} />
      </span>
      <ExternalIcon width={14} height={14} className="shrink-0" />
      <span className="sr-only">
        {t('Original source of {name}', { name: resource.name })} {t('(opens in a new tab)')}
      </span>
    </a>
  );
}

/** One inventory panel: the same frame for every resource whatever its review status. */
function ResourceCard({ catalog, resource }: { catalog: Catalog; resource: Resource }) {
  const t = useT();
  const src = resourceSource(catalog, resource);
  const url = resourceExternalUrl(catalog, resource);
  const license = licenseOf(resource, src);
  return (
    <li className="relative flex min-w-0">
      <div className="cw-item surface surface-hover cw-pointer relative flex w-full flex-col p-4">
        <div className="flex min-w-0 items-start gap-3">
          <GlyphSlot name={CATEGORY_GLYPH[resource.category]} />
          <div className="min-w-0">
            <h3 className="text-base font-bold [overflow-wrap:anywhere]">
              <a
                href={resourceHref(resource.id)}
                className="card-link after:absolute after:inset-0 after:content-['']"
              >
                {resource.name}
              </a>
            </h3>
            <p className="mt-0.5 text-xs font-bold">{t(RESOURCE_TYPE_LABEL[resource.type])}</p>
          </div>
        </div>
        <div className="mt-3">
          <ResourceBadges resource={resource} />
        </div>
        <p className="mt-3 mb-3 text-sm [overflow-wrap:anywhere] text-(--cw-muted)">
          {resource.summary}
        </p>
        <div className="cw-record mt-auto pt-2">
          <p className="text-xs text-(--cw-muted)">
            {src?.publisher ?? t('Publisher not established')}
            {license ? ` · ${license.split(' (')[0]}` : ''}
          </p>
          {url ? (
            <SourceLink resource={resource} url={url} />
          ) : (
            <p className="mt-1 text-sm text-(--cw-muted)">{t('No public source link')}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function ResourceRow({ catalog, resource }: { catalog: Catalog; resource: Resource }) {
  const t = useT();
  const src = resourceSource(catalog, resource);
  const url = resourceExternalUrl(catalog, resource);
  return (
    <LedgerRow>
      <LedgerName>
        <span className="flex min-w-0 items-center gap-2.5">
          <Glyph name={CATEGORY_GLYPH[resource.category]} />
          <a
            href={resourceHref(resource.id)}
            className="min-w-0 font-bold underline-offset-2 hover:underline"
          >
            {resource.name}
          </a>
        </span>
      </LedgerName>
      <LedgerCell label={t('Type')}>{t(RESOURCE_TYPE_LABEL[resource.type])}</LedgerCell>
      <LedgerCell label={t('Publisher')}>{src?.publisher ?? t('Not established')}</LedgerCell>
      <LedgerCell label={t('Status')}>
        <ResourceBadges resource={resource} />
      </LedgerCell>
      <LedgerCell label={t('Actions')} className="md:text-right">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-10 items-center gap-1 font-bold text-signal-700 underline-offset-2 hover:underline md:min-h-0 dark:text-signal-300"
          >
            {t('Original source')}
            <ExternalIcon width={12} height={12} />
            <span className="sr-only">
              {' '}
              {t('{name} (opens in a new tab)', { name: resource.name })}
            </span>
          </a>
        ) : (
          <span className="text-(--cw-muted)">{t('No public source link')}</span>
        )}
      </LedgerCell>
    </LedgerRow>
  );
}

/** Category navigation (wide screens): real links, so the URL, Back/Forward and keyboard Tab/Enter all just work. */
function CategorySidebar({
  catalog,
  filter,
  hrefFor,
}: {
  catalog: Catalog;
  filter: ResourceFilter;
  hrefFor: (category: string) => string;
}) {
  const t = useT();
  // Counts are total category membership, never the filtered result.
  const count = (c: string) =>
    c ? catalog.resources.filter((r) => r.category === c).length : catalog.resources.length;
  const item = (c: string, label: string, dashed = false) => {
    const current = (filter.category ?? '') === c;
    return (
      <li
        key={c || 'all'}
        className={dashed ? 'mt-2 border-t-2 border-dashed border-(--cw-rule) pt-2' : ''}
      >
        <a
          href={hrefFor(c)}
          aria-current={current ? 'page' : undefined}
          className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-(--cw-sunken)"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="inline-grid w-6 shrink-0 place-items-center">
              {c && <Glyph name={CATEGORY_GLYPH[c as Resource['category']]} />}
            </span>
            <span className="min-w-0">{label}</span>
          </span>
          <span className="text-xs tabular-nums opacity-80">
            <span className="sr-only">{t('{n} resources', { n: count(c) })}</span>
            <span aria-hidden="true">{count(c)}</span>
          </span>
        </a>
      </li>
    );
  };
  return (
    <aside className="hidden lg:block">
      <nav aria-label={t('Resource categories')} className="surface sticky top-20 p-2">
        <ul className="cw-nav cw-side">
          {item('', t('All resources'))}
          {RESOURCE_CATEGORIES.map((c) =>
            item(c, t(RESOURCE_CATEGORY_LABEL[c]), c === 'developer-resources'),
          )}
        </ul>
        <p className="mt-2 px-3 pb-1 text-xs text-(--cw-muted)">
          {t('Other developer resources are not AI-agent capabilities.')}
        </p>
      </nav>
    </aside>
  );
}

export function Resources({ catalog, query }: { catalog: Catalog; query?: Query }) {
  const t = useT();
  const [view, setView] = useViewMode('resources');
  const f = useMemo<ResourceFilter>(() => {
    const out: ResourceFilter = {};
    for (const k of RESOURCE_FILTER_KEYS) if (query?.[k]) out[k] = query[k];
    return out;
  }, [query]);
  const shown = filterResources(catalog, f);
  const pathFor = (next: ResourceFilter) =>
    resourcesPath(
      Object.fromEntries(RESOURCE_FILTER_KEYS.filter((x) => next[x]).map((x) => [x, next[x]!])),
    );
  /** Switching category keeps search and review status, and drops a type that does not exist in the new category. */
  const forCategory = (category: string): ResourceFilter => ({
    ...f,
    category: category || undefined,
    type:
      f.type && resourceTypesIn(catalog, category || undefined).includes(f.type as Resource['type'])
        ? f.type
        : undefined,
  });
  const set = (k: keyof ResourceFilter) => (v: string) =>
    navigate(pathFor({ ...f, [k]: v || undefined }), { replace: k === 'q' });
  const types = resourceTypesIn(catalog, f.category);
  const narrowing = !!(f.q || f.type || f.security);
  const categoriesShown = f.category ? [f.category as Resource['category']] : RESOURCE_CATEGORIES;

  return (
    <>
      <PageHeader
        title={t('Resources')}
        subtitle={t(
          'MCP servers, agent toolkits, agent development tools, references and other developer resources that were discovered and catalogued. Resources are not skills: none is reviewed for installation, none is installable from this registry, and this site never connects to an MCP server.',
        )}
      />
      {catalog.resources.length === 0 ? (
        <Empty title={t('No resources catalogued yet')}>
          {t('Discovered MCP servers, toolkits and references will appear here once registered.')}
        </Empty>
      ) : (
        <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
          <CategorySidebar
            catalog={catalog}
            filter={f}
            hrefFor={(c) => routerHref(pathFor(forCategory(c)))}
          />
          <div className="min-w-0">
            <form
              role="search"
              aria-label={t('Filter resources')}
              className="mb-4 grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => e.preventDefault()}
            >
              {/* Search and the view toggle on one row (as on the Skills page), then the category, then the filters. */}
              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative">
                  <span className="sr-only">{t('Search resources')}</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--cw-muted)" />
                  <input
                    type="search"
                    placeholder={t('Search name, publisher, summary, tags…')}
                    value={f.q ?? ''}
                    onChange={(e) => set('q')(e.target.value)}
                    className="control control-search"
                  />
                </label>
                <div>
                  <ViewToggle mode={view} onChange={setView} label={t('Show resources as')} />
                </div>
              </div>
              {/* Phones and tablets: the sidebar is replaced by one compact selector (the only category control there). */}
              <label className="sm:col-span-2 lg:hidden">
                <span className="sr-only">{t('Category')}</span>
                <select
                  value={f.category ?? ''}
                  onChange={(e) => navigate(pathFor(forCategory(e.target.value)))}
                  className="control"
                >
                  <option value="">
                    {t('All resources')} ({catalog.resources.length})
                  </option>
                  {RESOURCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(RESOURCE_CATEGORY_LABEL[c])} (
                      {catalog.resources.filter((r) => r.category === c).length})
                    </option>
                  ))}
                </select>
              </label>
              {/* ES28.3: visible labels, and each select at least half the bar (full width on phones), so the longest
                  option ("Risiko dicatat, belum ditinjau penuh", "Concerns noted, not fully reviewed") is never cut
                  off. Measured at 320–1280 px in both languages by the browser review. */}
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-(--cw-muted)">{t('Resource type')}</span>
                <select
                  value={f.type ?? ''}
                  onChange={(e) => set('type')(e.target.value)}
                  className="control"
                >
                  <option value="">{t('All types')}</option>
                  {types.map((x) => (
                    <option key={x} value={x}>
                      {t(RESOURCE_TYPE_LABEL[x])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-(--cw-muted)">{t('Review status')}</span>
                <select
                  value={f.security ?? ''}
                  onChange={(e) => set('security')(e.target.value)}
                  className="control"
                >
                  <option value="">{t('Any review status')}</option>
                  {(Object.keys(RESOURCE_SECURITY_LABEL) as Resource['security']['status'][]).map(
                    (x) => (
                      <option key={x} value={x}>
                        {t(RESOURCE_SECURITY_LABEL[x])}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </form>
            <p className="mb-4 text-sm text-(--cw-muted)" aria-live="polite">
              {f.category
                ? t('{n} of {total} resources in {category}', {
                    n: shown.length,
                    total: catalog.resources.filter((r) => r.category === f.category).length,
                    category: t(
                      RESOURCE_CATEGORY_LABEL[f.category as Resource['category']] ?? f.category,
                    ),
                  })
                : t('{n} of {total} resources', {
                    n: shown.length,
                    total: catalog.resources.length,
                  })}
            </p>
            {shown.length === 0 ? (
              <Empty title={t('No resources match these filters')} pose="lost">
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {narrowing && (
                    <a href={routerHref(pathFor({ category: f.category }))} className="underline">
                      {f.category ? t('Clear search and filters') : t('Clear filters')}
                    </a>
                  )}
                  {f.category && (
                    <a
                      href={routerHref(pathFor({ q: f.q, type: undefined, security: f.security }))}
                      className="underline"
                    >
                      {t('Show all categories')}
                    </a>
                  )}
                </span>
              </Empty>
            ) : (
              categoriesShown
                .filter((c) => shown.some((r) => r.category === c))
                .map((c) => {
                  const items = shown.filter((r) => r.category === c);
                  const other = c === 'developer-resources';
                  return (
                    <div
                      key={c}
                      className={
                        other && !f.category
                          ? 'mt-12 border-t-2 border-dashed border-(--cw-rule) pt-2'
                          : ''
                      }
                    >
                      <Section
                        id={`category-${c}`}
                        title={t(RESOURCE_CATEGORY_LABEL[c])}
                        hint={t(RESOURCE_CATEGORY_HINT[c])}
                        icon={<GlyphSlot name={CATEGORY_GLYPH[c]} />}
                      >
                        {view === 'cards' ? (
                          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {items.map((r) => (
                              <ResourceCard key={r.id} catalog={catalog} resource={r} />
                            ))}
                          </ul>
                        ) : (
                          <Ledger
                            label={t(RESOURCE_CATEGORY_LABEL[c])}
                            columns={[
                              { label: t('Resource'), className: 'w-[30%]' },
                              { label: t('Type'), className: 'w-[15%]' },
                              { label: t('Publisher'), className: 'w-[17%]' },
                              { label: t('Status'), className: 'w-[22%]' },
                              { label: t('Actions'), className: 'w-[16%] text-right' },
                            ]}
                          >
                            {items.map((r) => (
                              <ResourceRow key={r.id} catalog={catalog} resource={r} />
                            ))}
                          </Ledger>
                        )}
                      </Section>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function ResourceDetail({ catalog, id }: { catalog: Catalog; id: string }) {
  const t = useT();
  const r = catalog.resources.find((x) => x.id === id);
  if (!r)
    return (
      <>
        <PageHeader title={t('Resource not found')} />
        <Empty title={t('No resource with id “{id}”', { id })}>
          <a href={pageHref('resources')} className="underline">
            {t('All resources')}
          </a>
        </Empty>
      </>
    );
  const src = resourceSource(catalog, r);
  const skills = r.related.skills
    .map((sid) => catalog.skills.find((s) => s.id === sid))
    .filter((s) => !!s);
  const resources = r.related.resources
    .map((rid) => catalog.resources.find((x) => x.id === rid))
    .filter((x) => !!x);
  const url = resourceExternalUrl(catalog, r);
  const license = licenseOf(r, src);
  return (
    <>
      <nav aria-label={t('Breadcrumb')} className="mb-3 text-sm text-(--cw-muted)">
        <a href={pageHref('resources')} className="underline-offset-2 hover:underline">
          {t('Resources')}
        </a>
        {' / '}
        <a
          href={`${pageHref('resources')}?category=${r.category}`}
          className="underline-offset-2 hover:underline"
        >
          {t(RESOURCE_CATEGORY_LABEL[r.category])}
        </a>
      </nav>
      <PageHeader title={r.name} subtitle={r.summary}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <GlyphSlot name={CATEGORY_GLYPH[r.category]} />
          <span className="text-sm font-bold">
            {t(RESOURCE_TYPE_LABEL[r.type])}
            <span className="font-normal text-(--cw-muted)">
              {' · '}
              {t(RESOURCE_CATEGORY_LABEL[r.category])}
            </span>
          </span>
          <ResourceBadges resource={r} />
        </div>
      </PageHeader>
      <RecordSummary
        source={url ? { url, label: t('Original source'), name: r.name } : undefined}
        facts={[
          { label: t('Publisher'), value: src?.publisher ?? t('Not established') },
          { label: t('License'), value: license ?? t('Not established') },
          {
            label: t('Revision examined'),
            value: src?.revision ? (
              <code className="break-all">{src.revision.slice(0, 12)}</code>
            ) : (
              t('No pinned revision')
            ),
          },
          { label: t('Type'), value: t(RESOURCE_TYPE_LABEL[r.type]) },
        ]}
      />
      <p className="mb-8 border-l-4 border-(--cw-signal) bg-(--cw-sunken) px-4 py-3 text-sm">
        {r.category === 'developer-resources'
          ? t(
              'A developer resource, not an AI-agent capability. It is catalogued for reference and is not a skill.',
            )
          : t(
              'A catalogued resource, not a skill. It is not approved or installable through Ecosystem Skills.',
            )}
        {r.category === 'mcp-servers' && ' ' + t('This site never connects to an MCP server.')}
      </p>

      <Section id="provenance" title={t('Source and provenance')}>
        {src ? (
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Source record')}>
                <a href={sourceHref(src.id)} className="underline-offset-2 hover:underline">
                  {src.name}
                </a>
              </Field>
              <Field label={t('Upstream')}>
                {src.upstream ? (
                  <ExternalLink href={src.upstream.url}>
                    <UrlText url={src.upstream.url} />
                  </ExternalLink>
                ) : (
                  t('Not established')
                )}
              </Field>
              {r.path && (
                <Field label={t('Path in repository')}>
                  <code>{r.path}</code>
                </Field>
              )}
              {r.homepage && (
                <Field label={t('Official website')}>
                  <ExternalLink href={r.homepage}>{r.homepage}</ExternalLink>
                </Field>
              )}
              <Field label={t('Publisher')}>{src.publisher ?? t('Not established')}</Field>
              <Field label={t('License')}>{licenseOf(r, src) ?? t('Not established')}</Field>
              <Field label={t('Revision examined')}>
                {src.revision ? (
                  <code className="break-all">{src.revision}</code>
                ) : (
                  t('No pinned revision')
                )}
              </Field>
              <Field label={t('Upstream identity')}>
                {t(SOURCE_RESOLUTION_LABEL[src.resolution])}
              </Field>
              {src.lastCommit && <Field label={t('Last commit seen')}>{src.lastCommit}</Field>}
              <Field label={t('Discovered')}>{r.discovery.discoveredAt}</Field>
              {r.discovery.lastVerified && (
                <Field label={t('Last verified')}>{r.discovery.lastVerified}</Field>
              )}
            </dl>
            {src.needs && (
              <p className="mt-4 text-sm">
                <span className="font-bold">{t('Needed to resolve')}: </span>
                {src.needs}
              </p>
            )}
          </Card>
        ) : (
          <Empty title={t('Source record missing')} />
        )}
      </Section>

      <Section
        id="security"
        title={t('Security notes')}
        hint={t(
          'Concerns recorded from a read-only look at the source. This is not a security review and not an approval.',
        )}
      >
        <Card>
          <p className="text-sm">
            <span className="font-bold">{t('Status')}: </span>
            {t(RESOURCE_SECURITY_LABEL[r.security.status])}
          </p>
          {r.security.concerns.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
              {r.security.concerns.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-(--cw-muted)">{t('No concerns recorded.')}</p>
          )}
          {r.security.audit && (
            <>
              <AuditSummary audit={r.security.audit} />
              <p className="mt-3 text-xs text-(--cw-muted)">
                {t('Audited {date} by {reviewer}', {
                  date: r.security.audit.reviewedAt,
                  reviewer: r.security.audit.reviewer,
                })}
                {r.security.audit.revision
                  ? ` · ${t('revision {rev}', { rev: r.security.audit.revision.slice(0, 12) })}`
                  : ` · ${t('hosted service: no source revision to read')}`}
              </p>
            </>
          )}
        </Card>
      </Section>

      {r.mcp && (
        <Section
          id="mcp"
          title={t('MCP server details')}
          hint={t('As documented by the publisher. Not connected, not tested.')}
        >
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Runs')}>{t(MCP_DEPLOYMENT_LABEL[r.mcp.deployment])}</Field>
              <Field label={t('Transport')}>
                {r.mcp.transport.length ? r.mcp.transport.join(', ') : t('Not documented')}
              </Field>
              <Field label={t('Authentication')}>{r.mcp.auth}</Field>
              <Field label={t('Tools and permissions')}>{r.mcp.toolScope}</Field>
              <Field label={t('External data access')}>{r.mcp.dataAccess}</Field>
              {r.mcp.officialEndpoint && (
                <Field label={t('Official endpoint (not connected)')}>
                  {/* Plain text on purpose: an endpoint is a connection address, never a link. */}
                  <code className="break-all">{r.mcp.officialEndpoint}</code>
                </Field>
              )}
              <Field label={t('Installation')}>
                {t('Not installable through Ecosystem Skills. Follow the original source.')}
              </Field>
            </dl>
          </Card>
        </Section>
      )}

      {!r.mcp && (
        <Section
          id="use"
          title={t('Use considerations')}
          hint={t('What the registry records about using it. Nothing here is installed or run.')}
        >
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Installation')}>
                {t('Not installable through Ecosystem Skills. Follow the original source.')}
              </Field>
              <Field label={t('Authentication and external dependencies')}>
                {t(
                  'Not recorded for this resource. Check the security notes above and the original source.',
                )}
              </Field>
            </dl>
          </Card>
        </Section>
      )}

      {(skills.length > 0 ||
        resources.length > 0 ||
        r.related.projects.length > 0 ||
        r.tags.length > 0) && (
        <Section id="related" title={t('Related')}>
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              {skills.length > 0 && (
                <Field label={t('Related skills')}>
                  <ul className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <li key={s.id}>
                        <a href={skillHref(s.id)} className="cw-chip">
                          {s.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Field>
              )}
              {resources.length > 0 && (
                <Field label={t('Related resources')}>
                  <ul className="flex flex-wrap gap-1.5">
                    {resources.map((x) => (
                      <li key={x.id}>
                        <a href={resourceHref(x.id)} className="cw-chip">
                          {x.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Field>
              )}
              {r.related.projects.length > 0 && (
                <Field label={t('Related ecosystem projects')}>
                  {r.related.projects.join(', ')}
                </Field>
              )}
              {r.tags.length > 0 && <Field label={t('Tags')}>{r.tags.join(', ')}</Field>}
            </dl>
          </Card>
        </Section>
      )}
    </>
  );
}

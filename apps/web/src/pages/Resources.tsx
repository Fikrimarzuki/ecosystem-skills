import { useMemo } from 'react';
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
  PageHeader,
  SearchIcon,
  Section,
  type Tone,
} from '../ui.tsx';
import { useViewMode, ViewToggle } from '../view.tsx';
import { AuditSummary } from './Audit.tsx';

/** The resource's own licence when its source's licence does not cover it (a hosted service), else the source's. */
const licenseOf = (r: Resource, src: { license?: string } | undefined) => r.license ?? src?.license;

const securityTone: Record<Resource['security']['status'], Tone> = {
  'not-reviewed': 'neutral',
  'notes-recorded': 'amber',
  reviewed: 'indigo',
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

/** Small icon link to the verified upstream (never an MCP endpoint). Sibling of, not inside, the title link. */
function ExternalSourceLink({
  resource,
  url,
  className = '',
}: {
  resource: Resource;
  url: string;
  className?: string;
}) {
  const t = useT();
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={t('Original source of {name}', { name: resource.name })}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-indigo-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-indigo-300 ${className}`}
    >
      <ExternalIcon width={16} height={16} />
      <span className="sr-only">
        {t('Original source of {name}', { name: resource.name })} {t('(opens in a new tab)')}
      </span>
    </a>
  );
}

function ResourceCard({ catalog, resource }: { catalog: Catalog; resource: Resource }) {
  const t = useT();
  const src = resourceSource(catalog, resource);
  const url = resourceExternalUrl(catalog, resource);
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight [overflow-wrap:anywhere]">
              <a href={resourceHref(resource.id)} className="underline-offset-2 hover:underline">
                {resource.name}
              </a>
            </h3>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {t(RESOURCE_TYPE_LABEL[resource.type])}
              {src?.publisher ? ` · ${src.publisher}` : ''}
              {licenseOf(resource, src) ? ` · ${licenseOf(resource, src)!.split(' (')[0]}` : ''}
            </p>
          </div>
          {url && <ExternalSourceLink resource={resource} url={url} className="-mt-2 -mr-2" />}
        </div>
        <div className="mt-2">
          <ResourceBadges resource={resource} />
        </div>
        <p className="mt-3 text-sm [overflow-wrap:anywhere]">{resource.summary}</p>
      </Card>
    </li>
  );
}

const LIST_COLS =
  'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-3';

function ResourceRow({ catalog, resource }: { catalog: Catalog; resource: Resource }) {
  const t = useT();
  const src = resourceSource(catalog, resource);
  const url = resourceExternalUrl(catalog, resource);
  const cell = (label: string, children: React.ReactNode) => (
    <div className="flex min-w-0 gap-2 text-sm md:block">
      <span className="w-28 shrink-0 text-zinc-500 md:sr-only dark:text-zinc-400">{label}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
  return (
    <li
      className={`space-y-1.5 border-b border-zinc-200 px-3 py-3 last:border-b-0 md:space-y-0 dark:border-zinc-800 ${LIST_COLS}`}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
          <a href={resourceHref(resource.id)} className="underline-offset-2 hover:underline">
            {resource.name}
          </a>
        </h3>
      </div>
      {cell(t('Type'), t(RESOURCE_TYPE_LABEL[resource.type]))}
      {cell(t('Publisher'), src?.publisher ?? t('Not established'))}
      {cell(t('Status'), <ResourceBadges resource={resource} />)}
      <div className="flex flex-wrap items-center gap-3 text-sm md:justify-end">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-10 items-center gap-1 text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
          >
            {t('Original source')}
            <ExternalIcon width={12} height={12} />
            <span className="sr-only">
              {' '}
              {t('{name} (opens in a new tab)', { name: resource.name })}
            </span>
          </a>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">{t('No public source link')}</span>
        )}
      </div>
    </li>
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
        className={
          dashed ? 'mt-2 border-t border-dashed border-zinc-300 pt-2 dark:border-zinc-700' : ''
        }
      >
        <a
          href={hrefFor(c)}
          aria-current={current ? 'page' : undefined}
          className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-white/80 aria-[current=page]:bg-indigo-600 aria-[current=page]:font-medium aria-[current=page]:text-white dark:text-zinc-300 dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-indigo-600 dark:aria-[current=page]:text-white"
        >
          <span>{label}</span>
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
      <nav aria-label={t('Resource categories')} className="sticky top-20">
        <ul>
          {item('', t('All resources'))}
          {RESOURCE_CATEGORIES.map((c) =>
            item(c, t(RESOURCE_CATEGORY_LABEL[c]), c === 'developer-resources'),
          )}
        </ul>
        <p className="mt-3 px-3 text-xs text-zinc-600 dark:text-zinc-400">
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
              className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              onSubmit={(e) => e.preventDefault()}
            >
              <label className="relative col-span-2 sm:col-span-3 xl:col-span-1">
                <span className="sr-only">{t('Search resources')}</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                <input
                  type="search"
                  placeholder={t('Search name, publisher, summary, tags…')}
                  value={f.q ?? ''}
                  onChange={(e) => set('q')(e.target.value)}
                  className="control control-search"
                />
              </label>
              {/* Phones and tablets: the sidebar is replaced by one compact selector (the only category control there). */}
              <label className="col-span-2 sm:col-span-3 lg:hidden">
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
              <label>
                <span className="sr-only">{t('Resource type')}</span>
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
              <label>
                <span className="sr-only">{t('Review status')}</span>
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
              <div className="col-span-2 sm:col-span-1 xl:col-span-1">
                <ViewToggle mode={view} onChange={setView} label={t('Show resources as')} />
              </div>
            </form>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
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
              <Empty title={t('No resources match these filters')}>
                <span className="flex flex-wrap justify-center gap-x-4 gap-y-1">
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
                          ? 'mt-12 border-t border-dashed border-zinc-300 pt-2 dark:border-zinc-700'
                          : ''
                      }
                    >
                      <Section
                        id={`category-${c}`}
                        title={t(RESOURCE_CATEGORY_LABEL[c])}
                        hint={t(RESOURCE_CATEGORY_HINT[c])}
                      >
                        {view === 'cards' ? (
                          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {items.map((r) => (
                              <ResourceCard key={r.id} catalog={catalog} resource={r} />
                            ))}
                          </ul>
                        ) : (
                          <div className="surface overflow-hidden">
                            <div
                              aria-hidden="true"
                              className={`hidden border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 ${LIST_COLS}`}
                            >
                              <span>{t('Resource')}</span>
                              <span>{t('Type')}</span>
                              <span>{t('Publisher')}</span>
                              <span>{t('Status')}</span>
                              <span className="text-right">{t('Actions')}</span>
                            </div>
                            <ul aria-label={t(RESOURCE_CATEGORY_LABEL[c])}>
                              {items.map((r) => (
                                <ResourceRow key={r.id} catalog={catalog} resource={r} />
                              ))}
                            </ul>
                          </div>
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
  return (
    <>
      <nav aria-label={t('Breadcrumb')} className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
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
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge>{t(RESOURCE_TYPE_LABEL[r.type])}</Badge>
          <ResourceBadges resource={r} />
        </div>
      </PageHeader>
      <p className="surface mb-8 p-3 text-sm text-zinc-700 dark:text-zinc-300">
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
                  <ExternalLink href={src.upstream.url}>{src.upstream.url}</ExternalLink>
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
                <span className="font-medium">{t('Needed to resolve')}: </span>
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
            <span className="font-medium">{t('Status')}: </span>
            {t(RESOURCE_SECURITY_LABEL[r.security.status])}
          </p>
          {r.security.concerns.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
              {r.security.concerns.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {t('No concerns recorded.')}
            </p>
          )}
          {r.security.audit && (
            <>
              <AuditSummary audit={r.security.audit} />
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
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
                  <code className="break-all">{r.mcp.officialEndpoint}</code>
                </Field>
              )}
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
                        <a
                          href={skillHref(s.id)}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs underline-offset-2 hover:underline dark:bg-zinc-800"
                        >
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
                        <a
                          href={resourceHref(x.id)}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs underline-offset-2 hover:underline dark:bg-zinc-800"
                        >
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

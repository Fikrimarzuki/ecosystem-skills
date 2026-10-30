import { useT } from '../i18n.tsx';
import { ContentAvailability } from './ContentAvailability.tsx';
import { Distribution } from './Distribution.tsx';
import { EcosystemIntegration } from './EcosystemIntegration.tsx';
import { Evaluations } from './Evaluations.tsx';
import { Upstream } from './Upstream.tsx';
import {
  agentName,
  agentStatus,
  consumersOf,
  evidenceFor,
  groupOf,
  hasDiscoveryWarnings,
  isEvidenceStale,
  isStale,
  lifecycle,
  pageHref,
  skillHref,
  sourceTreeUrl,
  TESTED_AGENTS,
  type Catalog,
  type Evidence,
} from '../lib.ts';
import {
  Badge,
  Card,
  Empty,
  ExternalLink,
  Field,
  PageHeader,
  ScrollTable,
  Section,
  Status,
  Td,
  Th,
  VerificationBadge,
} from '../ui.tsx';
import {
  Behavior,
  Discovery,
  DistributionBadge,
  OwnershipBadge,
  Explicit,
  Natural,
  none,
  outOf,
  SourceBadge,
  StaleBadge,
  StageBadge,
} from './shared.tsx';

const resultTone = { verified: 'green', partial: 'amber', failed: 'red' } as const;

function TrialCell({ e }: { e: Evidence }) {
  const t = useT();
  const tr = e.trials?.treatment;
  if (!tr)
    return e.trigger === 'natural' ? (
      <span>
        {t('single run: {outcome}', {
          outcome: e.invocation === 'pass' ? t('skill loaded') : t('skill not loaded'),
        })}
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {t('no repeated trials')}
        </span>
      </span>
    ) : (
      <span className="text-zinc-500 dark:text-zinc-400">—</span>
    );
  return (
    <span>
      {t('loaded {counts}', { counts: outOf(tr.invoked, tr.runs, t) })}
      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
        {t('behavior {counts} passed', { counts: outOf(tr.passed, tr.runs, t) })}
      </span>
      {e.trials?.control && (
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {t('control {counts} passed', {
            counts: outOf(e.trials.control.passed, e.trials.control.runs, t),
          })}
        </span>
      )}
    </span>
  );
}

function SkillLinks({ catalog, ids }: { catalog: Catalog; ids: string[] }) {
  if (!ids.length) return none;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {ids.map((d) => (
        <a key={d} href={skillHref(d)} className="underline underline-offset-2">
          {catalog.skills.find((x) => x.id === d)?.name ?? d}
        </a>
      ))}
    </span>
  );
}

export function SkillDetail({ catalog, id }: { catalog: Catalog; id: string }) {
  const t = useT();
  const skill = catalog.skills.find((s) => s.id === id);
  if (!skill)
    return (
      <>
        <PageHeader title={t('Skill not found')} />
        <Empty title={t('No skill with id “{id}”', { id })}>
          <a href={pageHref('skills')} className="underline">
            {t('Back to skills')}
          </a>
        </Empty>
      </>
    );

  const src = skill.source;
  const ev = evidenceFor(catalog, skill.id);
  const users = consumersOf(catalog, skill.id);
  const dependents = catalog.skills.filter((s) => s.requiresSkills.includes(skill.id));
  const tools = skill.requires.map((r) => catalog.integrations.find((i) => i.id === r)?.name ?? r);
  const tree = sourceTreeUrl(skill);
  const agents = [...new Set<string>([...TESTED_AGENTS, ...ev.map((e) => e.agent)])];
  const rev = skill.review;
  const verifiedFor = users.filter((u) => u.assignment.verification.status === 'verified');

  return (
    <>
      <a
        href={pageHref('skills')}
        className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
      >
        {t('← All skills')}
      </a>
      <div className="mt-3">
        <PageHeader title={skill.name} subtitle={skill.description}>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <SourceBadge skill={skill} />
            <OwnershipBadge skill={skill} />
            <DistributionBadge skill={skill} />
            <StageBadge skill={skill} />
            <Badge>{t(groupOf(skill))}</Badge>
            <Badge>{skill.category}</Badge>
            {hasDiscoveryWarnings(skill) && <Badge tone="amber">{t('Has warnings')}</Badge>}
            {skill.license && <Badge>{skill.license}</Badge>}
            {skill.tags.map((tag) => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
        </PageHeader>
      </div>

      <Section
        id="lifecycle"
        title={t('Lifecycle')}
        hint={t(
          'Seven separate facts, not steps in a progress bar. Each one can be true without the others.',
        )}
      >
        <Card>
          <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {lifecycle(catalog, skill, t).map((r) => (
              <div
                key={r.key}
                className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="text-sm font-medium">{r.label}</dt>
                <dd className="min-w-0 text-sm">
                  <Status kind={r.kind === 'unknown' ? 'warn' : r.kind}>
                    <span className="font-medium">{r.value}</span>
                  </Status>
                  <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{r.detail}</p>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t(
            'Approved is not installed. Installed is not assigned. Assigned is not activated. Activated is not verified. An explicit run does not show natural triggering, and natural triggering does not show a behavioral benefit.',
          )}
        </p>
      </Section>

      <Distribution catalog={catalog} skill={skill} />

      <ContentAvailability catalog={catalog} skill={skill} />

      <EcosystemIntegration catalog={catalog} skill={skill} />

      <Upstream catalog={catalog} skill={skill} />

      <Evaluations catalog={catalog} skill={skill} />

      <Section
        id="status"
        title={t('Agent status')}
        hint={t(
          'Derived from recorded agent runs at the pinned revision. Each column is separate: loading a skill, following it correctly, and being triggered unprompted are different things.',
        )}
      >
        <ScrollTable
          label={t('Agent status for {name}', { name: skill.name })}
          minWidth="min-w-[44rem]"
        >
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <Th>{t('Agent')}</Th>
              <Th>{t('Discovery')}</Th>
              <Th>{t('Explicit run')}</Th>
              <Th>{t('Natural trigger')}</Th>
              <Th>{t('Behavior (trials)')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {agents.map((a) => {
              const s = agentStatus(catalog, skill, a);
              return (
                <tr key={a}>
                  <Td className="font-medium">
                    {agentName(a)}
                    {s.staleRecords > 0 && (
                      <span className="mt-1 block font-normal">
                        <StaleBadge />
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Discovery s={s} />
                  </Td>
                  <Td>
                    <Explicit s={s} />
                  </Td>
                  <Td>
                    <Natural s={s} />
                  </Td>
                  <Td>
                    <Behavior s={s} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
        <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {ev.length === 0 && verifiedFor.length > 0 && (
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                {t('No per-run evidence:')}
              </strong>{' '}
              {t(
                'this table only reads evidence records. The assignment for {names} is recorded as verified separately (see Consumers).',
                { names: verifiedFor.map((u) => u.consumer.name).join(', ') },
              )}
            </li>
          )}
          <li>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">
              {t('Installed locally:')}
            </strong>{' '}
            {t('not part of this catalog. Installs are per machine ({cmd}).', {
              cmd: 'pnpm skills:status',
            })}
          </li>
          <li>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">
              {t('Platform:')}
            </strong>{' '}
            {t(
              'results are from one macOS machine; Windows and user-level (global) discovery are untested.',
            )}
          </li>
        </ul>
      </Section>

      {skill.discovery && (
        <Section
          id="discovery"
          title={t('Discovery scan')}
          hint={t(
            'How this candidate was found. It is a metadata and file scan, not a review: nothing was executed, and being listed here is not approval, installation or activation.',
          )}
        >
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={hasDiscoveryWarnings(skill) ? 'amber' : 'indigo'}>
                {hasDiscoveryWarnings(skill)
                  ? t('Registered with warnings')
                  : t('Registered for review')}
              </Badge>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {skill.discovery.discoveredAt}
              </span>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('Source')}>
                <a href={`${pageHref('sources')}#${skill.discovery.source}`} className="underline">
                  {catalog.sources.find((x) => x.id === skill.discovery!.source)?.name ??
                    skill.discovery.source}
                </a>
              </Field>
              <Field label={t('Discovered content hash')}>
                <code className="break-all">{skill.discovery.contentHash}</code>
              </Field>
            </dl>
            {skill.discovery.approvalBlockers.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <h3 className="text-sm font-medium">{t('Must be resolved before approval')}</h3>
                <p className="mt-1 text-sm">
                  {t(
                    'Approval and installation are refused while any of these remain. This skill cannot be installed as registered.',
                  )}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {skill.discovery.approvalBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {skill.discovery.warnings.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium">{t('Warnings')}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {skill.discovery.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {skill.discovery.dependencies.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium">{t('Runtime dependencies')}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {skill.discovery.dependencies.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{skill.discovery.audit}</p>
          </Card>
        </Section>
      )}

      <Section id="provenance" title={t('Source and provenance')}>
        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            {src.type === 'external' ? (
              <>
                <Field label={t('Upstream repository')}>
                  <ExternalLink href={src.upstream.url}>{src.upstream.url}</ExternalLink>
                </Field>
                <Field label={t('Skill folder at pinned revision')}>
                  {tree ? (
                    <ExternalLink href={tree}>{src.path}</ExternalLink>
                  ) : (
                    <code>{src.path}</code>
                  )}
                </Field>
                <Field label={t('Pinned revision')}>
                  <code className="break-all">{src.revision}</code>
                </Field>
                <Field label={t('Fork')}>
                  {src.fork ? (
                    <ExternalLink href={src.fork.url}>{src.fork.url}</ExternalLink>
                  ) : (
                    none
                  )}
                </Field>
              </>
            ) : (
              <Field label={t('Repository path')}>
                <code className="break-all">{src.path}</code>
              </Field>
            )}
            <Field label={t('Author')}>{skill.author ?? none}</Field>
            <Field label={t('License')}>{skill.license ?? none}</Field>
            <Field label={t('Version')}>{skill.version ?? none}</Field>
            <Field label={t('Skill ID')}>
              <code>{skill.id}</code>
            </Field>
            <Field label={t('Required tools')}>
              {tools.length ? (
                <span className="flex flex-wrap gap-1">
                  {tools.map((tool) => (
                    <Badge key={tool}>{tool}</Badge>
                  ))}
                </span>
              ) : (
                none
              )}
            </Field>
            <Field label={t('Requires skills')}>
              <SkillLinks catalog={catalog} ids={skill.requiresSkills} />
            </Field>
            <Field label={t('Required by')}>
              <SkillLinks catalog={catalog} ids={dependents.map((d) => d.id)} />
            </Field>
            <Field label={t('Agents documented upstream')}>
              {skill.agents.length ? (
                <span className="flex flex-wrap gap-1">
                  {skill.agents.map((a) => (
                    <Badge key={a}>{agentName(a)}</Badge>
                  ))}
                </span>
              ) : (
                none
              )}
            </Field>
            <Field label={t('Documentation')}>
              {skill.docs.length ? (
                <ul className="list-inside list-disc">
                  {skill.docs.map((d) => (
                    <li key={d.label}>
                      {/^https?:/.test(d.href) ? (
                        <ExternalLink href={d.href}>{d.label}</ExternalLink>
                      ) : (
                        `${d.label} (${d.href})`
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                none
              )}
            </Field>
          </dl>
        </Card>
      </Section>

      <Section id="review" title={t('Review')}>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                rev.status === 'approved' ? 'green' : rev.status === 'rejected' ? 'red' : 'indigo'
              }
            >
              {rev.status === 'unreviewed' ? t('discovered (not reviewed)') : t(rev.status)}
            </Badge>
            {rev.reviewedAt && (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{rev.reviewedAt}</span>
            )}
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {rev.reviewer && <Field label={t('Reviewer')}>{rev.reviewer}</Field>}
            {rev.approvedBy && <Field label={t('Approved by')}>{rev.approvedBy}</Field>}
            {rev.contentHash && (
              <Field label={t('Reviewed content hash')}>
                <code className="break-all">{rev.contentHash}</code>
              </Field>
            )}
          </dl>
          {rev.notes && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">{t('Notes and limitations')}</h3>
              <p className="mt-1 text-sm">{rev.notes}</p>
            </div>
          )}
          {rev.findings.length > 0 && (
            <details className="mt-4 text-sm" open={rev.findings.length <= 3}>
              <summary className="cursor-pointer font-medium">
                {t('Findings ({n})', { n: rev.findings.length })}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {rev.findings.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      </Section>

      <Section
        id="evidence"
        title={t('Evidence log')}
        hint={t(
          'Every recorded run. Older results against a different pinned revision are marked stale and excluded from the status above.',
        )}
      >
        {ev.length === 0 ? (
          <Empty title={t('No agent runs recorded')}>
            {t('Discovery or approval alone is not evidence of use.')}
          </Empty>
        ) : (
          <>
            <ScrollTable
              label={t('Evidence log for {name}', { name: skill.name })}
              minWidth="min-w-[46rem]"
            >
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <Th>{t('Agent')}</Th>
                  <Th>{t('Trigger')}</Th>
                  <Th>{t('Natural trials')}</Th>
                  <Th>{t('Date')}</Th>
                  <Th>{t('Result')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {ev.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      {agentName(e.agent)}{' '}
                      <span className="text-zinc-500 dark:text-zinc-400">{e.agentVersion}</span>
                    </Td>
                    <Td>
                      {t(e.trigger ?? 'explicit')}
                      {e.scenario && (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {' '}
                          ({e.scenario.toUpperCase()})
                        </span>
                      )}
                    </Td>
                    <Td>
                      <TrialCell e={e} />
                    </Td>
                    <Td className="whitespace-nowrap">{e.date}</Td>
                    <Td>
                      <Badge tone={resultTone[e.result]}>{t(e.result)}</Badge>
                      {isEvidenceStale(e, skill) && (
                        <span className="ml-1">
                          <StaleBadge />
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <details className="surface mt-3 p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                {t('Run details ({n})', { n: ev.length })}
              </summary>
              <ul className="mt-3 space-y-3">
                {ev.map((e) => (
                  <li key={e.id} className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {agentName(e.agent)} · {t(e.trigger ?? 'explicit')}
                      {e.scenario ? ` ${e.scenario.toUpperCase()}` : ''}:
                    </span>{' '}
                    {e.task} {e.notes}{' '}
                    {e.control && (
                      <em>
                        {t('Control:')} {e.control}{' '}
                      </em>
                    )}
                    {e.commands && <>{e.commands} </>}
                    <span className="text-zinc-500 dark:text-zinc-400">({e.context})</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Section>

      <Section
        id="consumers"
        title={t('Consumers')}
        hint={t(
          'Registry assignments: which projects should have this skill. They do not show whether a project currently has the link; check that on your machine with pnpm skills:verify <consumer>.',
        )}
      >
        {users.length === 0 ? (
          <Empty title={t('Not assigned to any consumer')} />
        ) : (
          <ul className="space-y-2">
            {users.map(({ consumer, assignment }) => (
              <li key={consumer.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium [overflow-wrap:anywhere]">{consumer.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {t('Agents')}
                      {assignment.agents.map((a) => (
                        <Badge key={a}>{agentName(a)}</Badge>
                      ))}
                      {t('Install')}
                      <Badge>{assignment.install}</Badge>
                      {t('Verification')}
                      <VerificationBadge status={assignment.verification.status} />
                      {isStale(assignment, skill) && <StaleBadge />}
                    </span>
                  </div>
                  {assignment.verification.status !== 'verified' && (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {t('Not verified for this consumer.')}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

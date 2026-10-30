import { useT } from '../i18n.tsx';
import {
  agentName,
  availabilityOf,
  installProblemText,
  reasonText,
  RELEASE_APPROVAL_LABEL,
  releaseInstallProblemsOf,
  REVIEW_OUTCOME_LABEL,
  CONTENT_LABEL,
  upstreamLinks,
  distributionOf,
  type Catalog,
  type Release,
  type Skill,
} from '../lib.ts';
import { Badge, Card, ExternalLink, Field, Section } from '../ui.tsx';
import { none } from './shared.tsx';

/** Where the original is, at the pinned commit. Never a mirror: a fork, if one is registered, is labelled as one. */
function SourceLinks({ skill, pin }: { skill: Skill; pin?: { revision: string; path: string } }) {
  const t = useT();
  if (skill.source.type !== 'external') return null;
  const l = upstreamLinks(skill, pin);
  const rev = pin?.revision ?? skill.source.revision;
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label={t('Original repository')}>
        {l.home ? <ExternalLink href={l.home}>{skill.source.upstream.url}</ExternalLink> : none}
      </Field>
      <Field label={t('Skill folder at the pinned commit')}>
        {l.folder ? (
          <ExternalLink href={l.folder}>{pin?.path ?? skill.source.path}</ExternalLink>
        ) : (
          <code>{pin?.path ?? skill.source.path}</code>
        )}
      </Field>
      <Field label={t('Pinned commit')}>
        {l.commit ? (
          <ExternalLink href={l.commit}>
            <code>{rev.slice(0, 12)}</code>
          </ExternalLink>
        ) : (
          <code>{rev}</code>
        )}
      </Field>
      <Field label={t('Upstream licence')}>{skill.license ?? t('unknown')}</Field>
      <Field label={t('Original author or organisation')}>{skill.author ?? none}</Field>
      {skill.source.fork && (
        <Field label={t('Fork (a copy, not the original)')}>
          <ExternalLink href={skill.source.fork.url}>{skill.source.fork.url}</ExternalLink>
        </Field>
      )}
    </dl>
  );
}

/**
 * What kind of evidence exists for this release (ES23), kept apart: a static review reads files, a fixture test runs
 * code on synthetic data, a live evaluation runs an agent, and the owner's decision is the human-reviewed outcome.
 * No score is shown: nothing has been measured that would support one.
 */
function EvidenceByType({ catalog, release }: { catalog: Catalog; release: Release }) {
  const t = useT();
  const runs = catalog.evidence.filter(
    (e) =>
      e.skill === release.skill &&
      (e.contentHash === release.curatedHash || e.contentHash === release.upstream?.contentHash),
  );
  const exact = runs.some((e) => e.contentHash === release.curatedHash);
  const pilot = catalog.evaluations.find(
    (e) => e.skill === release.skill && e.contentHash === release.curatedHash,
  );
  const rows: { label: string; value: string; detail?: string }[] = [
    {
      label: t('Static review'),
      value: t(REVIEW_OUTCOME_LABEL[release.review.outcome]),
      detail: release.review.reviewer,
    },
    {
      label: t('Simulated fixture test'),
      value: t('General fixtures only'),
      detail: t(
        'Install, upgrade, rollback, archive-extraction and adversarial tests run with synthetic releases on every check. No fixture simulates this skill’s own task.',
      ),
    },
    {
      label: t('Live agent evaluation'),
      value: runs.length ? t('{n} recorded agent run(s)', { n: runs.length }) : t('Not run'),
      detail: runs.length
        ? exact
          ? t('Runs used this exact release content. See Agent status below.')
          : t(
              'Runs used the same upstream content in an earlier pilot, not this release folder, and under weaker isolation than ES23 requires. See Agent status below.',
            )
        : pilot?.blockers[0],
    },
    {
      label: t('Human-reviewed outcome'),
      value:
        release.approval.status === 'approved'
          ? t('Approved by {by} on {date}', {
              by: release.approval.approvedBy ?? '',
              date: release.approval.approvedAt ?? '',
            })
          : release.approval.status === 'withdrawn'
            ? t('Approval withdrawn by the owner')
            : t('Pending: no owner decision recorded'),
      detail:
        release.approval.status === 'withdrawn'
          ? t('The owner withdrew the approval of this release; it cannot be installed.')
          : undefined,
    },
  ];
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">{t('Evidence by type')}</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="min-w-0 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{r.label}</dt>
            <dd className="mt-1 text-sm [overflow-wrap:anywhere]">
              <span className="font-medium">{r.value}</span>
              {r.detail && (
                <span className="mt-0.5 block text-zinc-600 dark:text-zinc-400">{r.detail}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReleaseDetail({
  catalog,
  skill,
  release,
}: {
  catalog: Catalog;
  skill: Skill;
  release: Release;
}) {
  const t = useT();
  const problems = releaseInstallProblemsOf(skill, release);
  const distribution = distributionOf(skill).policy;
  const moved =
    skill.source.type === 'external' &&
    release.upstream &&
    release.upstream.revision !== skill.source.revision;
  return (
    <>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t('Curated version')}>
          <code>v{release.version}</code>
        </Field>
        <Field label={t('Release status')}>
          <Badge tone={release.approval.status === 'approved' ? 'green' : 'amber'}>
            {t(RELEASE_APPROVAL_LABEL[release.approval.status])}
          </Badge>
        </Field>
        <Field label={t('Security review')}>
          {t(REVIEW_OUTCOME_LABEL[release.review.outcome])}
          {release.review.scope && (
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {t('Scope: {scope}', { scope: release.review.scope })}
            </span>
          )}
        </Field>
        <Field label={t('Created')}>{release.createdAt}</Field>
        <Field label={t('Licence')}>{release.license}</Field>
        <Field label={t('Supported agents')}>
          {release.supportedAgents.length ? (
            <span className="flex flex-wrap gap-1">
              {release.supportedAgents.map((a) => (
                <Badge key={a}>{agentName(a)}</Badge>
              ))}
            </span>
          ) : (
            none
          )}
        </Field>
        <Field label={t('Curated content hash')}>
          <code className="break-all">{release.curatedHash}</code>
        </Field>
        {release.upstream ? (
          <Field label={t('Upstream content hash')}>
            <code className="break-all">{release.upstream.contentHash}</code>
          </Field>
        ) : (
          <Field label={t('Provenance')}>
            {t('First-party: made from content authored in this repository; there is no upstream.')}
          </Field>
        )}
        <Field label={t('Attribution')}>{release.attribution}</Field>
        <Field label={t('Content location')}>
          <code className="break-all">{release.path}</code>
        </Field>
      </dl>
      {moved && (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          {t(
            'The registry now pins a different upstream commit than this release was made from. The release is a snapshot and is not updated automatically.',
          )}
        </p>
      )}
      <EvidenceByType catalog={catalog} release={release} />
      <div className="mt-4">
        <h3 className="text-sm font-medium">
          {release.upstream ? t('Modifications from upstream') : t('Recorded modifications')}
        </h3>
        {release.modifications.length === 0 && !release.upstream ? (
          <p className="mt-1 text-sm">{t('None recorded.')}</p>
        ) : release.modifications.length === 0 ? (
          <p className="mt-1 text-sm">{t('None: the curated folder is identical to upstream.')}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {release.modifications.map((m) => (
              <li key={`${m.kind}:${m.path}`}>
                <code>
                  {m.kind} {m.path}
                </code>
                : {m.summary} {t('Why: {why}', { why: m.why })}{' '}
                <span className="text-zinc-500 dark:text-zinc-400">
                  (
                  {[
                    m.affectsBehavior ? t('affects behavior') : t('no behavior change'),
                    m.affectsDependencies ? t('affects dependencies') : t('no dependency change'),
                    m.affectsPermissions ? t('affects permissions') : t('no permission change'),
                  ].join(' · ')}
                  )
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {release.references.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium">{t('Links outside the release')}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
            {release.references.map((r) => (
              <li key={`${r.path}:${r.target}`}>
                <code>
                  {r.path} → {r.target}
                </code>
                {': '}
                {r.resolution === 'unresolved'
                  ? t('Unresolved: blocks approval and installation.')
                  : t('Requires {skill}@{version} installed alongside.', {
                      skill: r.requires?.skill ?? '',
                      version: r.requires?.version ?? '',
                    })}{' '}
                <span className="text-zinc-500 dark:text-zinc-400">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(release.dependencies.length > 0 || release.restrictions.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {release.dependencies.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">{t('Required dependencies')}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {release.dependencies.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {release.restrictions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">{t('Known restrictions')}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {release.restrictions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="text-sm font-medium">{t('Installation from the curated library')}</h3>
        {distribution === 'not-distributable' ? (
          <p className="mt-1 text-sm">
            {t('Not available: this skill is published for discovery and documentation only.')}
          </p>
        ) : problems.length === 0 ? (
          <p className="mt-1 text-sm">
            {t(
              'Eligible: the release is approved and its review recorded no blocking issues. Installing is still an explicit, separate step, and nothing is installed automatically.',
            )}
            {distribution === 'restricted' &&
              ` ${t('This skill is restricted: installing also needs an explicit private authorization for the project, version and agent, which this site never sees or checks.')}`}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm">
              {t('Not available. It cannot be installed from the library because:')}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {problems.map((p) => (
                <li key={p.code + (p.detail ?? '')}>{installProblemText(p, t)}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {release.notes && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{release.notes}</p>
      )}
      <SourceLinks skill={skill} pin={release.upstream} />
      {catalog.releases.filter((r) => r.skill === skill.id).length > 1 && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t('Other versions: {list}', {
            list: catalog.releases
              .filter((r) => r.skill === skill.id && r.version !== release.version)
              .map((r) => `v${r.version}`)
              .join(', '),
          })}
        </p>
      )}
    </>
  );
}

/** Content availability: is there a local, curated copy? Separate from review, release approval and installation. */
export function ContentAvailability({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const a = availabilityOf(catalog, skill);
  return (
    <Section
      id="content"
      title={t('Content availability')}
      hint={t(
        'Whether a local, curated copy exists. A local copy is not an approval, and a scan is not a security review.',
      )}
    >
      <Card>
        <p className="font-medium">
          {t('Content availability')}: {t(CONTENT_LABEL[a.state])}
        </p>
        {skill.source.type === 'first-party' && (
          <p className="mt-2 text-sm">
            {t('This skill is authored in this repository, at {path}.', {
              path: skill.source.path,
            })}
          </p>
        )}
        {(a.state === 'source-only' ||
          a.state === 'curation-blocked' ||
          a.state === 'curation-pending') && (
          <>
            <p className="mt-2 text-sm">
              {t(
                'This skill is registered for discovery but has not yet been curated into the local library. You can inspect its original source, but a curated installation is not currently available.',
              )}
            </p>
            {a.state === 'curation-blocked' && (
              <p className="mt-2 text-sm">
                {t('Curation is blocked until the reasons below are resolved.')}
              </p>
            )}
            {a.state === 'curation-pending' && (
              <p className="mt-2 text-sm">
                {t('It is selected for future curation; no copy exists yet.')}
              </p>
            )}
            <h3 className="mt-4 text-sm font-medium">{t('Why there is no curated copy')}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {a.reasons.map((r) => (
                <li key={r.code + (r.detail ?? '')}>{reasonText(r, t)}</li>
              ))}
            </ul>
            <SourceLinks skill={skill} />
          </>
        )}
        {a.release && <ReleaseDetail catalog={catalog} skill={skill} release={a.release} />}
      </Card>
    </Section>
  );
}

import { Glyph, GlyphSlot } from '../art.tsx';
import { useT } from '../i18n.tsx';
import {
  agentName,
  agentStatus,
  approvedUpgrade,
  consumerAnchor,
  groupOf,
  isStale,
  skillHref,
  type Catalog,
  type Consumer,
} from '../lib.ts';
import { Badge, Empty, PageHeader, Section, VerificationBadge } from '../ui.tsx';
import { AgentLine, StaleBadge } from './shared.tsx';

/**
 * ES28.3 Consumers ("Agent builds"): each project is read like a character's build sheet, but every line is the
 * registry's own record. An assignment is desired state: nothing here says a skill is installed, linked, activated
 * or authorized unless a recorded verification says so, per agent.
 */

function Assignment({
  catalog,
  a,
  consumer,
}: {
  catalog: Catalog;
  a: Consumer['assignments'][number];
  consumer: string;
}) {
  const t = useT();
  const skill = catalog.skills.find((s) => s.id === a.skill);
  const hasEvidence = skill ? catalog.evidence.some((e) => e.skill === skill.id) : false;
  const upgrade = skill ? approvedUpgrade(catalog, skill, a.release) : undefined;
  return (
    <li className="flex gap-3 border-b-2 border-dashed border-(--cw-rule) py-3 first:pt-0 last:border-b-0 last:pb-0">
      <span className="mt-0.5 hidden w-6 shrink-0 justify-center min-[360px]:flex">
        <Glyph name={skill ? groupOf(skill) : 'Other'} />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={skillHref(a.skill)}
          className="font-bold underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {skill?.name ?? a.skill}
        </a>
        <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="text-(--cw-muted)">{t('Agents')}</dt>
            {a.agents.map((ag) => (
              <dd key={ag}>
                <Badge>{agentName(ag)}</Badge>
              </dd>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-(--cw-muted)">{t('Install')}</dt>
            <dd>
              <Badge tone="neutral">{a.install}</Badge>
            </dd>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="text-(--cw-muted)">{t('Verification')}</dt>
            <dd className="flex flex-wrap gap-1.5">
              <VerificationBadge status={a.verification.status} />
              {isStale(a, skill) && <StaleBadge />}
              {skill?.origin === 'external' && (
                <Badge tone={a.release ? 'signal' : 'neutral'}>
                  {a.release
                    ? t('Curated release v{version}', { version: a.release })
                    : t('Legacy upstream install')}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {hasEvidence ? (
          <ul className="mt-2 space-y-0.5 text-sm text-(--cw-muted)">
            {a.agents.map((ag) => (
              <li key={ag}>
                <AgentLine s={agentStatus(catalog, skill, ag)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-(--cw-muted)">
            {t('No per-agent evidence records; see the verification notes.')}
          </p>
        )}
        {skill?.origin === 'external' && (
          <p className="mt-1 text-sm [overflow-wrap:anywhere] text-(--cw-muted)">
            {upgrade
              ? t(
                  'Approved curated v{version} is available. Preview (changes nothing): {command}',
                  {
                    version: upgrade,
                    command: `pnpm skills:library upgrade ${consumer} ${a.skill} --to ${upgrade}${a.release ? '' : ' --migrate'}`,
                  },
                )
              : t('No approved curated upgrade.')}
          </p>
        )}
        {a.verification.method && (
          <details className="mt-1.5 text-sm">
            <summary className="cursor-pointer py-1 underline-offset-2 hover:underline">
              {t('Verification notes')}
              {a.verification.verifiedAt ? ` (${a.verification.verifiedAt})` : ''}
              <span className="sr-only"> {t('for {name}', { name: skill?.name ?? a.skill })}</span>
            </summary>
            <p className="mt-1 text-(--cw-muted)">{a.verification.method}</p>
          </details>
        )}
      </div>
    </li>
  );
}

function KindBadge({ c }: { c: Consumer }) {
  const t = useT();
  return (
    <Badge tone={c.kind === 'global' ? 'signal' : 'neutral'}>
      {c.kind === 'global' ? t('global') : t('project')}
    </Badge>
  );
}

function BuildCard({ catalog, c }: { catalog: Catalog; c: Consumer }) {
  const t = useT();
  const external = c.assignments.some(
    (a) => catalog.skills.find((s) => s.id === a.skill)?.origin === 'external',
  );
  const sources = (c.ecosystem?.sources ?? []).map(
    (id) => catalog.integrations.find((i) => i.id === id)?.name ?? id,
  );
  return (
    <li id={consumerAnchor(c.id)} className="flex min-w-0 scroll-mt-24">
      {/* One frame for every build, whatever its assignments or verification. */}
      <article className="surface flex w-full min-w-0 flex-col p-4 sm:p-5">
        <header className="flex min-w-0 items-start gap-3">
          <GlyphSlot name="house" />
          <div className="min-w-0">
            <h3 className="text-base font-bold [overflow-wrap:anywhere]">{c.name}</h3>
            <p className="text-sm text-(--cw-muted)">
              {c.assignments.length === 1
                ? t('{n} skill', { n: 1 })
                : t('{n} skills', { n: c.assignments.length })}
            </p>
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <KindBadge c={c} />
          {c.agents.length > 0 && <span className="ml-1 text-(--cw-muted)">{t('Used with')}</span>}
          {c.agents.map((a) => (
            <Badge key={a}>{agentName(a)}</Badge>
          ))}
        </div>
        {c.description && (
          <p className="mt-2 text-sm [overflow-wrap:anywhere] text-(--cw-muted)">{c.description}</p>
        )}
        <h4 className="mt-4 mb-2 text-sm font-bold">
          {t('Assigned skills')}{' '}
          <span className="font-normal text-(--cw-muted)">· {t('desired state')}</span>
        </h4>
        <ul>
          {c.assignments.map((a) => (
            <Assignment key={a.skill} catalog={catalog} a={a} consumer={c.id} />
          ))}
        </ul>
        {(external || sources.length > 0) && (
          <div className="cw-record mt-auto space-y-1 pt-3 text-sm">
            {sources.length > 0 && (
              <p className="[overflow-wrap:anywhere]">
                <span className="text-(--cw-muted)">{t('Shared sources')}:</span>{' '}
                <span className="font-bold">{sources.join(', ')}</span>
              </p>
            )}
            {external && (
              <p className="[overflow-wrap:anywhere] text-(--cw-muted)">
                {t(
                  'The installed version is machine-local: pnpm skills:library status {consumer}',
                  { consumer: c.id },
                )}
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

export function Consumers({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const withSkills = catalog.consumers.filter((c) => c.assignments.length > 0);
  const without = catalog.consumers.filter((c) => c.assignments.length === 0);
  return (
    <>
      <PageHeader
        kicker={{ text: t('Agent builds'), glyph: 'house' }}
        title={t('Consumers')}
        subtitle={t(
          'Projects and global agent setups, with the skills assigned to each. An assignment is desired state; “verified” appears only where real agent runs or a recorded check support it, per agent.',
        )}
      />
      <p className="surface -mt-3 mb-6 max-w-3xl p-3 text-sm sm:-mt-5">
        {t(
          'This site shows the registry only. It cannot see a project’s folders, so it does not say whether a skill is installed or linked there. On your machine, run pnpm skills:verify <consumer> for the link state; it checks the filesystem, not agent behavior.',
        )}
      </p>
      {catalog.consumers.length === 0 ? (
        <Empty title={t('No consumers registered')} />
      ) : (
        <>
          {withSkills.length > 1 && (
            <nav aria-label={t('Builds on this page')} className="mb-8">
              <h2 className="mb-2 text-sm font-bold">{t('Builds on this page')}</h2>
              <ul className="flex flex-wrap gap-2">
                {withSkills.map((c) => (
                  <li key={c.id}>
                    <a href={`#${consumerAnchor(c.id)}`} className="cw-chip gap-1.5 text-sm!">
                      <span className="[overflow-wrap:anywhere]">{c.name}</span>
                      <span className="text-(--cw-muted) tabular-nums">{c.assignments.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <Section title={t('With assigned skills ({n})', { n: withSkills.length })} id="assigned">
            {withSkills.length === 0 ? (
              <Empty title={t('No consumer has assigned skills yet')} />
            ) : (
              <ul className="grid gap-5 lg:grid-cols-2">
                {withSkills.map((c) => (
                  <BuildCard key={c.id} catalog={catalog} c={c} />
                ))}
              </ul>
            )}
          </Section>
          {without.length > 0 && (
            <Section
              title={t('Registered, no assignments yet ({n})', { n: without.length })}
              id="unassigned"
              hint={t(
                'These consumers exist in the registry but no skill has been assigned to them.',
              )}
            >
              <ul className="flex flex-wrap gap-3">
                {without.map((c) => (
                  <li key={c.id} id={consumerAnchor(c.id)} className="scroll-mt-24">
                    <span className="surface inline-flex min-h-10 items-center gap-2 px-3 py-1.5 text-sm">
                      <Glyph name="house" />
                      <span className="font-bold [overflow-wrap:anywhere]">{c.name}</span>
                      <KindBadge c={c} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}

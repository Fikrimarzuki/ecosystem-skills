import { useT } from '../i18n.tsx';
import {
  agentName,
  agentStatus,
  approvedUpgrade,
  isStale,
  skillHref,
  type Catalog,
  type Consumer,
} from '../lib.ts';
import { Badge, Card, Empty, PageHeader, Section, VerificationBadge } from '../ui.tsx';
import { AgentLine, StaleBadge } from './shared.tsx';

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
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={skillHref(a.skill)}
          className="font-medium underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {skill?.name ?? a.skill}
        </a>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {t('Agents')}
          {a.agents.map((ag) => (
            <Badge key={ag}>{agentName(ag)}</Badge>
          ))}
          {t('Install')}
          <Badge tone="neutral">{a.install}</Badge>
          {t('Verification')}
          <VerificationBadge status={a.verification.status} />
          {isStale(a, skill) && <StaleBadge />}
          {skill?.origin === 'external' && (
            <Badge tone={a.release ? 'indigo' : 'neutral'}>
              {a.release
                ? t('Curated release v{version}', { version: a.release })
                : t('Legacy upstream install')}
            </Badge>
          )}
        </span>
      </div>
      {hasEvidence ? (
        <ul className="mt-2 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {a.agents.map((ag) => (
            <li key={ag}>
              <AgentLine s={agentStatus(catalog, skill, ag)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t('No per-agent evidence records; see the verification notes.')}
        </p>
      )}
      {skill?.origin === 'external' && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 [overflow-wrap:anywhere]">
          {upgrade
            ? t('Approved curated v{version} is available. Preview (changes nothing): {command}', {
                version: upgrade,
                command: `pnpm skills:library upgrade ${consumer} ${a.skill} --to ${upgrade}${a.release ? '' : ' --migrate'}`,
              })
            : t('No approved curated upgrade.')}{' '}
          {t('The installed version is machine-local: pnpm skills:library status {consumer}', {
            consumer,
          })}
        </p>
      )}
      {a.verification.method && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-300">
            {t('Verification notes')}
            {a.verification.verifiedAt ? ` (${a.verification.verifiedAt})` : ''}
          </summary>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{a.verification.method}</p>
        </details>
      )}
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
        title={t('Consumers')}
        subtitle={t(
          'Projects and global agent setups, with the skills assigned to each. An assignment is desired state; “verified” appears only where real agent runs or a recorded check support it, per agent.',
        )}
      />
      <p className="surface -mt-3 mb-6 max-w-3xl p-3 text-sm text-zinc-700 sm:-mt-5 dark:text-zinc-300">
        {t(
          'This site shows the registry only. It cannot see a project’s folders, so it does not say whether a skill is installed or linked there. On your machine, run pnpm skills:verify <consumer> for the link state; it checks the filesystem, not agent behavior.',
        )}
      </p>
      {catalog.consumers.length === 0 ? (
        <Empty title={t('No consumers registered')} />
      ) : (
        <>
          <Section title={t('With assigned skills ({n})', { n: withSkills.length })} id="assigned">
            {withSkills.length === 0 ? (
              <Empty title={t('No consumer has assigned skills yet')} />
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {withSkills.map((c) => (
                  <li key={c.id}>
                    <Card className="h-full">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold [overflow-wrap:anywhere]">
                          {c.name}
                          <span className="ml-2 text-sm font-normal text-zinc-600 dark:text-zinc-400">
                            {c.assignments.length === 1
                              ? t('{n} skill', { n: 1 })
                              : t('{n} skills', { n: c.assignments.length })}
                          </span>
                        </h3>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={c.kind === 'global' ? 'indigo' : 'neutral'}>{c.kind}</Badge>
                          {c.agents.map((a) => (
                            <Badge key={a}>{agentName(a)}</Badge>
                          ))}
                        </span>
                      </div>
                      {c.description && (
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {c.description}
                        </p>
                      )}
                      <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
                        {c.assignments.map((a) => (
                          <Assignment key={a.skill} catalog={catalog} a={a} consumer={c.id} />
                        ))}
                      </ul>
                    </Card>
                  </li>
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
              <ul className="flex flex-wrap gap-2">
                {without.map((c) => (
                  <li key={c.id}>
                    <span className="surface inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                      {c.name}
                      <Badge tone={c.kind === 'global' ? 'indigo' : 'neutral'}>{c.kind}</Badge>
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

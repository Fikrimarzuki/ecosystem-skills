import { useT } from '../i18n.tsx';
import {
  agentName,
  agentOverview,
  recentEvidence,
  pageHref,
  skillHref,
  skillsHref,
  summarize,
  type Catalog,
} from '../lib.ts';
import { ArrowIcon, Badge, Card, Empty, PageHeader, Section } from '../ui.tsx';
import { outOf } from './shared.tsx';

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</dd>
      {note && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{note}</p>}
    </>
  );
  return href ? (
    <a href={href} className="surface surface-hover group block p-4">
      {body}
    </a>
  ) : (
    <Card>{body}</Card>
  );
}

export function Overview({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const s = summarize(catalog);
  const agents = agentOverview(catalog);
  const recent = recentEvidence(catalog, 6);
  const skillName = (id: string) => catalog.skills.find((x) => x.id === id)?.name ?? id;

  if (s.skills === 0)
    return (
      <>
        <PageHeader
          title={t('Overview')}
          subtitle={t('Skills, consumers and agent evidence in this ecosystem.')}
        />
        <Empty title={t('No skills registered yet')}>
          {t('Add entries to registry/skills.json and rebuild the site.')}
        </Empty>
      </>
    );

  return (
    <>
      <PageHeader
        title={t('Overview')}
        subtitle={t(
          'Skills, consumers and agent evidence registered in this ecosystem. This site is a read-only view of the registry; it cannot install or run anything.',
        )}
      />

      <Section title={t('Registry')} id="registry">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('Registered skills')} value={s.skills} href={skillsHref({})} />
          <Stat
            label={t('First-party')}
            value={s.firstParty}
            href={skillsHref({ origin: 'first-party' })}
          />
          <Stat
            label={t('Third-party')}
            value={s.external}
            note={t('{approved} approved · {reviewed} reviewed', {
              approved: s.approved,
              reviewed: s.reviewed,
            })}
            href={skillsHref({ origin: 'external' })}
          />
          <Stat
            label={t('Consumers')}
            value={s.consumers}
            note={t('{n} with assignments', { n: s.consumersWithAssignments })}
            href={pageHref('consumers')}
          />
        </dl>
      </Section>

      <Section
        title={t('Third-party review status')}
        id="pipeline"
        hint={t(
          'Each third-party skill is in exactly one of these. Approval is not installation: installs are local to each machine and not part of this catalog. Verification is per agent (below).',
        )}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [t('Discovered'), s.discovered, 'discovered'],
              [t('Reviewed'), s.reviewed, 'reviewed'],
              [t('Approved'), s.approved, 'approved'],
              [t('Rejected'), s.rejected, 'rejected'],
            ] as const
          ).map(([label, n, status]) => (
            <li key={label}>
              <a href={skillsHref({ status })} className="surface surface-hover block p-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
                <span className="block text-2xl font-semibold tabular-nums">{n}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={t('Agent evidence')}
        id="agents"
        hint={t(
          'What real agent runs have shown. Counts only: small samples, one machine. Natural triggering is probabilistic.',
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((a) => (
            <Card key={a.agent}>
              <h3 className="font-medium">{agentName(a.agent)}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">
                    {t('Skills verified by explicit run')}
                  </dt>
                  <dd className="font-medium tabular-nums">{a.explicitSkills}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">{t('Natural triggering')}</dt>
                  <dd className="text-right font-medium">
                    {a.natural
                      ? t('loaded in {counts}', {
                          counts: outOf(a.natural.invoked, a.natural.runs, t),
                        })
                      : t('not tested')}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">{t('Behavior in trials')}</dt>
                  <dd className="text-right font-medium">
                    {a.behavior
                      ? t('{counts} passed', {
                          counts: outOf(a.behavior.passed, a.behavior.runs, t),
                        })
                      : t('not measured')}
                    {a.control && (
                      <span className="block text-xs font-normal text-zinc-600 dark:text-zinc-400">
                        {t('controls: {counts} passed', {
                          counts: outOf(a.control.passed, a.control.runs, t),
                        })}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-sm">
          <a
            href={pageHref('integrations')}
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            {t('How agent evidence is classified')} <ArrowIcon width={14} height={14} />
          </a>
        </p>
      </Section>

      <Section
        title={t('Recent evidence')}
        id="recent"
        hint={t('Latest recorded agent runs. Open a skill for the full trial table.')}
      >
        {recent.length === 0 ? (
          <Empty title={t('No agent runs recorded yet')} />
        ) : (
          <ul className="surface divide-y divide-zinc-200 dark:divide-zinc-800">
            {recent.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <a href={skillHref(e.skill)} className="font-medium underline underline-offset-2">
                    {skillName(e.skill)}
                  </a>{' '}
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {t('on {agent}', { agent: agentName(e.agent) })} · {t(e.trigger ?? 'explicit')}
                    {e.scenario ? ` ${e.scenario.toUpperCase()}` : ''} · {e.date}
                  </span>
                </span>
                <Badge
                  tone={
                    e.result === 'verified' ? 'green' : e.result === 'partial' ? 'amber' : 'red'
                  }
                >
                  {t(e.result)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

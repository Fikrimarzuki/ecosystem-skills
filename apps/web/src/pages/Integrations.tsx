import { useT } from '../i18n.tsx';
import { agentName, agentOverview, type Catalog } from '../lib.ts';
import {
  Badge,
  Card,
  Empty,
  ExternalLink,
  PageHeader,
  ScrollTable,
  Section,
  Td,
  Th,
} from '../ui.tsx';
import { none, outOf } from './shared.tsx';

export const TERMS: [string, string][] = [
  ['Discovery', 'The agent listed the skill (or could read it) in a project that links it.'],
  [
    'Instruction loading',
    'The agent actually read the skill’s SKILL.md, shown by a load in its trace.',
  ],
  ['Explicit invocation', 'The prompt names the skill and the agent follows it.'],
  [
    'Natural triggering',
    'The agent loads the skill unprompted. Probabilistic, so shown as runs out of runs.',
  ],
  [
    'Functional verification',
    'The skill’s behavior was checked against a rubric. It is judged separately from loading, and never proves that the skill was invoked.',
  ],
];

export function Integrations({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const agents = agentOverview(catalog);
  return (
    <>
      <PageHeader
        title={t('Agents & tools')}
        subtitle={t(
          'How each agent has actually performed with these skills, and the tools skills depend on. Install state is not tracked here.',
        )}
      />

      <Section
        id="agents"
        title={t('Agent compatibility')}
        hint={t(
          'Totals across all skills with recorded runs. These are counts from small samples on one machine, not rates.',
        )}
      >
        <ScrollTable label={t('Agent compatibility summary')} minWidth="min-w-[40rem]">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <Th>{t('Agent')}</Th>
              <Th>{t('Skills with runs')}</Th>
              <Th>{t('Explicit runs verified')}</Th>
              <Th>{t('Natural: loaded')}</Th>
              <Th>{t('Natural: behavior (control)')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {agents.map((a) => (
              <tr key={a.agent}>
                <Td className="font-medium">{agentName(a.agent)}</Td>
                <Td>{a.skillsWithEvidence}</Td>
                <Td>{t('{n} skills', { n: a.explicitSkills })}</Td>
                <Td>
                  {a.natural ? (
                    outOf(a.natural.invoked, a.natural.runs, t)
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t('not tested')}</span>
                  )}
                </Td>
                <Td>
                  {a.behavior ? (
                    <>
                      {outOf(a.behavior.passed, a.behavior.runs, t)}
                      {a.control && (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {' '}
                          ({outOf(a.control.passed, a.control.runs, t)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t('not measured')}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>

        <h3 className="mt-6 mb-2 text-sm font-medium">{t('What each term means')}</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {TERMS.map(([term, d]) => (
            <div key={term} className="surface rounded-xl p-3 text-sm">
              <dt className="font-medium">{t(term)}</dt>
              <dd className="mt-1 text-zinc-600 dark:text-zinc-400">{t(d)}</dd>
            </div>
          ))}
        </dl>

        <Card className="mt-4">
          <h3 className="text-sm font-medium">
            {t('Platform limitations (from repository documentation)')}
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>{t('Results come from macOS only. Windows is untested.')}</li>
            <li>
              {t(
                'Only project-local discovery was tested. User-level (global) skill folders were not.',
              )}
            </li>
            <li>
              {t(
                'Inside Codex’s sandbox, GUI tools such as Inkscape and Chromium cannot run, so skills that need them can use only part of their tooling there.',
              )}
            </li>
            <li>
              {t('Cursor is referenced by some upstream skills but has not been tested here.')}
            </li>
          </ul>
        </Card>
      </Section>

      <Section
        id="tools"
        title={t('Tools and dependencies')}
        hint={t('MCP servers, CLI tools and software that skills may require.')}
      >
        {catalog.integrations.length === 0 ? (
          <Empty title={t('No integrations registered yet')} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {catalog.integrations.map((i) => {
              const usedBy = catalog.skills.filter((s) => s.requires.includes(i.id));
              return (
                <li key={i.id}>
                  <Card className="h-full">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{i.name}</h3>
                      <Badge tone="indigo">{i.type}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{i.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.transport && <Badge>{i.transport}</Badge>}
                      {i.license && <Badge>{i.license}</Badge>}
                    </div>
                    {i.homepage && (
                      <p className="mt-2 text-xs">
                        <ExternalLink href={i.homepage}>{i.homepage}</ExternalLink>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {t('Required by:')}{' '}
                      {usedBy.length ? usedBy.map((s) => s.name).join(', ') : none}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

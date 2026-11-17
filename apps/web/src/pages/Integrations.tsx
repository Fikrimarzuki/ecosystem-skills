import { GlyphSlot, type GlyphName } from '../art.tsx';
import { useT } from '../i18n.tsx';
import { agentName, agentOverview, skillHref, type Catalog } from '../lib.ts';
import { Badge, Empty, ExternalLink, Field, PageHeader, Section } from '../ui.tsx';
import { none, outOf, UrlText } from './shared.tsx';

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

/** A symbol per integration type (decorative; the type is also written as a badge). */
const TYPE_GLYPH: Record<Catalog['integrations'][number]['type'], GlyphName> = {
  'mcp-server': 'plug',
  'cli-tool': 'terminal',
  dependency: 'hammer',
  'asset-catalog': 'Design',
  'config-registry': 'ledger',
};

/**
 * ES28.3 Agents & tools ("Agent roster"): one roster panel per tested agent, with the same recorded counts the
 * compatibility table showed, then the tools skills depend on. No install state, no invented compatibility: every
 * number is computed from the evidence records.
 */
export function Integrations({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const agents = agentOverview(catalog);
  return (
    <>
      <PageHeader
        kicker={{ text: t('Agent roster'), glyph: 'terminal' }}
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
        <ul className="grid gap-5 md:grid-cols-2">
          {agents.map((a) => (
            <li key={a.agent} className="surface flex min-w-0 flex-col p-4 sm:p-5">
              <h3 className="flex items-center gap-3 text-lg font-bold">
                <GlyphSlot name="terminal" />
                {agentName(a.agent)}
              </h3>
              <dl className="mt-4 grid gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
                <Field label={t('Skills with runs')}>
                  <span className="text-base font-bold tabular-nums">{a.skillsWithEvidence}</span>
                </Field>
                <Field label={t('Explicit runs verified')}>
                  <span className="text-base font-bold">
                    {t('{n} skills', { n: a.explicitSkills })}
                  </span>
                </Field>
                <Field label={t('Natural: loaded')}>
                  {a.natural ? (
                    <span className="font-bold">{outOf(a.natural.invoked, a.natural.runs, t)}</span>
                  ) : (
                    <span className="text-(--cw-muted)">{t('not tested')}</span>
                  )}
                </Field>
                <Field label={t('Natural: behavior (control)')}>
                  {a.behavior ? (
                    <>
                      <span className="font-bold">
                        {outOf(a.behavior.passed, a.behavior.runs, t)}
                      </span>
                      {a.control && (
                        <span className="text-(--cw-muted)">
                          {' '}
                          ({outOf(a.control.passed, a.control.runs, t)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-(--cw-muted)">{t('not measured')}</span>
                  )}
                </Field>
              </dl>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <h3 className="mb-2 font-bold">{t('What each term means')}</h3>
            <dl className="surface p-4 sm:p-5">
              {TERMS.map(([term, d]) => (
                <div
                  key={term}
                  className="border-b-2 border-dashed border-(--cw-rule) py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
                >
                  <dt className="font-bold">{t(term)}</dt>
                  <dd className="mt-0.5 text-(--cw-muted)">{t(d)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 font-bold">
              {t('Platform limitations (from repository documentation)')}
            </h3>
            <ul className="surface list-disc space-y-1.5 p-4 pl-9 text-sm sm:p-5 sm:pl-10">
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
          </div>
        </div>
      </Section>

      <Section
        id="tools"
        title={t('Tools and dependencies')}
        hint={t('MCP servers, CLI tools and software that skills may require.')}
      >
        {catalog.integrations.length === 0 ? (
          <Empty title={t('No integrations registered yet')} />
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {catalog.integrations.map((i) => {
              const usedBy = catalog.skills.filter((s) => s.requires.includes(i.id));
              return (
                <li key={i.id} className="surface flex min-w-0 flex-col p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <GlyphSlot name={TYPE_GLYPH[i.type]} />
                    <div className="min-w-0">
                      <h3 className="font-bold [overflow-wrap:anywhere]">{i.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone="signal">{i.type}</Badge>
                        {i.transport && <Badge>{i.transport}</Badge>}
                        {i.license && <Badge>{i.license}</Badge>}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-(--cw-muted)">{i.description}</p>
                  {(i.homepage || i.repository) && (
                    <div className="mt-3 space-y-1 text-sm">
                      {i.homepage && (
                        <p>
                          <ExternalLink href={i.homepage}>
                            <UrlText url={i.homepage} />
                          </ExternalLink>
                        </p>
                      )}
                      {i.repository &&
                        (i.repository.url ? (
                          i.repository.url !== i.homepage && (
                            <p>
                              <ExternalLink href={i.repository.url}>
                                <UrlText url={i.repository.url} />
                              </ExternalLink>
                            </p>
                          )
                        ) : (
                          <p className="text-(--cw-muted)">
                            <code className="text-(--cw-ink)">{i.repository.name}</code>{' '}
                            {t('(private repository; not linked)')}
                          </p>
                        ))}
                    </div>
                  )}
                  <div className="mt-auto pt-4" />
                  <div className="cw-record pt-3 text-sm">
                    <p className="mb-1.5 text-xs text-(--cw-muted)">{t('Required by:')}</p>
                    {usedBy.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {usedBy.map((s) => (
                          <li key={s.id}>
                            <a href={skillHref(s.id)} className="cw-chip">
                              {s.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      none
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

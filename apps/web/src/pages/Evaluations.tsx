import { useT } from '../i18n.tsx';
import {
  RECOMMENDATION_LABEL,
  skillHref,
  type Catalog,
  type Evaluation,
  type Skill,
} from '../lib.ts';
import { Badge, Card, Section } from '../ui.tsx';

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** Evaluation records (ES19). Static assessments and agent runs are labelled differently; there are no scores. */
export function Evaluations({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const evs = catalog.evaluations.filter((e) => e.skill === skill.id);
  if (!evs.length) return null;
  return (
    <Section
      id="evaluation"
      title={t('Evaluation')}
      hint={t(
        'A static assessment reads the files; it does not show how an agent behaves. A recommendation is not an approval.',
      )}
    >
      {evs.map((e: Evaluation) => {
        const stale =
          skill.source.type === 'external' && e.revision && e.revision !== skill.source.revision;
        return (
          <Card key={e.id} className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={e.kind === 'agent-run' ? 'indigo' : 'neutral'}>
                {e.kind === 'agent-run' ? t('Agent run') : t('Static assessment: no agent was run')}
              </Badge>
              <span className="text-sm">
                {t('Recommendation (not an approval):')}{' '}
                <Badge tone="amber">{t(RECOMMENDATION_LABEL[e.recommendation])}</Badge>
              </span>
              {stale && <Badge tone="amber">{t('stale: revision changed')}</Badge>}
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{e.date}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{e.assessor}</p>
            <p className="mt-2 text-sm">{e.scope}</p>
            {e.measurements.length > 0 && (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {e.measurements.map((m) => (
                  <div key={m.name}>
                    <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {m.name}
                    </dt>
                    <dd>
                      {m.value.toLocaleString('en')} {m.unit}{' '}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">({m.method})</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <List title={t('Security findings')} items={e.security} />
            <List title={t('Compatibility')} items={e.compatibility} />
            <List title={t('Strengths')} items={e.strengths} />
            <List title={t('Weaknesses')} items={e.weaknesses} />
            <div className="mt-3">
              <h4 className="text-sm font-medium">{t('Comparison')}</h4>
              <p className="mt-1 text-sm">
                {e.comparison.status === 'run' ? t('Run.') : t('Not run.')} {e.comparison.summary}
                {e.comparison.alternative && e.comparison.alternative !== skill.id && (
                  <>
                    {' '}
                    {t('Approved alternative:')}{' '}
                    <a className="underline" href={skillHref(e.comparison.alternative)}>
                      {e.comparison.alternative}
                    </a>
                  </>
                )}
              </p>
            </div>
            <List title={t('Outstanding blockers')} items={e.blockers} />
            {e.notes && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{e.notes}</p>}
          </Card>
        );
      })}
    </Section>
  );
}

import { useT } from '../i18n.tsx';
import {
  AUDIT_COMPLETENESS_LABEL,
  AUDIT_RECOMMENDATION_LABEL,
  CHECK_RESULT_LABEL,
  REVIEW_CATEGORY_LABEL,
  SEVERITY_LABEL,
  sortedIssues,
  type Audit,
} from '../lib.ts';
import { Badge, type Tone } from '../ui.tsx';

const severityTone: Record<Audit['issues'][number]['severity'], Tone> = {
  critical: 'red',
  high: 'red',
  medium: 'amber',
  low: 'neutral',
  info: 'neutral',
};
const recommendationTone: Record<Audit['recommendation'], Tone> = {
  'controlled-evaluation': 'indigo',
  'after-remediation': 'amber',
  'reference-only': 'neutral',
  defer: 'amber',
  'do-not-adopt': 'red',
};
const resultTone: Record<Audit['checks'][number]['result'], Tone> = {
  'no-issue-found': 'green',
  'issue-found': 'red',
  'needs-manual-review': 'amber',
  'not-evaluated': 'neutral',
};

/**
 * ES27 security audit, shown on skill and resource pages. It states completeness and scope first, labels the
 * recommendation as advice (never an approval), and lists findings most severe first with their evidence.
 */
export function AuditSummary({ audit }: { audit: Audit }) {
  const t = useT();
  const issues = sortedIssues(audit);
  return (
    <div
      className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      data-audit={audit.round}
    >
      <h3 className="text-sm font-medium">
        {t('Security audit ({round})', { round: audit.round })}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 [&>span]:whitespace-normal">
        <Badge tone={audit.completeness === 'complete' ? 'green' : 'amber'}>
          {t(AUDIT_COMPLETENESS_LABEL[audit.completeness])}
        </Badge>
        <Badge tone={recommendationTone[audit.recommendation]}>
          {t('Audit recommendation: {r}', {
            r: t(AUDIT_RECOMMENDATION_LABEL[audit.recommendation]),
          })}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {t(
          'An audit recommendation is advice for the next step. It is not an approval and installs nothing.',
        )}
      </p>
      <p className="mt-3 text-sm [overflow-wrap:anywhere]">
        <span className="font-medium">{t('Scope')}: </span>
        {audit.scope}
      </p>
      <p className="mt-2 text-sm [overflow-wrap:anywhere]">
        <span className="font-medium">{t('Rationale')}: </span>
        {audit.rationale}
      </p>
      {issues.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-sm font-medium">{t('Findings ({n})', { n: issues.length })}</h4>
          <ul className="mt-2 space-y-3">
            {issues.map((f) => (
              <li key={f.title} className="text-sm [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={severityTone[f.severity]}>{t(SEVERITY_LABEL[f.severity])}</Badge>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">{t('Evidence')}: </span>
                  {f.evidence}
                </p>
                {f.exposure && (
                  <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {t('When it applies')}:{' '}
                    </span>
                    {f.exposure}
                  </p>
                )}
                {f.mitigation && (
                  <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                    <span className="text-zinc-500 dark:text-zinc-400">{t('Mitigation')}: </span>
                    {f.mitigation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t('No security findings were recorded in the audited scope.')}
        </p>
      )}
      {audit.checks.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {t('Checks ({n})', { n: audit.checks.length })}
          </summary>
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {audit.checks.map((c) => (
              <li
                key={`${c.category}/${c.scope}`}
                className="grid gap-1 py-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-3"
              >
                <span>
                  {t(REVIEW_CATEGORY_LABEL[c.category])}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {' · '}
                    {c.scope === 'instructions' ? t('instructions') : t('supporting files')}
                  </span>
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <Badge tone={resultTone[c.result]}>{t(CHECK_RESULT_LABEL[c.result])}</Badge>
                  {c.note && <span className="ml-2">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

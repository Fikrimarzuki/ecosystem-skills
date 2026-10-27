import type { AgentStatus, Skill } from '../lib.ts';
import { agentName, ORIGIN_LABEL, stage, STAGE_LABEL, type Stage } from '../lib.ts';
import { tEn, useT, type T } from '../i18n.tsx';
import { Badge, Status, type Tone } from '../ui.tsx';

export const stageTone: Record<Stage, Tone> = {
  'first-party': 'indigo',
  discovered: 'amber',
  reviewed: 'amber',
  approved: 'green',
  rejected: 'red',
};

export function StageBadge({ skill }: { skill: Skill }) {
  const t = useT();
  return <Badge tone={stageTone[stage(skill)]}>{t(STAGE_LABEL[stage(skill)])}</Badge>;
}

export function SourceBadge({ skill }: { skill: Skill }) {
  const t = useT();
  return <Badge tone="neutral">{t(ORIGIN_LABEL[skill.origin]!)}</Badge>;
}

export function StaleBadge() {
  const t = useT();
  return <Badge tone="amber">{t('stale: revision changed')}</Badge>;
}

export const none = <span className="text-zinc-500 dark:text-zinc-400">—</span>;

/** "2 of 7 runs" style counts; wording avoids implying a rate from tiny samples. */
export const outOf = (n: number, runs: number, t: T = tEn) => t('{n} of {runs} runs', { n, runs });

export function Discovery({ s }: { s: AgentStatus }) {
  const t = useT();
  return s.discovery === 'pass' ? (
    <Status kind="ok">{t('Listed')}</Status>
  ) : s.discovery === 'fail' ? (
    <Status kind="bad">{t('Not listed')}</Status>
  ) : (
    <Status kind="none">{t('Untested')}</Status>
  );
}

export function Explicit({ s }: { s: AgentStatus }) {
  const t = useT();
  switch (s.explicit) {
    case 'verified':
      return <Status kind="ok">{t('Verified')}</Status>;
    case 'partial':
      return <Status kind="warn">{t('Partial')}</Status>;
    case 'failed':
      return <Status kind="bad">{t('Failed')}</Status>;
    default:
      return <Status kind="none">{t('Untested')}</Status>;
  }
}

export function Natural({ s }: { s: AgentStatus }) {
  const t = useT();
  if (!s.natural) return <Status kind="none">{t('Not tested')}</Status>;
  const { invoked, runs } = s.natural;
  return (
    <Status kind={invoked === 0 ? 'none' : invoked === runs ? 'ok' : 'warn'}>
      {invoked === 0 ? t('Not observed') : t('Observed')} · {outOf(invoked, runs, t)}
    </Status>
  );
}

/** Behavior is judged separately from invocation and never implies the skill was loaded. */
export function Behavior({ s }: { s: AgentStatus }) {
  const t = useT();
  if (!s.behavior) return <Status kind="none">{t('Not measured')}</Status>;
  const { passed, runs } = s.behavior;
  return (
    <span>
      {t('{counts} passed', { counts: outOf(passed, runs, t) })}
      {s.control && (
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {t('control (no skill): {counts} passed', {
            counts: outOf(s.control.passed, s.control.runs, t),
          })}
        </span>
      )}
    </span>
  );
}

/** One-line, plain-text status for compact lists. */
export function AgentLine({ s }: { s: AgentStatus }) {
  const t = useT();
  const explicit =
    s.explicit === 'verified'
      ? t('explicit run verified')
      : s.explicit === 'untested'
        ? t('explicit run untested')
        : s.explicit === 'partial'
          ? t('explicit run partial')
          : t('explicit run failed');
  const natural = s.natural
    ? t('natural trigger observed in {counts}', {
        counts: outOf(s.natural.invoked, s.natural.runs, t),
      })
    : t('natural trigger not tested');
  return (
    <span>
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{agentName(s.agent)}</span>:{' '}
      {explicit}; {natural}
      {s.staleRecords > 0 && ` (${t('{n} stale record(s) ignored', { n: s.staleRecords })})`}
    </span>
  );
}

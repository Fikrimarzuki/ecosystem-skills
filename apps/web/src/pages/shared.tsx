import type { AgentStatus, Skill } from '../lib.ts';
import {
  agentName,
  distributionLabel,
  distributionOf,
  ORIGIN_LABEL,
  ownershipLabel,
  ownershipOf,
  stage,
  STAGE_LABEL,
  type Stage,
} from '../lib.ts';
import { tEn, useT, type T } from '../i18n.tsx';
import type { ReactNode } from 'react';
import { Badge, ExternalIcon, Field, Status, type Tone } from '../ui.tsx';

/** The visible text of a source link ("github.com/owner/repo"), so people can see where it goes before opening it. */
export const linkText = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * A URL as readable text with a line-break opportunity after each "/", so long repository addresses wrap between
 * path segments instead of in the middle of a name (the text and the link target are unchanged).
 */
export function UrlText({ url }: { url: string }) {
  const parts = linkText(url).split('/');
  // One element (it is often a flex item, and separate items would gain gaps), with <wbr> after each slash.
  return (
    <span>
      {parts.flatMap((p, i) => (i < parts.length - 1 ? [`${p}/`, <wbr key={i} />] : [p]))}
    </span>
  );
}

/**
 * ES28.2 record summary, directly under a detail page's title: the verified source one click away (a labelled
 * button that shows the address) beside the facts people check first. Plain text and links only, never collapsed.
 */
export function RecordSummary({
  source,
  facts,
}: {
  source?: { url: string; label: string; name: string };
  facts: { label: string; value: ReactNode }[];
}) {
  const t = useT();
  return (
    <div className="surface mb-8 grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((f) => (
          <Field key={f.label} label={f.label}>
            {f.value}
          </Field>
        ))}
      </dl>
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          data-record-source=""
          className="btn-primary cw-pointer max-w-full justify-self-start text-left lg:max-w-[22rem]"
        >
          <span className="min-w-0">
            <span className="block text-xs font-normal">{source.label}</span>
            <span className="block [overflow-wrap:anywhere]">
              <UrlText url={source.url} />
            </span>
          </span>
          <ExternalIcon width={16} height={16} className="shrink-0" />
          <span className="sr-only">
            {' '}
            {t('{name} (opens in a new tab)', { name: source.name })}
          </span>
        </a>
      )}
    </div>
  );
}

export const stageTone: Record<Stage, Tone> = {
  'first-party': 'signal',
  discovered: 'amber',
  reviewed: 'amber',
  approved: 'green',
  rejected: 'red',
};

export function StageBadge({ skill }: { skill: Skill }) {
  const t = useT();
  return (
    <>
      <Badge tone={stageTone[stage(skill)]}>{t(STAGE_LABEL[stage(skill)])}</Badge>
      {/* ES27: a partial audit is never shown as a finished review, in lists as on the detail page. */}
      {skill.review.audit?.completeness === 'partial' && (
        <Badge tone="amber">{t('Review incomplete')}</Badge>
      )}
    </>
  );
}

export function SourceBadge({ skill }: { skill: Skill }) {
  const t = useT();
  return <Badge tone="neutral">{t(ORIGIN_LABEL[skill.origin]!)}</Badge>;
}

/** Shown only for FM Ecosystem skills: other ownership is already said by the source badge. */
export function OwnershipBadge({ skill }: { skill: Skill }) {
  const t = useT();
  if (ownershipOf(skill) !== 'fm-ecosystem') return null;
  return <Badge tone="signal">{ownershipLabel(skill, t)}</Badge>;
}

/** Shown only when managed installation is not open. */
export function DistributionBadge({ skill }: { skill: Skill }) {
  const t = useT();
  if (distributionOf(skill).policy === 'open') return null;
  return <Badge tone="amber">{distributionLabel(skill, t)}</Badge>;
}

export function StaleBadge() {
  const t = useT();
  return <Badge tone="amber">{t('stale: revision changed')}</Badge>;
}

export const none = <span className="text-(--cw-muted)">—</span>;

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
        <span className="block text-xs text-(--cw-muted)">
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
      <span className="font-bold text-(--cw-ink)">{agentName(s.agent)}</span>: {explicit}; {natural}
      {s.staleRecords > 0 && ` (${t('{n} stale record(s) ignored', { n: s.staleRecords })})`}
    </span>
  );
}

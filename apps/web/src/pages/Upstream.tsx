import { useT } from '../i18n.tsx';
import {
  availabilityOf,
  UPDATE_STATUS_LABEL,
  upstreamLinks,
  type Catalog,
  type Skill,
} from '../lib.ts';
import { Badge, Card, ExternalLink, Field, Section, type Tone } from '../ui.tsx';

const tone: Record<string, Tone> = {
  'up-to-date': 'green',
  'update-available': 'amber',
  'review-required': 'amber',
  'source-unavailable': 'red',
  'check-failed': 'red',
  'never-checked': 'neutral',
};

/** Upstream update status (ES20). Checks are manual; "never checked" makes no claim. */
export function Upstream({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  if (skill.source.type !== 'external') return null;
  const c = catalog.updates.find((u) => u.skill === skill.id);
  const status = c?.status ?? 'never-checked';
  const pin = skill.source.revision;
  const a = availabilityOf(catalog, skill);
  const latestLinks = c?.latestRevision
    ? upstreamLinks(skill, { revision: c.latestRevision, path: skill.source.path })
    : {};
  return (
    <Section
      id="upstream"
      title={t('Upstream updates')}
      hint={t(
        'Checks are run by hand. The check time is when this repository looked, not when upstream changed.',
      )}
    >
      <Card>
        <Badge tone={tone[status] ?? 'neutral'}>{t(UPDATE_STATUS_LABEL[status] ?? status)}</Badge>
        {!c && (
          <p className="mt-2 text-sm">
            {t('Never checked. No claim is made about whether the original source has changed.')}
          </p>
        )}
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('Tracked upstream revision')}>
            <code className="break-all">{pin}</code>
          </Field>
          <Field label={t('Current curated version')}>
            {a.release ? `v${a.release.version}` : t('None (source reference only)')}
          </Field>
          {c && (
            <>
              <Field label={t('Last checked')}>
                {c.checkedAt.replace('T', ' ').slice(0, 16)} UTC
              </Field>
              <Field label={t('Available upstream revision')}>
                {c.latestRevision ? (
                  latestLinks.commit ? (
                    <ExternalLink href={latestLinks.commit}>
                      <code>{c.latestRevision.slice(0, 12)}</code>
                    </ExternalLink>
                  ) : (
                    <code>{c.latestRevision}</code>
                  )
                ) : (
                  t('unknown')
                )}
                {c.latestCommitDate && (
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {t('Committed upstream on {date}', { date: c.latestCommitDate })}
                  </span>
                )}
              </Field>
            </>
          )}
        </dl>
        {c && <p className="mt-3 text-sm">{c.detail}</p>}
        {c && c.pinnedRevision !== pin && (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            {t('This check was made against an older pin; check again.')}
          </p>
        )}
        {(status === 'review-required' || status === 'update-available') && (
          <p className="mt-3 text-sm font-medium">
            {t(
              'A newer upstream folder exists. Nothing changes automatically: a new version must be prepared, reviewed and approved before anyone uses it.',
            )}
          </p>
        )}
        {c?.changes && (
          <div className="mt-3 text-sm">
            <p>
              {t('Changed files: {n} added, {m} changed, {r} removed', {
                n: c.changes.added.length,
                m: c.changes.changed.length,
                r: c.changes.removed.length,
              })}
              {c.changes.kinds.instructions ? ` · ${t('SKILL.md changed')}` : ''}
            </p>
            {c.changes.securitySensitive.length > 0 && (
              <ul className="mt-1 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                {c.changes.securitySensitive.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}

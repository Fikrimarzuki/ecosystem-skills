import { useT } from '../i18n.tsx';
import {
  agentName,
  distributionLabel,
  distributionOf,
  ownershipLabel,
  ownershipOf,
  RELEASE_APPROVAL_LABEL,
  relatedProjects,
  releasesOf,
  reviewSummary,
  type Catalog,
  type Skill,
} from '../lib.ts';
import { Badge, Card, Field, Section } from '../ui.tsx';
import { none } from './shared.tsx';

/**
 * Ownership and distribution (ES25): who maintains the skill and how it may be installed, as separate facts. This is
 * a description of the registry, not a control: the site has no install action, and every rule is enforced by the
 * command-line installer, which checks a private authorization this site never sees.
 */
export function Distribution({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const d = distributionOf(skill);
  const releases = releasesOf(catalog.releases, skill.id);
  const projects = relatedProjects(catalog, skill);
  const authorization =
    d.policy === 'not-distributable'
      ? t('None possible: it is never installed.')
      : d.policy === 'restricted'
        ? d.access === 'owner-only'
          ? t(
              'An explicit private authorization for the project, version and agent, for projects the owner controls only.',
            )
          : t('An explicit private authorization for the project, version and agent.')
        : skill.origin === 'external'
          ? t('None beyond the owner’s approval of the release or revision.')
          : t('None: first-party skills are linked from this repository.');
  return (
    <Section
      id="distribution"
      title={t('Ownership and distribution')}
      hint={t(
        'Separate facts: who maintains a skill, who can see it, and how it may be installed. None of them implies the others.',
      )}
    >
      {d.policy === 'restricted' && ownershipOf(skill) === 'fm-ecosystem' && (
        <Card className="mb-3 border-amber-300 dark:border-amber-800">
          <p className="text-sm font-medium">
            {t(
              'This skill is developed for FM Ecosystem projects. Managed installation is restricted to authorized consumers.',
            )}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t(
              'Its instructions are public: anyone can read or copy them. The restriction applies to installation through the Ecosystem Skills command line, which checks a private authorization. This site has no install action and enforces nothing.',
            )}
          </p>
        </Card>
      )}
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Maintained by')}>
            {ownershipLabel(skill, t)}
            {!skill.ownership && (
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {t('Not declared; derived from the source.')}
              </span>
            )}
          </Field>
          <Field label={t('Visibility')}>{t('Public')}</Field>
          <Field label={t('Distribution')}>
            <Badge tone={d.policy === 'open' ? 'neutral' : 'amber'}>
              {distributionLabel(skill, t)}
            </Badge>
            {d.note && (
              <span className="mt-1 block text-zinc-600 dark:text-zinc-400">{d.note}</span>
            )}
          </Field>
          <Field label={t('Required authorization')}>{authorization}</Field>
          <Field label={t('Review and approval')}>{reviewSummary(catalog, skill, t)}</Field>
          <Field label={t('Curated releases')}>
            {releases.length ? (
              <ul className="space-y-0.5">
                {releases.map((r) => (
                  <li key={r.version}>
                    {r.version} · {t(RELEASE_APPROVAL_LABEL[r.approval.status])}
                  </li>
                ))}
              </ul>
            ) : (
              t('No curated release yet.')
            )}
          </Field>
          <Field label={t('Installation status')}>
            {d.policy === 'restricted'
              ? t('Not published: restricted installs are recorded on the owner’s machine only.')
              : d.policy === 'not-distributable'
                ? t('Never installed.')
                : t('Not tracked here: installs are per machine.')}
          </Field>
          <Field label={t('Supported agents')}>
            {skill.agents.length
              ? skill.agents.map(agentName).join(', ')
              : t('Not declared; not yet tested with an agent.')}
          </Field>
          <Field label={t('Ecosystem projects')}>
            {projects.length ? (
              <span className="flex flex-wrap gap-1">
                {projects.map((c) => (
                  <Badge key={c.id}>{c.name}</Badge>
                ))}
              </span>
            ) : (
              none
            )}
          </Field>
        </dl>
      </Card>
    </Section>
  );
}

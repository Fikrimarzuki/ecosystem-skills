import { useT } from '../i18n.tsx';
import {
  agentName,
  distributionLabel,
  distributionOf,
  ecosystemSkills,
  ownershipLabel,
  pageHref,
  relatedProjects,
  releasesOf,
  skillHref,
  skillsHref,
  reviewSummary,
  type Catalog,
  type Skill,
} from '../lib.ts';
import { Badge, Empty, Field, PageHeader, Section } from '../ui.tsx';
import { none } from './shared.tsx';

/**
 * FM Ecosystem skills (ES25): skills the owner builds for their own projects. The list is the canonical catalog
 * filtered by explicit ownership, exactly as the Skills page filters it; nothing here is a separate registry, and every
 * status shown is read from the registry rather than written into the page.
 */
export function Ecosystem({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const skills = ecosystemSkills(catalog);
  return (
    <>
      <PageHeader
        title={t('FM Ecosystem skills')}
        subtitle={t(
          'Skills developed specifically for FM Ecosystem projects: the owner’s own applications, sites and the shared sources behind them.',
        )}
      />
      <Section id="about" title={t('What this means')}>
        <ul className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="surface p-4">
            <p className="font-medium">{t('Public to read')}</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {t(
                'Their instructions are published like every other skill here. Anyone can read or copy them; they contain no secrets, private paths or private asset data.',
              )}
            </p>
          </li>
          <li className="surface p-4">
            <p className="font-medium">{t('Restricted to install')}</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {t(
                'Managed installation is limited to projects the owner controls, through the Ecosystem Skills command line, which checks a private authorization for each project, version and agent.',
              )}
            </p>
          </li>
          <li className="surface p-4">
            <p className="font-medium">{t('Not approved by default')}</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {t(
                'Being first-party grants nothing: each release still needs a security review and an owner approval before anything can be installed.',
              )}
            </p>
          </li>
        </ul>
      </Section>
      <Section
        id="fm-skills"
        title={t('Skills')}
        hint={t('From the same catalog as the Skills page. Open a skill for its full record.')}
      >
        {skills.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {skills.map((s) => (
              <EcosystemCard key={s.id} catalog={catalog} skill={s} />
            ))}
          </ul>
        ) : (
          <Empty title={t('No FM Ecosystem skills are registered.')}>{null}</Empty>
        )}
        <p className="mt-4 text-sm">
          <a href={skillsHref({ owner: 'fm-ecosystem' })} className="underline underline-offset-2">
            {t('Show them in the skill library')}
          </a>
          {' · '}
          <a href={pageHref('integrations')} className="underline underline-offset-2">
            {t('Agents & tools')}
          </a>
        </p>
      </Section>
    </>
  );
}

function EcosystemCard({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const integrations = skill.requires
    .map((r) => catalog.integrations.find((i) => i.id === r))
    .filter((i) => !!i);
  const projects = relatedProjects(catalog, skill);
  const releases = releasesOf(catalog.releases, skill.id);
  const approved = releases.filter((r) => r.approval.status === 'approved');
  const d = distributionOf(skill);
  return (
    <li className="surface flex min-w-0 flex-col p-4">
      <h3 className="text-base font-semibold tracking-tight">
        <a href={skillHref(skill.id)} className="underline-offset-2 hover:underline">
          {skill.name}
        </a>
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="indigo">{ownershipLabel(skill, t)}</Badge>
        <Badge>{t('Public')}</Badge>
        <Badge tone={d.policy === 'open' ? 'neutral' : 'amber'}>
          {distributionLabel(skill, t)}
        </Badge>
        <Badge tone="amber">{reviewSummary(catalog, skill, t)}</Badge>
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{skill.description}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t('Integrations')}>
          {integrations.length ? integrations.map((i) => i.name).join(', ') : none}
        </Field>
        <Field label={t('Related projects')}>
          {projects.length ? projects.map((c) => c.name).join(', ') : none}
        </Field>
        <Field label={t('Installation')}>
          {d.policy === 'restricted'
            ? d.access === 'owner-only'
              ? t('Owner-only, through the managed command line.')
              : t('Authorized projects only, through the managed command line.')
            : d.policy === 'not-distributable'
              ? t('Never installed.')
              : t('Open, under the approval and security rules.')}
        </Field>
        <Field label={t('Releases and review')}>
          {releases.length
            ? t('{n} release(s), {approved} approved', {
                n: releases.length,
                approved: approved.length,
              })
            : t('No curated release yet; nothing can be installed.')}
        </Field>
        <Field label={t('Agent compatibility')}>
          {skill.agents.length
            ? skill.agents.map(agentName).join(', ')
            : t('Standard SKILL.md; not yet tested with an agent.')}
        </Field>
      </dl>
      <p className="mt-auto pt-3 text-sm">
        <a href={skillHref(skill.id)} className="underline underline-offset-2">
          {t('Details for {name}', { name: skill.name })}
        </a>
      </p>
    </li>
  );
}

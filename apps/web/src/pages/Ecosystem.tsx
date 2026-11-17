import { GlyphSlot } from '../art.tsx';
import { useT } from '../i18n.tsx';
import { REPO_URL } from '../links.ts';
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
import { Badge, Empty, ExternalLink, Field, PageHeader, Section, Window } from '../ui.tsx';
import { none, UrlText } from './shared.tsx';

/**
 * FM Ecosystem skills (ES25): skills the owner builds for their own projects. The list is the canonical catalog
 * filtered by explicit ownership, exactly as the Skills page filters it; nothing here is a separate registry, and every
 * status shown is read from the registry rather than written into the page.
 *
 * ES28.3 "Guild registry": the guild's own records. Being listed here is membership, not a key: nothing is shown as
 * unlocked, equipped or installed, and the page says first that public to read is not public to install.
 */
export function Ecosystem({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const skills = ecosystemSkills(catalog);
  return (
    <>
      <PageHeader
        kicker={{ text: t('Guild registry'), glyph: 'banner' }}
        title={t('FM Ecosystem skills')}
        subtitle={t(
          'Skills developed specifically for FM Ecosystem projects: the owner’s own applications, sites and the shared sources behind them.',
        )}
      />
      <Window id="about" title={t('What this means')} className="mb-10">
        <p className="max-w-3xl text-base font-bold">
          {t(
            'Public to read does not mean public to install. Anyone can read these skills; only projects the owner controls can install them, each with its own authorization.',
          )}
        </p>
        <ul className="mt-4 grid gap-x-6 gap-y-4 text-sm md:grid-cols-3">
          <li className="border-t-2 border-dashed border-(--cw-rule) pt-3">
            <p className="font-bold">{t('Public to read')}</p>
            <p className="mt-1 text-(--cw-muted)">
              {t(
                'Their instructions are published like every other skill here. Anyone can read or copy them; they contain no secrets, private paths or private asset data.',
              )}
            </p>
          </li>
          <li className="border-t-2 border-dashed border-(--cw-rule) pt-3">
            <p className="font-bold">{t('Restricted to install')}</p>
            <p className="mt-1 text-(--cw-muted)">
              {t(
                'Managed installation is limited to projects the owner controls, through the Ecosystem Skills command line, which checks a private authorization for each project, version and agent.',
              )}
            </p>
          </li>
          <li className="border-t-2 border-dashed border-(--cw-rule) pt-3">
            <p className="font-bold">{t('Not approved by default')}</p>
            <p className="mt-1 text-(--cw-muted)">
              {t(
                'Being first-party grants nothing: each release still needs a security review and an owner approval before anything can be installed.',
              )}
            </p>
          </li>
        </ul>
      </Window>
      <Section
        id="fm-skills"
        title={t('Skills')}
        hint={t('From the same catalog as the Skills page. Open a skill for its full record.')}
      >
        {skills.length ? (
          <ul className="grid gap-5 lg:grid-cols-2">
            {skills.map((s) => (
              <EcosystemCard key={s.id} catalog={catalog} skill={s} />
            ))}
          </ul>
        ) : (
          <Empty title={t('No FM Ecosystem skills are registered.')}>{null}</Empty>
        )}
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a
            href={skillsHref({ owner: 'fm-ecosystem' })}
            className="inline-flex min-h-10 items-center underline underline-offset-2"
          >
            {t('Show them in the skill library')}
          </a>
          <a
            href={pageHref('integrations')}
            className="inline-flex min-h-10 items-center underline underline-offset-2"
          >
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
  // First-party skills live in this public repository; the folder is the original source.
  const folder =
    skill.source.type === 'first-party' ? `${REPO_URL}/tree/main/${skill.source.path}` : undefined;
  const repos = integrations.filter((i) => i.repository);
  return (
    <li className="flex min-w-0">
      {/* The same frame for every FM Ecosystem skill, whatever its distribution or review. */}
      <article className="surface flex w-full min-w-0 flex-col p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <GlyphSlot name="banner" />
          <div className="min-w-0">
            <h3 className="text-base font-bold [overflow-wrap:anywhere]">
              <a href={skillHref(skill.id)} className="underline-offset-2 hover:underline">
                {skill.name}
              </a>
            </h3>
            {skill.source.type === 'first-party' && (
              <p className="text-xs text-(--cw-muted)">
                <code className="[overflow-wrap:anywhere]">{skill.source.path}</code>
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="signal">{ownershipLabel(skill, t)}</Badge>
          <Badge>{t('Public')}</Badge>
          <Badge tone={d.policy === 'open' ? 'neutral' : 'amber'}>
            {distributionLabel(skill, t)}
          </Badge>
          <Badge tone="amber">{reviewSummary(catalog, skill, t)}</Badge>
        </div>
        <p className="mt-3 text-sm text-(--cw-muted)">{skill.description}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
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
          <Field label={t('Integrations')}>
            {integrations.length ? integrations.map((i) => i.name).join(', ') : none}
          </Field>
          <Field label={t('Related projects')}>
            {projects.length ? projects.map((c) => c.name).join(', ') : none}
          </Field>
          <Field label={t('Agent compatibility')}>
            {skill.agents.length
              ? skill.agents.map(agentName).join(', ')
              : t('Standard SKILL.md; not yet tested with an agent.')}
          </Field>
        </dl>
        <div className="mt-auto pt-4" />
        <div className="cw-record space-y-2 pt-3 text-sm">
          {folder && (
            <p>
              <span className="block text-xs text-(--cw-muted)">{t('Skill source')}</span>
              <ExternalLink href={folder}>
                <UrlText url={folder} />
              </ExternalLink>
            </p>
          )}
          {repos.map((i) => (
            <p key={i.id}>
              <span className="block text-xs text-(--cw-muted)">
                {t('Shared source: {name}', { name: i.name })}
              </span>
              {i.repository!.url ? (
                <ExternalLink href={i.repository!.url}>
                  <UrlText url={i.repository!.url} />
                </ExternalLink>
              ) : (
                <span>
                  <code>{i.repository!.name}</code>{' '}
                  <span className="text-(--cw-muted)">{t('(private repository; not linked)')}</span>
                </span>
              )}
            </p>
          ))}
          <p>
            <a
              href={skillHref(skill.id)}
              className="inline-flex min-h-10 items-center underline underline-offset-2"
            >
              {t('Details for {name}', { name: skill.name })}
            </a>
          </p>
        </div>
      </article>
    </li>
  );
}

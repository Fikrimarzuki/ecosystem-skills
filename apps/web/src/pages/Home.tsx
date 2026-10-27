import { GATEWAY_URL, REPO_URL, SUPPORT_URL } from '../links.ts';
import { useT } from '../i18n.tsx';
import { pageHref, skillsHref, stage, summarize, type Catalog } from '../lib.ts';
import { SkillCard } from './Skills.tsx';
import {
  ArrowIcon,
  CodeIcon,
  PulseIcon,
  MessageIcon,
  Section,
  ShieldIcon,
  UsersIcon,
} from '../ui.tsx';

export const STATES: readonly [string, string][] = [
  ['Registered', 'Listed in the registry with its source.'],
  ['Reviewed', 'Its content was read and findings were recorded. No decision yet.'],
  ['Approved', 'The owner allows this exact revision.'],
  ['Installed', 'A copy exists on one machine.'],
  ['Assigned', 'A project should have it.'],
  ['Activated', 'The project links it for an agent.'],
  ['Verified', 'A real agent run showed it working.'],
];

/** The three "what is this" cards; exported so the translation test can check every string. */
export const FEATURES = [
  {
    icon: CodeIcon,
    title: 'A registry, not a marketplace',
    body: 'Each skill has an id, a source and, for third-party skills, a pinned revision and content hash. First-party skills live in my repository; third-party ones stay at the exact version that was reviewed.',
  },
  {
    icon: ShieldIcon,
    title: 'Nothing is trusted by default',
    body: 'A third-party skill is read and scanned first. Only the owner can approve it, and approval covers one exact revision. Being approved does not mean being installed or in use.',
  },
  {
    icon: UsersIcon,
    title: 'Which project uses what',
    body: 'Consumers are the projects and agent setups that should have a skill. The site shows that assignment and what is recorded about it, per agent.',
  },
] as const;

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <a href={href} className="surface surface-hover block p-4">
        <span className="block text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      </a>
    </li>
  );
}

/**
 * The landing page: what this site is for, in plain words, before any data. It does not need the catalog to
 * render; the live numbers appear once it has loaded and are replaced by a short note if it cannot.
 */
export function Home({ catalog, error }: { catalog?: Catalog; error?: string }) {
  const t = useT();
  const s = catalog ? summarize(catalog) : undefined;
  // A real entry from the registry (never invented): the first approved skill that has recorded agent runs.
  const featured = catalog?.skills.find(
    (k) => stage(k) === 'approved' && catalog.evidence.some((e) => e.skill === k.id),
  );
  return (
    <>
      <section aria-labelledby="hero-h" className="pt-2 pb-10 sm:pt-8 sm:pb-14">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-400/30 dark:bg-zinc-900/60 dark:text-indigo-200">
              <ShieldIcon width={14} height={14} />
              {t('A personal registry for AI-agent skills')}
            </p>
            <h1
              id="hero-h"
              className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
            >
              <span className="gradient-text">
                {t('One place to manage the skills your AI agents use')}
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              {t(
                'Ecosystem Skills tracks every reusable skill that Claude Code and Codex use across my projects: where it came from, whether it was reviewed and approved, which project uses it, and what real agent runs have shown.',
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={pageHref('skills')} className="btn-primary">
                {t('Browse skills')} <ArrowIcon width={16} height={16} />
              </a>
              <a href={pageHref('overview')} className="btn-secondary">
                {t('See the overview')}
              </a>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary"
              >
                <MessageIcon width={16} height={16} />
                {t('Get in touch')}
                <span className="sr-only"> {t('(opens in a new tab)')}</span>
              </a>
            </div>
          </div>
          {featured && catalog && (
            <div className="hidden lg:block">
              <p className="mb-2 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
                {t('A real entry from the registry')}
              </p>
              <ul>
                <SkillCard catalog={catalog} skill={featured} />
              </ul>
            </div>
          )}
        </div>

        <div className="mt-8" aria-live="polite">
          {s ? (
            <ul
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
              aria-label={t('The registry in numbers')}
            >
              <Stat label={t('Registered skills')} value={s.skills} href={skillsHref({})} />
              <Stat
                label={t('Approved third-party skills')}
                value={s.approved}
                href={skillsHref({ status: 'approved' })}
              />
              <Stat
                label={t('Consumer projects')}
                value={s.consumers}
                href={pageHref('consumers')}
              />
              <Stat
                label={t('Agent evidence records')}
                value={s.evidence}
                href={pageHref('overview')}
              />
            </ul>
          ) : error ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {t(
                'The live numbers could not be loaded ({error}). The rest of this page still applies.',
                {
                  error,
                },
              )}
            </p>
          ) : (
            <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('Loading catalog…')}
            </p>
          )}
        </div>
      </section>

      <Section
        id="about"
        title={t('What is this website?')}
        hint={t(
          'A read-only window onto one registry file set. Everything shown here comes from it.',
        )}
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="surface p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Icon width={18} height={18} />
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{t(title)}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t(body)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="lifecycle"
        title={t('How a skill is tracked')}
        hint={t(
          'Seven separate facts, not steps in a progress bar. Each one can be true without the others.',
        )}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {STATES.map(([name, meaning]) => (
            <li key={name} className="surface p-4">
              <h3 className="text-sm font-semibold">{t(name)}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t(meaning)}</p>
            </li>
          ))}
          <li className="surface flex items-center gap-3 p-4">
            <PulseIcon className="shrink-0 text-indigo-600 dark:text-indigo-300" />
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {t(
                'Approved is not installed. Assigned is not activated. Activated is not verified.',
              )}
            </p>
          </li>
        </ul>
      </Section>

      <Section
        id="scope"
        title={t('What this site does and does not do')}
        hint={t('Honest limits, so nothing here is mistaken for more than it is.')}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface p-5">
            <h3 className="text-base font-semibold">{t('It does')}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>{t('Show every registered skill, its source, review and approval status.')}</li>
              <li>{t('Show which projects have a skill assigned, for which agents.')}</li>
              <li>
                {t(
                  'Report real agent runs as counts out of runs, with controls, never as a rating.',
                )}
              </li>
            </ul>
          </div>
          <div className="surface p-5">
            <h3 className="text-base font-semibold">{t('It does not')}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>{t('Install, run or change anything. It is a static, read-only page.')}</li>
              <li>{t('Know what is installed or linked on any machine.')}</li>
              <li>
                {t('Claim that a skill improves results unless a recorded comparison shows it.')}
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <section
        aria-labelledby="gateway-h"
        className="surface mt-12 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 id="gateway-h" className="text-lg font-semibold tracking-tight">
            {t('Explore More Projects')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300">
            {t(
              'Ecosystem Skills is part of my personal development ecosystem. Discover my other projects, games, experiments, and developer tools through Gateway.',
            )}
          </p>
        </div>
        <a
          href={GATEWAY_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-primary shrink-0"
        >
          {t('Explore Gateway')} <ArrowIcon width={16} height={16} />
          <span className="sr-only"> {t('(opens in a new tab)')}</span>
        </a>
      </section>

      <section
        aria-labelledby="support-h"
        className="surface mt-6 flex flex-col items-start gap-4 bg-linear-to-br from-indigo-50 to-fuchsia-50 p-6 sm:flex-row sm:items-center sm:justify-between dark:from-indigo-950/60 dark:to-fuchsia-950/40"
      >
        <div>
          <h2 id="support-h" className="text-lg font-semibold tracking-tight">
            {t('Questions, requests or feedback?')}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-700 dark:text-zinc-300">
            {t(
              'Use the help and contact page to ask a question, request assistance, send feedback or simply get in touch.',
            )}
          </p>
        </div>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-primary shrink-0"
        >
          <MessageIcon width={16} height={16} />
          {t('Open Help & Contact')}
          <span className="sr-only"> {t('(opens in a new tab)')}</span>
        </a>
      </section>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          <CodeIcon width={14} height={14} /> {t('View the source on GitHub')}
          <span className="sr-only"> {t('(opens in a new tab)')}</span>
        </a>
      </p>
    </>
  );
}

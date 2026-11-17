import { GlyphSlot } from '../art.tsx';
import { useT } from '../i18n.tsx';
import '../landing/landing.css';
import { libraryDesktop, libraryMobile } from '../landing/library.tsx';
import { Hero, type PlaceText, type SpotId } from '../landing/stage.tsx';
import { GATEWAY_URL, REPO_URL, SUPPORT_URL } from '../links.ts';
import { groupOf, groupsInUse, pageHref, skillsHref, summarize, type Catalog } from '../lib.ts';
import { CodeIcon, MessageIcon, PulseIcon, Section, ShieldIcon, UsersIcon } from '../ui.tsx';

export const STATES: readonly [string, string][] = [
  ['Registered', 'Listed in the registry with its source.'],
  ['Reviewed', 'Its content was read and findings were recorded. No decision yet.'],
  ['Approved', 'The owner allows this exact revision.'],
  ['Installed', 'A copy exists on one machine.'],
  ['Assigned', 'A project should have it.'],
  ['Activated', 'The project links it for an agent.'],
  ['Verified', 'A real agent run showed it working.'],
];

/** The three "what is this" points; exported so the translation test can check every string. */
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

/** The four corners of the room and the catalog each one opens; exported so the translation test can check them. */
export const PLACES = {
  skills: { name: 'Skill Codex', action: 'Browse skills' },
  resources: { name: 'Tool Workshop', action: 'Explore resources' },
  sources: { name: 'Source Archive', action: 'View sources' },
  ecosystem: { name: 'Guild Registry', action: 'Explore FM Ecosystem skills' },
} as const satisfies Record<SpotId, { name: string; action: string }>;

/** The room is drawn once, when the page module loads; hover, focus and theme are CSS, so it never re-renders. */
const WIDE = libraryDesktop();
const PHONE = libraryMobile();

/** Skill count per browsing group, with the three largest registry categories in each (real data, never invented). */
function categoryMap(c: Catalog) {
  return groupsInUse(c).map((g) => {
    const skills = c.skills.filter((s) => groupOf(s) === g);
    const byCat = new Map<string, number>();
    for (const s of skills) byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1);
    const top = [...byCat]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([cat, n]) => `${cat} ${n}`);
    return { group: g, n: skills.length, top };
  });
}

/**
 * The landing page (ES28.5): the Living Library. The archive room is the hero: four signs in it open Skills,
 * Resources, Sources and FM Ecosystem, and the Archivist works at the lectern. The headline and the three direct
 * actions are ordinary text and links (on the hanging scroll on wide screens, above the room on phones). The page
 * explains itself before any data: counts appear when the catalog has loaded. All art is decorative (aria-hidden);
 * every fact is also plain text. See docs/command-window-design.md, "The landing page".
 */
export function Home({ catalog, error }: { catalog?: Catalog; error?: string }) {
  const t = useT();
  const s = catalog ? summarize(catalog) : undefined;
  const skills = (n: number) => (n === 1 ? t('{n} skill', { n }) : t('{n} skills', { n }));
  const places: Record<SpotId, PlaceText> = {
    skills: { name: t(PLACES.skills.name), count: skills, action: t(PLACES.skills.action) },
    resources: {
      name: t(PLACES.resources.name),
      count: (n) => t('{n} resources', { n }),
      action: t(PLACES.resources.action),
    },
    sources: {
      name: t(PLACES.sources.name),
      count: (n) => t('{n} sources', { n }),
      action: t(PLACES.sources.action),
    },
    ecosystem: {
      name: t(PLACES.ecosystem.name),
      count: skills,
      action: t(PLACES.ecosystem.action),
    },
  };
  const stats = s
    ? [
        { label: t('Registered skills'), value: s.skills, href: skillsHref({}) },
        {
          label: t('Approved third-party skills'),
          value: s.approved,
          href: skillsHref({ status: 'approved' }),
        },
        { label: t('Consumer projects'), value: s.consumers, href: pageHref('consumers') },
        { label: t('Agent evidence records'), value: s.evidence, href: pageHref('overview') },
      ]
    : undefined;
  return (
    <div className="lp-root">
      <Hero
        variant="lp-library"
        wide={WIDE}
        phone={PHONE}
        places={places}
        catalog={catalog}
        error={error}
      />

      {/* The registry in numbers: one ledger strip under the room. Its height is reserved while the catalog loads. */}
      <div className="mt-8 min-h-[9.5rem] sm:min-h-[5.5rem]" aria-live="polite">
        {stats && (
          <ul
            aria-label={t('The registry in numbers')}
            className="surface grid grid-cols-2 sm:grid-cols-4"
          >
            {stats.map((x, i) => (
              <li
                key={x.label}
                className={`min-w-0 ${i % 2 ? 'border-l-2' : ''} ${i > 1 ? 'border-t-2 sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l-2' : ''} border-dashed border-(--cw-rule)`}
              >
                <a
                  href={x.href}
                  className="cw-pointer block px-4 py-3 hover:bg-(--cw-sunken) sm:px-5"
                >
                  <span className="block text-2xl font-bold tabular-nums sm:text-3xl">
                    {x.value}
                  </span>
                  <span className="block text-sm text-(--cw-muted)">{x.label}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* While the catalog loads, the skill tree's space is held (a little under its real height at each width), so
          the sections below do not jump when it arrives. */}
      {!catalog && (
        <div
          aria-hidden="true"
          className="mt-10 min-h-[43rem] min-[360px]:min-h-[37.5rem] md:min-h-[24rem] lg:min-h-[22rem]"
        />
      )}
      {catalog && (
        <Section
          id="tree"
          title={t('Skill tree by category')}
          hint={t(
            'A map of the browsing categories and how many skills each holds. It is not a progression: nothing here is locked or unlocked.',
          )}
        >
          <div className="surface p-4 sm:p-5">
            <a href={skillsHref({})} className="cw-pointer inline-flex items-center gap-3">
              <GlyphSlot name="ledger" />
              <span>
                <span className="block font-bold">{t('All skills')}</span>
                <span className="block text-sm text-(--cw-muted) tabular-nums">
                  {t('{n} skills', { n: catalog.skills.length })}
                </span>
              </span>
            </a>
            <ul className="cw-tree mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
              {categoryMap(catalog).map(({ group, n, top }) => (
                <li key={group}>
                  <a
                    href={skillsHref({ group })}
                    className="cw-pointer flex min-w-0 items-center gap-3 px-2 py-2 hover:bg-(--cw-sunken)"
                  >
                    <GlyphSlot name={group} />
                    <span className="min-w-0">
                      <span className="font-bold">{t(group)}</span>{' '}
                      <span className="text-sm text-(--cw-muted) tabular-nums">{skills(n)}</span>
                      <span className="block text-xs [overflow-wrap:anywhere] text-(--cw-muted)">
                        {top.join(', ')}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* What the site is, how a skill is tracked and the honest limits: one record, not a stack of windows. */}
      <section aria-labelledby="about-h" className="surface mt-12 p-5 sm:p-7">
        <h2 id="about-h" className="text-lg font-bold">
          {t('What is this website?')}
        </h2>
        <p className="mt-1 text-sm text-(--cw-muted)">
          {t('A read-only window onto one registry file set. Everything shown here comes from it.')}
        </p>
        <ul className="mt-5 grid gap-6 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="cw-slot text-(--cw-signal)">
                <Icon width={22} height={22} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold">{t(title)}</h3>
                <p className="mt-1 text-sm text-(--cw-muted)">{t(body)}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="cw-record mt-7 pt-6">
          <h3 id="lifecycle" className="text-base font-bold">
            {t('How a skill is tracked')}
          </h3>
          <p className="mt-1 text-sm text-(--cw-muted)">
            {t(
              'Seven separate facts, not steps in a progress bar. Each one can be true without the others.',
            )}
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {STATES.map(([name, meaning]) => (
              <div key={name} className="min-w-0">
                <dt className="text-sm font-bold">{t(name)}</dt>
                <dd className="text-sm text-(--cw-muted)">{t(meaning)}</dd>
              </div>
            ))}
            <div className="flex items-start gap-2 min-[420px]:col-span-2 lg:col-span-1">
              <PulseIcon className="mt-0.5 shrink-0 text-(--cw-signal)" />
              <p className="text-sm font-bold">
                {t(
                  'Approved is not installed. Assigned is not activated. Activated is not verified.',
                )}
              </p>
            </div>
          </dl>
        </div>

        <div className="cw-record mt-7 pt-6">
          <h3 className="text-base font-bold">{t('What this site does and does not do')}</h3>
          <p className="mt-1 text-sm text-(--cw-muted)">
            {t('Honest limits, so nothing here is mistaken for more than it is.')}
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-bold">{t('It does')}</h4>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li>{t('Show every registered skill, its source, review and approval status.')}</li>
                <li>{t('Show which projects have a skill assigned, for which agents.')}</li>
                <li>
                  {t(
                    'Report real agent runs as counts out of runs, with controls, never as a rating.',
                  )}
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold">{t('It does not')}</h4>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li>{t('Install, run or change anything. It is a static, read-only page.')}</li>
                <li>{t('Know what is installed or linked on any machine.')}</li>
                <li>
                  {t('Claim that a skill improves results unless a recorded comparison shows it.')}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Beyond this catalog: other projects, help and the source code. */}
      <div className="surface mt-8 grid gap-6 p-5 sm:p-7 md:grid-cols-2">
        <section aria-labelledby="gateway-h" className="flex flex-col items-start gap-3">
          <h2 id="gateway-h" className="text-lg font-bold">
            {t('Explore More Projects')}
          </h2>
          <p className="text-sm">
            {t(
              'Ecosystem Skills is part of my personal development ecosystem. Discover my other projects, games, experiments, and developer tools through Gateway.',
            )}
          </p>
          <a
            href={GATEWAY_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-primary cw-pointer mt-auto"
          >
            {t('Explore Gateway')}
            <span className="sr-only"> {t('(opens in a new tab)')}</span>
          </a>
        </section>
        <section
          aria-labelledby="support-h"
          className="flex flex-col items-start gap-3 border-t-2 border-dashed border-(--cw-rule) pt-6 md:border-t-0 md:border-l-2 md:pt-0 md:pl-6"
        >
          <h2 id="support-h" className="text-lg font-bold">
            {t('Questions, requests or feedback?')}
          </h2>
          <p className="text-sm">
            {t(
              'Use the help and contact page to ask a question, request assistance, send feedback or simply get in touch.',
            )}
          </p>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-secondary cw-pointer mt-auto"
          >
            <MessageIcon width={16} height={16} />
            {t('Open Help & Contact')}
            <span className="sr-only"> {t('(opens in a new tab)')}</span>
          </a>
        </section>
      </div>

      <p className="mt-6 text-sm">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-10 items-center gap-1 underline underline-offset-2"
        >
          <CodeIcon width={14} height={14} /> {t('View the source on GitHub')}
          <span className="sr-only"> {t('(opens in a new tab)')}</span>
        </a>
      </p>
    </div>
  );
}

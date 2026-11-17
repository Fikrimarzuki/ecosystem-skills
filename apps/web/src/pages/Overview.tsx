import { GlyphSlot, type GlyphName } from '../art.tsx';
import { useT } from '../i18n.tsx';
import {
  agentName,
  agentOverview,
  ecosystemSkills,
  recentEvidence,
  pageHref,
  skillHref,
  skillsHref,
  summarize,
  type Catalog,
} from '../lib.ts';
import { ArrowIcon, Badge, Empty, PageHeader, Window } from '../ui.tsx';
import { outOf } from './shared.tsx';

/**
 * ES28.3 Overview ("Adventurer's dashboard"): the registry's real state in Command Windows. Every number is computed
 * from the catalog; nothing is a score, a level or progress. Review counts are four equal facts, never a bar.
 */

/** A catalog tile: glyph slot, count, label and an optional note; the whole tile is one link. */
function Tile({
  glyph,
  label,
  value,
  note,
  href,
}: {
  glyph: GlyphName;
  label: string;
  value: number;
  note?: string;
  href: string;
}) {
  return (
    <li className="flex min-w-0">
      {/* Inside the Registry window, so a sunken slot rather than a second frame; hover and focus mark it in signal. */}
      <a
        href={href}
        className="cw-pointer flex w-full min-w-0 items-start gap-3 bg-(--cw-sunken) p-3 hover:shadow-[inset_0_0_0_2px_var(--cw-signal)] sm:p-4"
      >
        <GlyphSlot name={glyph} className="bg-(--cw-window)!" />
        <span className="min-w-0">
          <span className="block text-3xl leading-tight font-bold tabular-nums">{value}</span>
          <span className="block font-bold [overflow-wrap:anywhere]">{label}</span>
          {note && <span className="mt-0.5 block text-xs text-(--cw-muted)">{note}</span>}
        </span>
      </a>
    </li>
  );
}

/** One counted fact in a window: label (and note) on the left, the count on the right, the row is a link. */
function CountRow({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number;
  note?: string;
  href: string;
}) {
  return (
    <li className="border-b-2 border-dashed border-(--cw-rule) last:border-b-0">
      <a
        href={href}
        className="cw-pointer flex min-h-11 items-center justify-between gap-4 px-2 py-2 hover:bg-(--cw-sunken)"
      >
        <span className="min-w-0">
          <span className="block font-bold underline-offset-2 [overflow-wrap:anywhere]">
            {label}
          </span>
          {note && <span className="block text-xs text-(--cw-muted)">{note}</span>}
        </span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </a>
    </li>
  );
}

const hint = 'mb-3 text-sm text-(--cw-muted)';

export function Overview({ catalog }: { catalog: Catalog }) {
  const t = useT();
  const s = summarize(catalog);
  const agents = agentOverview(catalog);
  const recent = recentEvidence(catalog, 6);
  const fm = ecosystemSkills(catalog).length;
  const skillName = (id: string) => catalog.skills.find((x) => x.id === id)?.name ?? id;
  const kicker = { text: t('Adventurer’s dashboard'), glyph: 'ledger' as const };

  if (s.skills === 0)
    return (
      <>
        <PageHeader
          kicker={kicker}
          title={t('Overview')}
          subtitle={t('Skills, consumers and agent evidence in this ecosystem.')}
        />
        <Empty title={t('No skills registered yet')}>
          {t('Add entries to registry/skills.json and rebuild the site.')}
        </Empty>
      </>
    );

  return (
    <>
      <PageHeader
        kicker={kicker}
        title={t('Overview')}
        subtitle={t(
          'Skills, consumers and agent evidence registered in this ecosystem. This site is a read-only view of the registry; it cannot install or run anything.',
        )}
      />

      <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
        <Window title={t('Registry')} id="registry" className="lg:col-span-2">
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              glyph="ledger"
              label={t('Registered skills')}
              value={s.skills}
              note={t('{first} first-party · {third} third-party', {
                first: s.firstParty,
                third: s.external,
              })}
              href={skillsHref({})}
            />
            <Tile
              glyph="satchel"
              label={t('Resources')}
              value={catalog.resources.length}
              note={t('MCP servers, toolkits and references; not skills')}
              href={pageHref('resources')}
            />
            <Tile
              glyph="shelf"
              label={t('Sources')}
              value={catalog.sources.length}
              note={t('Repositories examined during discovery')}
              href={pageHref('sources')}
            />
            <Tile
              glyph="house"
              label={t('Consumers')}
              value={s.consumers}
              note={t('{n} with assignments', { n: s.consumersWithAssignments })}
              href={pageHref('consumers')}
            />
          </ul>
        </Window>

        <Window title={t('Skills by origin')} id="origin">
          <p className={hint}>{t('Where each registered skill comes from.')}</p>
          <ul>
            <CountRow
              label={t('First-party')}
              value={s.firstParty}
              note={t('Written in this repository')}
              href={skillsHref({ origin: 'first-party' })}
            />
            <CountRow
              label={t('FM Ecosystem')}
              value={fm}
              note={t('Part of the first-party count; public to read, restricted to install')}
              href={pageHref('ecosystem')}
            />
            <CountRow
              label={t('Third-party')}
              value={s.external}
              note={t('{approved} approved · {reviewed} reviewed', {
                approved: s.approved,
                reviewed: s.reviewed,
              })}
              href={skillsHref({ origin: 'external' })}
            />
          </ul>
        </Window>

        <Window title={t('Third-party review status')} id="pipeline">
          <p className={hint}>
            {t(
              'Each third-party skill is in exactly one of these. Approval is not installation: installs are local to each machine and not part of this catalog. Verification is per agent (below).',
            )}
          </p>
          <ul>
            {(
              [
                [t('Discovered'), s.discovered, 'discovered'],
                [t('Reviewed'), s.reviewed, 'reviewed'],
                [t('Approved'), s.approved, 'approved'],
                [t('Rejected'), s.rejected, 'rejected'],
              ] as const
            ).map(([label, n, status]) => (
              <CountRow key={status} label={label} value={n} href={skillsHref({ status })} />
            ))}
          </ul>
        </Window>

        <Window title={t('Agent evidence')} id="agents">
          <p className={hint}>
            {t(
              'What real agent runs have shown. Counts only: small samples, one machine. Natural triggering is probabilistic.',
            )}
          </p>
          <ul className="grid gap-4">
            {agents.map((a) => (
              <li key={a.agent} className="bg-(--cw-sunken) p-3">
                <h3 className="flex items-center gap-3 font-bold">
                  <GlyphSlot name="terminal" className="bg-(--cw-window)!" />
                  {agentName(a.agent)}
                </h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-(--cw-muted)">{t('Skills verified by explicit run')}</dt>
                    <dd className="font-bold tabular-nums">{a.explicitSkills}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-(--cw-muted)">{t('Natural triggering')}</dt>
                    <dd className="text-right font-bold">
                      {a.natural
                        ? t('loaded in {counts}', {
                            counts: outOf(a.natural.invoked, a.natural.runs, t),
                          })
                        : t('not tested')}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-(--cw-muted)">{t('Behavior in trials')}</dt>
                    <dd className="text-right font-bold">
                      {a.behavior
                        ? t('{counts} passed', {
                            counts: outOf(a.behavior.passed, a.behavior.runs, t),
                          })
                        : t('not measured')}
                      {a.control && (
                        <span className="block text-xs font-normal text-(--cw-muted)">
                          {t('controls: {counts} passed', {
                            counts: outOf(a.control.passed, a.control.runs, t),
                          })}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <a
              href={pageHref('integrations')}
              className="inline-flex min-h-10 items-center gap-1 underline underline-offset-2"
            >
              {t('How agent evidence is classified')} <ArrowIcon width={14} height={14} />
            </a>
          </p>
        </Window>

        <Window title={t('Recent evidence')} id="recent">
          <p className={hint}>
            {t('Latest recorded agent runs. Open a skill for the full trial table.')}
          </p>
          {recent.length === 0 ? (
            <p className="text-sm font-bold">{t('No agent runs recorded yet')}</p>
          ) : (
            <ul>
              {recent.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b-2 border-dashed border-(--cw-rule) py-2.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0">
                    <a
                      href={skillHref(e.skill)}
                      className="font-bold underline underline-offset-2 [overflow-wrap:anywhere]"
                    >
                      {skillName(e.skill)}
                    </a>
                    <span className="block text-(--cw-muted)">
                      {t('on {agent}', { agent: agentName(e.agent) })} ·{' '}
                      {t(e.trigger ?? 'explicit')}
                      {e.scenario ? ` ${e.scenario.toUpperCase()}` : ''} · {e.date}
                    </span>
                  </span>
                  <Badge
                    tone={
                      e.result === 'verified' ? 'green' : e.result === 'partial' ? 'amber' : 'red'
                    }
                  >
                    {t(e.result)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Window>

        <Window title={t('Private skills')} id="private" className="lg:col-span-2">
          <p className={hint}>{t('Supported on the owner’s machine; never part of this site.')}</p>
          <p className="max-w-4xl text-sm">
            {t(
              'Ecosystem Skills also manages private skills. They live in a separate private location, not in this public registry, so this site contains no trace of them: no names, descriptions, sources or counts. A private skill still needs a security review of its exact content, an owner approval, and an explicit authorization for each project, version and agent before it can be installed.',
            )}
          </p>
        </Window>
      </div>
    </>
  );
}

import { useEffect, useId, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Glyph, GlyphSlot } from '../art.tsx';
import { useT, type T } from '../i18n.tsx';
import {
  groupOf,
  groupsInUse,
  skillHref,
  skillsHref,
  skillsPath,
  type Catalog,
  type Group,
  type Query,
  type Skill,
} from '../lib.ts';
import { StageBadge } from '../pages/shared.tsx';
import { navigate } from '../router.ts';
import { ArrowIcon } from '../ui.tsx';
import { companion, CUE_HANDLERS } from './companion.tsx';
import { GROUP_REACTION, reactionOf, reactionOfCategory, type Reaction } from './reactions.ts';

/*
 * ES29 Skill Tree: the catalog's own classification drawn as a tree, for discovery. Branches are the browsing groups,
 * twigs are the registry categories inside a branch, leaves are the skills. Nothing here is a dependency, an unlock,
 * a progression or an approval level: every leaf looks the same and carries its real review status as text.
 *
 * The selected branch and twig live in the URL (/skills?view=tree&branch=Design&twig=accessibility), so Back from a
 * skill page returns to the same place and a link can be shared. Branches are tabs (arrow keys, Home, End); twigs are
 * plain toggle buttons; leaves are ordinary links to the existing skill pages.
 */

export interface Twig {
  category: string;
  reaction: Reaction;
  skills: Skill[];
}
export interface Branch {
  group: Group;
  reaction: Reaction;
  skills: Skill[];
  twigs: Twig[];
}

/** Branches in the site's group order; twigs by size, then name; leaves by name. */
export function treeOf(c: Catalog): Branch[] {
  return groupsInUse(c).map((group) => {
    const skills = c.skills.filter((s) => groupOf(s) === group);
    const by = new Map<string, Skill[]>();
    for (const s of skills) by.set(s.category, [...(by.get(s.category) ?? []), s]);
    const twigs = [...by]
      .map(([category, list]) => ({
        category,
        reaction: reactionOfCategory(category, group),
        skills: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.skills.length - a.skills.length || a.category.localeCompare(b.category));
    return { group, reaction: GROUP_REACTION[group], skills, twigs };
  });
}

export const treePath = (branch?: string, twig?: string) =>
  skillsPath({
    view: 'tree',
    ...(branch ? { branch } : {}),
    ...(branch && twig ? { twig } : {}),
  });

const skillCount = (n: number, t: T) => (n === 1 ? t('{n} skill', { n }) : t('{n} skills', { n }));

export function SkillTree({ catalog, query }: { catalog: Catalog; query?: Query }) {
  const t = useT();
  const id = useId();
  const branches = useMemo(() => treeOf(catalog), [catalog]);
  const index = Math.max(
    0,
    branches.findIndex((b) => b.group === query?.branch),
  );
  const branch = branches[index]!;
  const twig = branch.twigs.find((x) => x.category === query?.twig);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Selecting a branch makes the Archivist react once (also on touch screens, where there is no hover).
  useEffect(() => {
    companion.pulse(branch.reaction, t('{group} branch', { group: t(branch.group) }));
  }, [branch, t]);

  // Selecting changes the URL in place: Back leaves the tree instead of stepping through every branch tried.
  const select = (i: number, focus: boolean) => {
    navigate(treePath(branches[i]!.group), { replace: true });
    const tab = tabs.current[i];
    if (focus) tab?.focus();
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const onKey = (e: KeyboardEvent) => {
    const n = branches.length;
    const keys: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % n,
      ArrowDown: (index + 1) % n,
      ArrowLeft: (index - 1 + n) % n,
      ArrowUp: (index - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  };

  const twigsShown = twig ? [twig] : branch.twigs;
  return (
    <div className="lg:grid lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-x-8">
      <div className="sx-side mb-5 lg:mb-0">
        <div className="sx-canopy surface">
          <p className="sx-root">
            <span className="sx-node sx-node-root">
              <Glyph name="tree" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{t('Skill Tree')}</span>
              <span className="block text-xs text-(--cw-muted)">
                {t('{n} skills in {m} branches', {
                  n: catalog.skills.length,
                  m: branches.length,
                })}
              </span>
            </span>
          </p>
          <div
            role="tablist"
            aria-label={t('Skill tree branches')}
            className="sx-trunk"
            onKeyDown={onKey}
            {...CUE_HANDLERS}
          >
            {branches.map((b, i) => {
              const selected = i === index;
              return (
                <button
                  key={b.group}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${i}`}
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  data-react={b.reaction}
                  data-label={t('{group} branch', { group: t(b.group) })}
                  onClick={() => select(i, false)}
                  className="sx-limb"
                  style={{ '--i': i } as CSSProperties}
                >
                  <span className="sx-node">
                    <Glyph name={b.group} />
                  </span>
                  <span className="min-w-0">
                    <span className="sx-limb-name">{t(b.group)}</span>
                    <span className="sx-limb-count">{skillCount(b.skills.length, t)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section
        key={branch.group}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${index}`}
        className="sx-branch min-w-0"
      >
        <header className="sx-branch-head surface">
          <GlyphSlot name={branch.group} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-(--cw-muted)">{t('Branch')}</p>
            <h2 className="text-xl font-bold">{t(branch.group)}</h2>
            <p className="text-sm text-(--cw-muted)">
              {branch.twigs.length === 1
                ? t('{skills} in 1 category', { skills: skillCount(branch.skills.length, t) })
                : t('{skills} in {m} categories', {
                    skills: skillCount(branch.skills.length, t),
                    m: branch.twigs.length,
                  })}
            </p>
          </div>
          <a href={skillsHref({ group: branch.group })} className="btn-primary cw-pointer">
            {t('Browse this branch')}
            <ArrowIcon width={14} height={14} />
          </a>
        </header>

        <div role="group" aria-label={t('Categories in this branch')} className="sx-twigs">
          <button
            type="button"
            aria-pressed={!twig}
            onClick={() => navigate(treePath(branch.group), { replace: true })}
            className="sx-twig-btn"
          >
            {t('All categories')}
            <span className="sx-count">{branch.skills.length}</span>
          </button>
          {branch.twigs.map((x) => (
            <button
              key={x.category}
              type="button"
              aria-pressed={twig === x}
              onClick={() =>
                navigate(treePath(branch.group, twig === x ? undefined : x.category), {
                  replace: true,
                })
              }
              className="sx-twig-btn"
            >
              {x.category}
              <span className="sx-count">{x.skills.length}</span>
            </button>
          ))}
        </div>

        <ol className="sx-sub" {...CUE_HANDLERS}>
          {twigsShown.map((x, ti) => (
            <li key={x.category} className="sx-twig" style={{ '--i': ti } as CSSProperties}>
              <h3 className="sx-twig-head">
                <span aria-hidden="true" className="sx-gem" />
                <span className="[overflow-wrap:anywhere]">{x.category}</span>
                <span className="text-xs font-normal text-(--cw-muted)">
                  {skillCount(x.skills.length, t)}
                </span>
              </h3>
              <ul className="sx-leaves">
                {x.skills.map((s, i) => (
                  <li key={s.id} style={{ '--i': i } as CSSProperties}>
                    <a
                      href={skillHref(s.id)}
                      className="sx-leaf"
                      data-react={reactionOf(s)}
                      data-label={s.name}
                    >
                      <span aria-hidden="true" className="sx-leaf-gem" />
                      <span className="sx-leaf-name">{s.name}</span>
                      <span className="sx-leaf-desc">{s.description}</span>
                      <span className="sx-leaf-badges">
                        <StageBadge skill={s} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="sx-note">
          {t(
            'Branches group skills by their registry category, to help you find them. They are not dependencies, unlock paths or approval levels: every skill keeps its own review status, shown on it.',
          )}
        </p>
      </section>
    </div>
  );
}

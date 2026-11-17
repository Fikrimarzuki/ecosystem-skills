import { groupOf, type Group, type Skill } from '../lib.ts';

/*
 * ES29: what the Archivist reaches for. A reaction says only which kind of skill is being looked at, from the
 * registry's own classification (the browsing group and, where it is more telling, the finer category). It never
 * depends on review, approval, assignment or installation, so the companion can never suggest any of those.
 */
export const REACTIONS = [
  'idle',
  'code',
  'quill',
  'shield',
  'lens',
  'book',
  'map',
  'ledger',
] as const;
export type Reaction = (typeof REACTIONS)[number];

/** The prop for each browsing group (the Skill Tree's branches). */
export const GROUP_REACTION: Record<Group, Reaction> = {
  Coding: 'code',
  Design: 'quill',
  Planning: 'map',
  Communication: 'book',
  Verification: 'lens',
  'Project-specific': 'ledger',
  Other: 'ledger',
};

/** Finer registry categories that have a more specific prop than their group. */
const CATEGORY_REACTION: Record<string, Reaction> = {
  security: 'shield',
  testing: 'lens',
  'code-review': 'lens',
  documentation: 'book',
};

export const reactionOfCategory = (category: string, group: Group): Reaction =>
  CATEGORY_REACTION[category] ?? GROUP_REACTION[group];

export const reactionOf = (s: Skill): Reaction => reactionOfCategory(s.category, groupOf(s));

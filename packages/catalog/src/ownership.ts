import type { Distribution, Ownership, Skill } from './schema.ts';

/*
 * Ownership and distribution of a skill as recorded (ES25), with the defaults for legacy records. Pure and free of
 * policy messages, so the public website can use it; the installer's decision lives in policy.ts.
 */

/** Ownership of a skill; absent (legacy records) means third-party for external skills and first-party otherwise. */
export const ownershipOf = (s: Pick<Skill, 'ownership' | 'origin'>): Ownership =>
  s.ownership ?? (s.origin === 'external' ? 'third-party' : 'first-party');

/** Distribution policy; absent (legacy records) means open, so no existing skill changes eligibility. */
export const distributionOf = (s: Pick<Skill, 'distribution'>): Distribution =>
  s.distribution ?? { policy: 'open' };

/** True when managed installation needs an explicit private authorization (or is impossible). */
export const isRestricted = (s: Pick<Skill, 'distribution'>) => distributionOf(s).policy !== 'open';

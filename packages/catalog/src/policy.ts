import { releaseInstallProblems, type InstallProblem } from './availability.ts';
import { distributionOf, isRestricted, ownershipOf } from './ownership.ts';
import type { Access, Agent, Consumer, Distribution, Ownership, Release, Skill } from './schema.ts';

/*
 * Ownership and distribution (ES25), and the one eligibility decision every installation path asks.
 *
 * Eight separate facts decide whether a skill may be made available to an agent in a project:
 *
 *   visibility     who may see the record (ES24: public, private, local)            -> validate.ts, private.ts
 *   ownership      who maintains the skill (fm-ecosystem, first-party, third-party)  -> never grants anything
 *   approval       the owner approved this exact release, after a security review   -> availability.ts
 *   distribution   open, restricted or not-distributable                             -> here
 *   authorization  an explicit private access record: consumer, skill, versions, agents -> here (records from private.ts)
 *   compatibility  the agents the release supports                                   -> curated.ts (recorded, not tested)
 *   integrity      content hashes of the library and store copies                    -> library.ts, store.ts
 *   installation   what is actually linked in the project                            -> curated.ts, sync.ts
 *
 * decide() covers distribution, authorization, consumer ownership and the release gate. It is pure: the callers read
 * the files and check integrity; they never re-implement these rules.
 */

export { distributionOf, isRestricted, ownershipOf };

export type InstallPath =
  /** skills:library install, upgrade, rollback (curated releases); the only path for restricted skills */
  | 'curated'
  /** skills:assign and skills:sync / skills:verify (registry assignments, first-party and legacy links) */
  | 'assignment'
  /** skills:install (legacy download of an approved external skill into external/skills) */
  | 'upstream-install';

export type DenialCode =
  | 'not-distributable'
  | 'restricted-path'
  | 'global-consumer'
  | 'no-authorization-source'
  | 'not-authorized'
  | 'version-not-authorized'
  | 'agent-not-authorized'
  | 'consumer-not-owner-controlled';

export interface Denial {
  code: DenialCode;
  message: string;
}

export interface EligibilityRequest {
  skill: Skill;
  path: InstallPath;
  consumer?: Consumer;
  /** The curated release asked for (curated path). */
  release?: Release;
  /** The version asked for, when it may not exist as a release. */
  version?: string;
  agents?: Agent[];
  /**
   * Authorization records from the private root, or undefined when no private root is configured. Restricted skills
   * fail closed without one: there is no flag, environment variable or owner string that stands in for a record.
   */
  access?: Access[];
}

export interface Decision {
  allowed: boolean;
  ownership: Ownership;
  distribution: Distribution;
  /** Distribution, authorization and ownership denials. */
  denials: Denial[];
  /** The release gate (approval, security review, blockers); separate so callers keep their wording. */
  release: InstallProblem[];
}

/**
 * May this skill be made available through this path (for this consumer, version and agents)? Denials name the rule,
 * never another consumer's grant, the private root's location or who authorized what.
 */
export function decide(req: EligibilityRequest): Decision {
  const { skill, consumer } = req;
  const distribution = distributionOf(skill);
  const ownership = ownershipOf(skill);
  const denials: Denial[] = [];
  const deny = (code: DenialCode, message: string) => denials.push({ code, message });
  const release = req.release ? releaseInstallProblems(skill, req.release) : [];
  const version = req.release?.version ?? req.version;

  if (distribution.policy === 'not-distributable')
    deny(
      'not-distributable',
      `${skill.id} is not distributable: it is published for discovery and documentation only and is never installed`,
    );
  else if (distribution.policy === 'restricted') {
    if (req.path !== 'curated')
      deny(
        'restricted-path',
        `${skill.id} is restricted: it is installed only as an approved curated release, through pnpm skills:library install with an explicit private authorization; it cannot be assigned, linked or downloaded directly`,
      );
    else if (consumer?.kind === 'global')
      deny('global-consumer', `${consumer.id} is a global consumer; it is never authorized`);
    else {
      // every independent reason is reported, so one fix does not just reveal the next refusal
      if (consumer && distribution.access === 'owner-only' && consumer.ownership !== 'fm-ecosystem')
        deny(
          'consumer-not-owner-controlled',
          `${skill.id} is owner-only: ${consumer.id} is not declared owner-controlled (consumer "ownership": "fm-ecosystem" in registry/consumers.json)`,
        );
      if (!req.access)
        deny(
          'no-authorization-source',
          `${skill.id} is restricted and no private authorization source is configured (ECOSYSTEM_SKILLS_PRIVATE_ROOT or private.local.json); restricted skills fail closed without one`,
        );
    }
    // the explicit grant: this consumer, this skill, this version, these agents (no wildcards exist in the schema)
    if (req.path === 'curated' && consumer && consumer.kind !== 'global' && req.access) {
      const grant = req.access.find((a) => a.consumer === consumer.id && a.skill === skill.id);
      if (!grant)
        deny(
          'not-authorized',
          `${consumer.id} is not authorized for ${skill.visibility && skill.visibility !== 'public' ? 'private skill ' : ''}${skill.id} (no access record for this consumer and skill)`,
        );
      else {
        if (version && version !== 'legacy' && !grant.releases.includes(version))
          deny(
            'version-not-authorized',
            `${consumer.id} is not authorized for ${skill.id}@${version} (the access record does not list this version)`,
          );
        for (const ag of req.agents ?? [])
          if (!grant.agents.includes(ag))
            deny(
              'agent-not-authorized',
              `${consumer.id} is not authorized to use ${skill.id} with ${ag}`,
            );
      }
    }
  }
  return {
    allowed: denials.length === 0 && release.length === 0,
    ownership,
    distribution,
    denials,
    release,
  };
}

export const OWNERSHIP_TEXT: Record<Ownership, string> = {
  'fm-ecosystem': 'FM Ecosystem',
  'first-party': 'first-party',
  'third-party': 'third-party',
};

/** One line for the CLI: ownership and distribution as recorded (or derived, for legacy records). */
export function describePolicy(s: Skill): string {
  const d = distributionOf(s);
  return `owner ${OWNERSHIP_TEXT[ownershipOf(s)]}${s.ownership ? '' : ' (not declared)'}; distribution ${d.policy}${d.access ? ` (${d.access})` : ''}`;
}

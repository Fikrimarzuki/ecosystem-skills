import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ConsumerError,
  formatJson,
  realOrUndefined,
  resolveProjectRoot,
  writeFileAtomic,
  type AtomicWriteOptions,
} from './fsguard.ts';
import { PROJECT_SKILL_DIRS } from './links.ts';
import type { Agent, Catalog, Consumer, Skill } from './schema.ts';
import { buildCatalog } from './validate.ts';

const NAMES = ['skills', 'consumers', 'integrations', 'evidence'] as const;
type RawConsumer = Record<string, unknown> & {
  id: string;
  assignments?: Record<string, unknown>[];
};

export interface LoadedRegistry {
  root: string;
  /** Exact file contents, used to detect concurrent edits before writing. */
  text: Record<(typeof NAMES)[number], string>;
  raw: { skills: unknown; consumers: RawConsumer[]; integrations: unknown; evidence: unknown };
  catalog: Catalog;
}

export function loadRegistry(root: string): LoadedRegistry {
  const text = {} as LoadedRegistry['text'];
  for (const n of NAMES) {
    const p = join(root, 'registry', `${n}.json`);
    text[n] = existsSync(p) ? readFileSync(p, 'utf8') : n === 'evidence' ? '[]\n' : '';
    if (!text[n]) throw new ConsumerError(`missing registry/${n}.json`);
  }
  const raw = Object.fromEntries(
    NAMES.map((n) => [n, JSON.parse(text[n])]),
  ) as LoadedRegistry['raw'];
  const r = buildCatalog(raw);
  if (!r.ok) throw new ConsumerError(`registry is invalid:\n  - ${r.errors.join('\n  - ')}`);
  return { root, text, raw, catalog: r.catalog };
}

/** Agents whose project-local discovery directory is supported (verified in ES2). */
export const SUPPORTED_AGENTS = Object.keys(PROJECT_SKILL_DIRS) as Agent[];

export function findConsumer(reg: LoadedRegistry, id: string): Consumer {
  const c = reg.catalog.consumers.find((x) => x.id === id);
  if (!c) {
    const known = reg.catalog.consumers.map((x) => x.id).join(', ');
    throw new ConsumerError(
      `unknown consumer "${id}". The first argument is a consumer id, not a folder (use --project <dir> for a folder). Known consumers: ${known}`,
    );
  }
  return c;
}
export function findSkill(reg: LoadedRegistry, id: string): Skill {
  const s = reg.catalog.skills.find((x) => x.id === id);
  if (!s) throw new ConsumerError(`unknown skill "${id}" (list skills with: pnpm skills:list)`);
  return s;
}

/**
 * Policy for assigning a skill. External skills must be approved for their pinned revision (the registry
 * validator already ties approval to the pin). First-party skills follow their own policy: they need no
 * third-party approval, but a rejected skill is never assignable.
 */
export function assignmentPolicy(skill: Skill): string | undefined {
  if (skill.review.status === 'rejected') return `${skill.id} is rejected`;
  if (skill.origin === 'external' && skill.review.status !== 'approved')
    return `${skill.id} is an external skill with review status "${skill.review.status}"; only approved external skills can be assigned`;
  return undefined;
}

export interface AssignOptions {
  agents?: Agent[];
  install?: 'symlink' | 'copy';
  dryRun?: boolean;
  write?: AtomicWriteOptions;
}

export interface ChangeResult {
  status: 'added' | 'removed' | 'unchanged';
  consumer: string;
  skill: string;
  assignment?: Record<string, unknown>;
  dryRun: boolean;
}

function commit(
  reg: LoadedRegistry,
  consumers: RawConsumer[],
  opts: { dryRun?: boolean; write?: AtomicWriteOptions },
) {
  // Validate the whole registry with the change before anything is written.
  const r = buildCatalog({ ...reg.raw, consumers });
  if (!r.ok)
    throw new ConsumerError(
      `change would make the registry invalid:\n  - ${r.errors.join('\n  - ')}`,
    );
  if (opts.dryRun) return;
  writeFileAtomic(join(reg.root, 'registry', 'consumers.json'), formatJson(consumers), {
    expectedCurrent: reg.text.consumers,
    ...opts.write,
  });
}

/** Add an assignment (desired state only). Never installs, activates, or touches evidence. */
export function assignSkill(
  root: string,
  consumerId: string,
  skillId: string,
  opts: AssignOptions = {},
): ChangeResult {
  const reg = loadRegistry(root);
  const consumer = findConsumer(reg, consumerId);
  const skill = findSkill(reg, skillId);
  if (consumer.kind === 'global')
    throw new ConsumerError(
      `"${consumerId}" is a global consumer; global activation is out of scope`,
    );
  const refused = assignmentPolicy(skill);
  if (refused) throw new ConsumerError(refused);

  const agents = [
    ...new Set(opts.agents ?? consumer.agents.filter((a) => SUPPORTED_AGENTS.includes(a))),
  ].sort();
  if (!agents.length)
    throw new ConsumerError(
      `consumer "${consumerId}" lists no supported agents; pass --agents claude-code,codex`,
    );
  const unsupported = agents.filter((a) => !SUPPORTED_AGENTS.includes(a));
  if (unsupported.length)
    throw new ConsumerError(`unsupported agent(s): ${unsupported.join(', ')}`);
  const install = opts.install ?? 'symlink';

  const existing = consumer.assignments.find((a) => a.skill === skillId);
  if (existing) {
    if (existing.install === install && existing.agents.join() === agents.join())
      return { status: 'unchanged', consumer: consumerId, skill: skillId, dryRun: !!opts.dryRun };
    throw new ConsumerError(
      `${skillId} is already assigned to ${consumerId} (agents ${existing.agents.join(',')}, ${existing.install}); unassign it first to change it`,
    );
  }

  const assignment = { skill: skillId, agents, install, verification: { status: 'unverified' } };
  const consumers = reg.raw.consumers.map((c) =>
    c.id === consumerId ? { ...c, assignments: [...(c.assignments ?? []), assignment] } : c,
  );
  commit(reg, consumers, opts);
  return {
    status: 'added',
    consumer: consumerId,
    skill: skillId,
    assignment,
    dryRun: !!opts.dryRun,
  };
}

/** Remove an assignment. Never deletes installed content or project links (that is `sync --prune`). */
export function unassignSkill(
  root: string,
  consumerId: string,
  skillId: string,
  opts: { dryRun?: boolean; write?: AtomicWriteOptions } = {},
): ChangeResult {
  const reg = loadRegistry(root);
  const consumer = findConsumer(reg, consumerId);
  if (!consumer.assignments.some((a) => a.skill === skillId))
    throw new ConsumerError(`${skillId} is not assigned to ${consumerId}`);
  const consumers = reg.raw.consumers.map((c) => {
    if (c.id !== consumerId) return c;
    const rest = (c.assignments ?? []).filter((a) => a.skill !== skillId);
    const next: RawConsumer = { ...c, assignments: rest };
    if (!rest.length) delete next.assignments;
    return next;
  });
  commit(reg, consumers, opts);
  return { status: 'removed', consumer: consumerId, skill: skillId, dryRun: !!opts.dryRun };
}

export const LOCATIONS_FILE = 'consumers.local.json';

/**
 * Where a consumer lives on this machine. Locations are machine-specific, so they are never stored in the
 * registry or the public catalog: an explicit --project wins, otherwise the git-ignored consumers.local.json
 * (paths relative to this repository).
 *
 * An explicit --project is checked against that file before anything touches the filesystem: it must be the
 * folder configured for this consumer (when there is one) and must not be the folder configured for another
 * consumer. Otherwise `sync --prune` could treat another consumer's links as stale. There is no override; fix
 * consumers.local.json or omit --project.
 */
export function resolveConsumerLocation(
  root: string,
  consumerId: string,
  explicit?: string,
): { path: string; source: 'argument' | 'local-config' } | undefined {
  const map = readLocations(root);
  const configured = (id: string): string | undefined => {
    const p = map?.[id];
    if (p === undefined) return undefined;
    if (typeof p !== 'string' || !p)
      throw new ConsumerError(`${LOCATIONS_FILE}: "${id}" must be a path string`);
    return resolve(root, p);
  };
  if (explicit) {
    const path = resolveProjectRoot(explicit);
    const own = configured(consumerId);
    if (own !== undefined && (realOrUndefined(own) ?? own) !== path)
      throw new ConsumerError(
        `--project ${path} does not match the location configured for "${consumerId}" in ${LOCATIONS_FILE} (${own}). Omit --project to use the configured folder, or correct ${LOCATIONS_FILE}.`,
      );
    for (const other of Object.keys(map ?? {})) {
      if (other === consumerId) continue;
      const theirs = configured(other)!;
      if ((realOrUndefined(theirs) ?? theirs) === path)
        throw new ConsumerError(
          `--project ${path} is the folder configured for consumer "${other}" in ${LOCATIONS_FILE}, not for "${consumerId}". Check the consumer id.`,
        );
    }
    return { path, source: 'argument' };
  }
  const own = configured(consumerId);
  if (own === undefined) return undefined;
  return { path: resolveProjectRoot(own), source: 'local-config' };
}

function readLocations(root: string): Record<string, unknown> | undefined {
  const file = join(root, LOCATIONS_FILE);
  if (!existsSync(file)) return undefined;
  let map: unknown;
  try {
    map = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new ConsumerError(`${LOCATIONS_FILE} is not valid JSON`);
  }
  if (!map || typeof map !== 'object' || Array.isArray(map))
    throw new ConsumerError(`${LOCATIONS_FILE} must be an object of consumer id -> path`);
  return map as Record<string, unknown>;
}

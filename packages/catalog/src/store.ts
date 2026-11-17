import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ConsumerError, kindOf } from './fsguard.ts';
import type { Release } from './schema.ts';
import { scanTree } from './tree.ts';

/*
 * The machine-local curated store (ES18): external/releases/<skill>/<version>/, one immutable folder per installed
 * release version, plus external/releases.lock.json, which records what was installed, when, and for which consumer.
 * Both are git-ignored like the rest of external/, so nothing here is published or written into consumer repositories.
 */

export const STORE = ['external', 'releases'] as const;
export const CURATED_LOCK = 'external/releases.lock.json';
export const LEGACY = 'legacy';

const identity = z.strictObject({
  skill: z.string(),
  version: z.string(),
  curatedHash: z.string(),
  upstreamUrl: z.string().optional(),
  upstreamRevision: z.string().optional(),
});
const deployment = z.strictObject({
  version: z.string(), // a release version, or "legacy" (installed from upstream into external/skills)
  contentHash: z.string(),
  at: z.string(),
  action: z.enum(['install', 'upgrade', 'rollback', 'migrate', 'baseline']),
  release: identity.optional(),
});
const lockSchema = z.strictObject({
  version: z.literal(1),
  store: z.record(
    z.string(),
    z.strictObject({ contentHash: z.string(), installedAt: z.string(), release: identity }),
  ),
  consumers: z.record(
    z.string(),
    z.record(z.string(), z.strictObject({ current: deployment, history: z.array(deployment) })),
  ),
});
export type CuratedLock = z.infer<typeof lockSchema>;
export type Deployment = z.infer<typeof deployment>;
const EMPTY: CuratedLock = { version: 1, store: {}, consumers: {} };

export function readCuratedLock(root: string): { lock: CuratedLock; text: string | undefined } {
  const p = join(root, CURATED_LOCK);
  if (!existsSync(p)) return { lock: structuredClone(EMPTY), text: undefined };
  if (kindOf(p) !== 'file')
    throw new ConsumerError(`${CURATED_LOCK} is not a regular file; refusing to use it`);
  const text = readFileSync(p, 'utf8');
  const parsed = lockSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new ConsumerError(
      `${CURATED_LOCK} is malformed; refusing to use it (fix or remove it by hand)`,
    );
  return { lock: parsed.data, text };
}

export const storeRoot = (root: string) => join(root, ...STORE);
export const storePath = (root: string, skill: string, version: string) =>
  join(storeRoot(root), skill, version);
export const releaseIdentity = (r: Release) => ({
  skill: r.skill,
  version: r.version,
  curatedHash: r.curatedHash,
  ...(r.upstream ? { upstreamUrl: r.upstream.url, upstreamRevision: r.upstream.revision } : {}),
});

export type StoreState = 'absent' | 'verified' | 'tampered' | 'untracked' | 'unsafe';
export function storeState(root: string, lock: CuratedLock, release: Release): StoreState {
  for (const rel of [
    STORE[0],
    `${STORE[0]}/${STORE[1]}`,
    `${STORE[0]}/${STORE[1]}/${release.skill}`,
  ]) {
    const k = kindOf(join(root, rel));
    if (k === 'missing') return 'absent';
    if (k !== 'dir') return 'unsafe';
  }
  const p = storePath(root, release.skill, release.version);
  const k = kindOf(p);
  if (k === 'missing') return 'absent';
  if (k !== 'dir') return 'unsafe';
  const entry = lock.store[`${release.skill}@${release.version}`];
  if (!entry) return 'untracked';
  const scan = scanTree(p);
  return scan.special.length ||
    scan.hash !== release.curatedHash ||
    entry.contentHash !== release.curatedHash
    ? 'tampered'
    : 'verified';
}

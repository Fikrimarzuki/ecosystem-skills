import { z } from 'zod';

export const AGENTS = ['claude-code', 'codex', 'cursor'] as const;
/** unreviewed = discovered only; reviewed = findings recorded, no decision; approved/rejected = owner decision. */
export const REVIEW_STATUSES = ['unreviewed', 'reviewed', 'approved', 'rejected'] as const;
export const VERIFICATION_STATUSES = ['unverified', 'verified', 'failed'] as const;
export const INTEGRATION_TYPES = ['mcp-server', 'cli-tool', 'dependency'] as const;

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case (a-z, 0-9, "-")');
const text = z.string().trim().min(1);
const url = z.url({ protocol: /^https?$/ });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const sha = z.string().regex(/^[0-9a-f]{40}$/, 'must be a full 40-character lowercase commit SHA');
const contentHash = z.string().regex(/^sha256-[0-9a-f]{64}$/, 'must be sha256-<64 hex>');

/** A repo-relative path that cannot escape its root. */
export function isSafeRelPath(p: string): boolean {
  return (
    p.length > 0 &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !/^[A-Za-z]:/.test(p) &&
    p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
  );
}
const relPath = z
  .string()
  .refine(isSafeRelPath, 'must be a relative path without "..", "." or empty segments');

export const agentSchema = z.enum(AGENTS);

const docRefSchema = z.strictObject({
  label: text,
  // Either an https URL or a repo-relative path.
  href: text,
});

const reviewSchema = z.strictObject({
  status: z.enum(REVIEW_STATUSES),
  reviewedAt: date.optional(),
  /** Who performed the review (findings). */
  reviewer: text.optional(),
  /** Who made the approval decision. Required for `approved`; never set automatically. */
  approvedBy: text.optional(),
  /** External skills: the exact revision and content the review covers. */
  revision: sha.optional(),
  contentHash: contentHash.optional(),
  findings: z.array(text).default([]),
  notes: text.optional(),
});

const firstPartySourceSchema = z.strictObject({
  type: z.literal('first-party'),
  /** Repo-relative path of the skill folder, e.g. `skills/shared/foo`. */
  path: relPath,
});

const externalSourceSchema = z.strictObject({
  type: z.literal('external'),
  /** The original upstream repository. Never a fork. */
  upstream: z.strictObject({ url }),
  /** Optional fork we may install from; tracked separately from upstream. */
  fork: z.strictObject({ url }).optional(),
  /** Skill folder inside the repository, e.g. `skills/grill-me`. */
  path: relPath,
  /** Pinned commit (full SHA). Tags and branches move, so they are not accepted. */
  revision: sha,
});

export const skillSchema = z.strictObject({
  id,
  name: text,
  description: text,
  category: id,
  tags: z.array(id).default([]),
  origin: z.enum(['first-party', 'external']),
  source: z.discriminatedUnion('type', [firstPartySourceSchema, externalSourceSchema]),
  /** Original author. Required for external skills. */
  author: text.optional(),
  /** SPDX identifier, or "unknown" if upstream states none. Required for external skills. */
  license: text.optional(),
  version: text.optional(),
  agents: z.array(agentSchema).default([]),
  /** Integration ids this skill needs to execute. */
  requires: z.array(id).default([]),
  /** Other registered skills this skill explicitly invokes (hard dependencies, not cross-references). */
  requiresSkills: z.array(id).default([]),
  docs: z.array(docRefSchema).default([]),
  review: reviewSchema.default({ status: 'unreviewed', findings: [] }),
});

const verificationSchema = z.strictObject({
  status: z.enum(VERIFICATION_STATUSES),
  verifiedAt: date.optional(),
  /** How the verification was performed (required once verified). */
  method: text.optional(),
  /** External skills: the revision that was verified. A different pinned revision makes it stale. */
  revision: sha.optional(),
  /** Content hash (`sha256-…`, see tree.ts) of the skill folder that was verified; useful before a commit exists. */
  contentHash: contentHash.optional(),
});

const assignmentSchema = z.strictObject({
  skill: id,
  agents: z.array(agentSchema).min(1),
  /** How the skill is exposed to the consumer. Symlinks keep one canonical copy. */
  install: z.enum(['symlink', 'copy']).default('symlink'),
  verification: verificationSchema.default({ status: 'unverified' }),
});

export const consumerSchema = z.strictObject({
  id,
  name: text,
  kind: z.enum(['project', 'global']),
  description: text.optional(),
  /** Agents this consumer is used with. */
  agents: z.array(agentSchema).default([]),
  /** Desired skills. An assignment is intent, not evidence of installation. */
  assignments: z.array(assignmentSchema).default([]),
});

export const integrationSchema = z.strictObject({
  id,
  name: text,
  type: z.enum(INTEGRATION_TYPES),
  description: text,
  homepage: url.optional(),
  license: text.optional(),
  /** Only meaningful for `mcp-server`. */
  transport: z.enum(['stdio', 'http', 'sse']).optional(),
});

export const EVIDENCE_RESULTS = ['verified', 'partial', 'failed'] as const;
const count = z.number().int().min(0);
const tally = z.strictObject({
  runs: count,
  passed: count,
  partial: count,
  failed: count,
  inconclusive: count,
});
/** Repeated natural-trigger runs: invocation (did the agent load the skill) and behavior are counted separately. */
export const trialsSchema = z.strictObject({
  treatment: tally.extend({ invoked: count }),
  /** Same task and fixture with the skill unavailable. Never counts as an invocation. */
  control: tally.optional(),
});
const check = z.enum(['pass', 'fail', 'not-tested']);

/**
 * Skill-level agent compatibility evidence from a real agent run (e.g. a disposable pilot consumer).
 * Separate from consumer assignments: it says "this agent can use this skill", not "project X uses it".
 */
export const evidenceSchema = z.strictObject({
  id,
  skill: id,
  agent: agentSchema,
  agentVersion: text,
  date,
  /** Where it was tested, without machine-specific paths, e.g. "ES6 isolated pilot consumer". */
  context: text,
  /** External skills: the pinned revision that was tested. */
  revision: sha.optional(),
  contentHash,
  /** The harmless task used to exercise the skill. */
  task: text,
  discovery: check,
  instructions: check,
  invocation: check,
  /** How the skill was triggered. Absent = explicit (the prompt named the skill). */
  trigger: z.enum(['explicit', 'natural']).optional(),
  /** Control run without the skill available, and what it showed. Never proof of causation. */
  control: text.optional(),
  /** Scenario id and fixture identifier (see packages/catalog/evals). */
  scenario: id.optional(),
  fixture: id.optional(),
  trials: trialsSchema.optional(),
  /** Environment differences or isolation notes, without machine paths. */
  environment: text.optional(),
  /** Outcome of the verification commands that were run. */
  commands: text.optional(),
  result: z.enum(EVIDENCE_RESULTS),
  notes: text.optional(),
});

export const registrySchema = z.strictObject({
  skills: z.array(skillSchema),
  consumers: z.array(consumerSchema),
  integrations: z.array(integrationSchema),
  evidence: z.array(evidenceSchema).default([]),
});

export type Agent = z.infer<typeof agentSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Consumer = z.infer<typeof consumerSchema>;
export type Integration = z.infer<typeof integrationSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Registry = z.infer<typeof registrySchema>;

export interface Catalog {
  schemaVersion: 1;
  skills: Skill[];
  consumers: Consumer[];
  integrations: Integration[];
  evidence: Evidence[];
}

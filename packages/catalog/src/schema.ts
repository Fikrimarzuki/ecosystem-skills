import { z } from 'zod';

export const AGENTS = ['claude-code', 'codex', 'cursor'] as const;
/** unreviewed = discovered only; reviewed = findings recorded, no decision; approved/rejected = owner decision. */
export const REVIEW_STATUSES = ['unreviewed', 'reviewed', 'approved', 'rejected'] as const;
export const VERIFICATION_STATUSES = ['unverified', 'verified', 'failed'] as const;
export const INTEGRATION_TYPES = [
  'mcp-server',
  'cli-tool',
  'dependency',
  'asset-catalog',
  'config-registry',
] as const;
/**
 * Where a record may appear (ES24). public: the public registry and website. private: only in the configured private
 * root (see private.ts), never in this repository or its build output. local: private metadata that stays on this
 * machine (the private root's local/ folder). Absent means public in the public registry and private in the private
 * root, so an unlabelled private input is never treated as public. Visibility is independent of discovery, review,
 * approval, content availability and installation.
 */
export const VISIBILITIES = ['public', 'private', 'local'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
/**
 * Who maintains a skill (ES25). fm-ecosystem: built and maintained for FM Ecosystem projects by their owner;
 * first-party: other skills maintained here; third-party: maintained upstream by someone else. Explicit metadata only,
 * never inferred from an id or a name. Ownership describes; it grants no permission. Absent = derived from `origin`.
 */
export const OWNERSHIPS = ['fm-ecosystem', 'first-party', 'third-party'] as const;
export type Ownership = (typeof OWNERSHIPS)[number];
/** Consumer ownership: fm-ecosystem marks a project the owner controls (needed by owner-only skills). */
export const CONSUMER_OWNERSHIPS = ['fm-ecosystem', 'third-party'] as const;
/**
 * Managed distribution (ES25), independent of visibility. open: installable under the approval and security rules;
 * restricted: additionally needs an explicit private authorization; not-distributable: discovery and documentation
 * only. Absent = open, so existing skills keep their eligibility.
 */
export const DISTRIBUTIONS = ['open', 'restricted', 'not-distributable'] as const;
/**
 * Who a restricted skill may be authorized for. authorized-consumers: any project consumer named by an access record
 * (ES24 behaviour); owner-only: additionally, only consumers declared owner-controlled.
 */
export const ACCESS_POLICIES = ['owner-only', 'authorized-consumers'] as const;
const distributionSchema = z.strictObject({
  policy: z.enum(DISTRIBUTIONS),
  /** Required for restricted; not allowed otherwise. */
  access: z.enum(ACCESS_POLICIES).optional(),
  note: z.string().trim().min(1).optional(),
});
export type Distribution = z.infer<typeof distributionSchema>;

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case (a-z, 0-9, "-")');
const text = z.string().trim().min(1);
const count0 = z.number().int().min(0);
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
/** External skill folder: a safe relative path, or "." when the repository root itself is the skill. */
const skillFolderPath = z
  .string()
  .refine(
    (p) => p === '.' || isSafeRelPath(p),
    'must be "." (repository root) or a relative path without "..", "." or empty segments',
  );

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
  /** Skill folder inside the repository, e.g. `skills/grill-me`; "." when SKILL.md sits at the repository root. */
  path: skillFolderPath,
  /** Pinned commit (full SHA). Tags and branches move, so they are not accepted. */
  revision: sha,
});

export const DISCOVERY_OUTCOMES = ['register-for-review', 'register-with-warnings'] as const;
/**
 * How an external candidate entered the registry (ES16). It is a discovery record, not a review: the scan covered
 * metadata, file inventory and automated pattern hits, and it implies no approval, installation or activation.
 */
const discoverySchema = z.strictObject({
  discoveredAt: date,
  outcome: z.enum(DISCOVERY_OUTCOMES),
  /** Id in `sources.json` of the repository this skill was found in. */
  source: id,
  /** `sha256-…` of the skill folder at the pinned revision (see tree.ts), for the later review to start from. */
  contentHash,
  /** Operational risks found by the discovery scan. Required for `register-with-warnings`. */
  warnings: z.array(text).default([]),
  /** Runtime dependencies and services the skill needs (tools, services, keys, licences). */
  dependencies: z.array(text).default([]),
  /**
   * Conditions that must be resolved before this skill may be approved or installed as registered (for example a
   * repository-root SKILL.md, missing sibling skills, an unreviewed downloaded binary, an unconfirmed licence).
   * Approval is refused while any remain; removing them is a deliberate registry edit with findings that say why.
   */
  approvalBlockers: z.array(text).default([]),
  /** What the discovery scan covered and what it did not. It is not a security audit. */
  audit: text,
});

export const CURATION_STATES = ['pending', 'blocked'] as const;
/**
 * Owner-set curation intent for a skill that has no curated release. Content availability is otherwise derived
 * (see availability.ts); only "selected for curation" and "blocked, and why" cannot be derived, so they are recorded.
 */
const curationSchema = z.strictObject({
  state: z.enum(CURATION_STATES),
  reason: text,
  updatedAt: date,
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
  /** External candidates registered by discovery (ES16). Absent for skills registered earlier. */
  discovery: discoverySchema.optional(),
  /** Curation intent while the skill has no curated release (ES17). A release makes this field invalid. */
  curation: curationSchema.optional(),
  /** ES24: absent = public (public registry) or private (private root). */
  visibility: z.enum(VISIBILITIES).optional(),
  /** ES25: absent = derived from origin (third-party for external, first-party otherwise). */
  ownership: z.enum(OWNERSHIPS).optional(),
  /** ES25: absent = open (public registry) or restricted (private root). */
  distribution: distributionSchema.optional(),
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
  /**
   * Curated release version this consumer uses (ES18). Absent = legacy: the skill installed from its pinned upstream
   * revision into external/skills. Present = the approved release library/<skill>/<release>, activated from the
   * machine-local store external/releases/<skill>/<release>.
   */
  release: z
    .string()
    .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'must be a semantic version')
    .optional(),
  verification: verificationSchema.default({ status: 'unverified' }),
});

/** Project id in Ecosystem Config (`config/projects/<id>.json`), e.g. `fmStudios`. */
const configProjectId = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, 'must be an Ecosystem Config project id');

/**
 * How a project relates to the ecosystem's shared sources (ES24). References only: a mapping grants no permission
 * to read, edit or install anything, and it is never inferred. `project` is the stable identity shared by Ecosystem
 * Config and Ecosystem Assets; `sources` are integration ids (type asset-catalog or config-registry), never paths.
 */
const ecosystemMappingSchema = z.strictObject({
  /** The project's record in Ecosystem Config, when one exists. Absent = no record (say why in `note`). */
  project: configProjectId.optional(),
  sources: z.array(id).default([]),
  note: text.optional(),
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
  /** Ecosystem source references (ES24). */
  ecosystem: ecosystemMappingSchema.optional(),
  /** ES25: fm-ecosystem = a project the owner controls. Absent = not declared (never owner-controlled). */
  ownership: z.enum(CONSUMER_OWNERSHIPS).optional(),
});

/**
 * The repository behind an integration, by stable integration id rather than by name (ES24). `name` is the current
 * repository name; `formerNames` keeps old names resolvable after a rename, so renaming a repository is a one-record
 * change here and nothing else refers to the name.
 */
const repositoryIdentitySchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/, 'must be a repository name'),
  formerNames: z.array(z.string().regex(/^[A-Za-z0-9_.-]+$/)).default([]),
  /** Public repositories may be linked; private ones are named only. */
  visibility: z.enum(['public', 'private']),
  url: url.optional(),
});

/** A documented, read-only interface of an integration: what an agent may read, and where it is documented. */
const contractSchema = z.strictObject({
  /** Repository-relative documentation of the interface. */
  docs: z.array(relPath).min(1),
  /** Repository-relative files the interface exposes, read-only. */
  reads: z.array(relPath).default([]),
  /** Commands the source documents for producing or validating those files (run in that repository, by its owner). */
  commands: z.array(text).default([]),
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
  /** asset-catalog and config-registry: the repository and its read-only contract (ES24). */
  repository: repositoryIdentitySchema.optional(),
  contract: contractSchema.optional(),
});

export const SOURCE_KINDS = [
  'skill',
  'skill-collection',
  'framework',
  'application',
  'design-reference',
  'standard',
  'lead',
] as const;
export const SOURCE_RESOLUTIONS = ['verified', 'ambiguous', 'unresolved'] as const;
export const SOURCE_DECISIONS = [
  'register-for-review',
  'register-with-warnings',
  'reference-only',
  'unresolved',
  'reject',
] as const;
export const SOURCE_BATCHES = ['original', 'design-ui', 'video-animation', 'discovered'] as const;

/**
 * A repository, application, standard or lead that was examined. Separate from skills: a source can be a
 * reference collection, an application or an unresolved name without being, or containing, an installable skill.
 */
export const sourceSchema = z.strictObject({
  id,
  name: text,
  /** The name as the owner asked for it, when it differs from the resolved name. */
  requestedAs: text.optional(),
  batch: z.enum(SOURCE_BATCHES),
  kind: z.enum(SOURCE_KINDS),
  /** verified = ownership established by evidence; ambiguous = several plausible upstreams; unresolved = none. */
  resolution: z.enum(SOURCE_RESOLUTIONS),
  decision: z.enum(SOURCE_DECISIONS),
  upstream: z.strictObject({ url }).optional(),
  /** Commit examined by the discovery audit. Skills may be pinned to an older revision. */
  revision: sha.optional(),
  publisher: text.optional(),
  license: text.optional(),
  /** Date of the newest commit seen at `revision`. */
  lastCommit: date.optional(),
  /** Distinct installable skills found at `revision` (copies for other agents and test fixtures are not counted). */
  skillsFound: count0.default(0),
  /** Registered skills from this source (including skills registered before ES16). */
  skills: z.array(id).default([]),
  summary: text,
  warnings: z.array(text).default([]),
  /** Other candidates considered, with why they were not chosen. */
  alternatives: z.array(z.strictObject({ url, note: text })).default([]),
  /** For ambiguous or unresolved sources: what information would settle it. */
  needs: text.optional(),
  discoveredAt: date,
  /** ES24: absent = public (public registry) or private (private root). */
  visibility: z.enum(VISIBILITIES).optional(),
});

/* ------------------------------------------------------------------ curated releases (ES17) */

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const RELEASE_APPROVALS = ['unapproved', 'approved', 'withdrawn'] as const;
/** Security review outcomes. None of them means "safe": the scope and evidence say what was actually looked at. */
export const REVIEW_OUTCOMES = [
  'not-evaluated',
  'no-blocking-issues',
  'requires-changes',
  'requires-manual-review',
  'blocked',
] as const;
/** Every category a review must address, once for the instructions and once for the supporting files. */
export const REVIEW_CATEGORIES = [
  'prompt-injection',
  'instruction-hierarchy',
  'credential-exfiltration',
  'network-requests',
  'shell-execution',
  'hooks',
  'install-scripts',
  'downloaded-binaries',
  'filesystem-writes',
  'global-config-changes',
  'hidden-dependencies',
  'unpinned-remote-instructions',
  'tool-permissions',
] as const;
export const REVIEW_SCOPES = ['instructions', 'supporting-files'] as const;
export const CHECK_RESULTS = [
  'not-evaluated',
  'no-issue-found',
  'issue-found',
  'needs-manual-review',
] as const;
export const EVIDENCE_METHODS = ['static-scan', 'manual-read', 'behavioral-eval', 'other'] as const;

const reviewCheckSchema = z.strictObject({
  category: z.enum(REVIEW_CATEGORIES),
  scope: z.enum(REVIEW_SCOPES),
  result: z.enum(CHECK_RESULTS),
  note: text.optional(),
});
const reviewEvidenceSchema = z.strictObject({
  method: z.enum(EVIDENCE_METHODS),
  summary: text,
});
const releaseReviewSchema = z.strictObject({
  outcome: z.enum(REVIEW_OUTCOMES).default('not-evaluated'),
  reviewedAt: date.optional(),
  reviewer: text.optional(),
  /** What was and was not examined (files, categories). Required once anything was evaluated. */
  scope: text.optional(),
  /** Hash of the folder the review covered; must equal the release's curatedHash once anything was evaluated. */
  contentHash: contentHash.optional(),
  checks: z.array(reviewCheckSchema).default([]),
  evidence: z.array(reviewEvidenceSchema).default([]),
  notes: text.optional(),
});
const modificationSchema = z.strictObject({
  kind: z.enum(['added', 'changed', 'removed']),
  path: relPath,
  summary: text,
  why: text,
  affectsBehavior: z.boolean(),
  affectsDependencies: z.boolean(),
  affectsPermissions: z.boolean(),
});

/**
 * A link in a release file that leaves the release folder (e.g. `../web-quality-audit/SKILL.md`). Installed alone, such
 * a link is broken, so every one must be declared: `unresolved` blocks approval and installation; `requires-release`
 * names the sibling release that must be installed for the same consumer, under the folder name the link expects.
 */
const referenceSchema = z.strictObject({
  path: relPath,
  target: text,
  resolution: z.enum(['unresolved', 'requires-release']),
  requires: z
    .strictObject({ skill: id, version: z.string().regex(SEMVER, 'must be a semantic version') })
    .optional(),
  note: text,
});

/**
 * A locally stored, versioned copy of a skill under library/<skill>/<version>/. The folder holds content only (it is
 * hashed); everything about it lives here, so the registry stays the single source of truth. A release is not an
 * approval: `approval` is separate from the skill's own review status and from any installation.
 */
export const releaseSchema = z.strictObject({
  skill: id,
  /** Local curated version (semantic), independent of the upstream version and commit. */
  version: z.string().regex(SEMVER, 'must be a semantic version such as 1.0.0'),
  createdAt: date,
  /** Content location, always library/<skill>/<version>. */
  path: relPath,
  /** The upstream folder this release was made from. Absent only for first-party skills. */
  upstream: z
    .strictObject({
      url,
      path: skillFolderPath,
      revision: sha,
      /** Hash of the upstream folder at `revision`, so the comparison with the curated copy is reproducible. */
      contentHash,
    })
    .optional(),
  /** Hash of the curated folder (tree.ts); equals upstream.contentHash only for an unmodified copy. */
  curatedHash: contentHash,
  license: text,
  attribution: text,
  modifications: z.array(modificationSchema).default([]),
  /** Out-of-folder links found in the content (ES22). */
  references: z.array(referenceSchema).default([]),
  review: releaseReviewSchema.default({ outcome: 'not-evaluated', checks: [], evidence: [] }),
  approval: z
    .strictObject({
      status: z.enum(RELEASE_APPROVALS),
      approvedAt: date.optional(),
      approvedBy: text.optional(),
    })
    .default({ status: 'unapproved' }),
  supportedAgents: z.array(agentSchema).default([]),
  dependencies: z.array(text).default([]),
  restrictions: z.array(text).default([]),
  notes: text.optional(),
  /** ES24: absent = public (public registry) or private (private root). A private skill's releases are never public. */
  visibility: z.enum(VISIBILITIES).optional(),
});

/* ------------------------------------------------------------------ evaluations (ES19) */

export const EVALUATION_KINDS = ['static-assessment', 'agent-run'] as const;
export const RECOMMENDATIONS = [
  'prioritize-review',
  'review',
  'static-only',
  'not-recommended',
  'keep-approved',
] as const;
/**
 * A comparative evaluation record. A static assessment reads files and measures sizes; it never claims what an agent
 * does. An agent-run evaluation must point at recorded runs in evidence.json. A recommendation is never an approval.
 */
export const evaluationSchema = z.strictObject({
  id,
  skill: id,
  kind: z.enum(EVALUATION_KINDS),
  date,
  assessor: text,
  /** The pinned revision and folder hash the assessment covers. */
  revision: sha.optional(),
  contentHash: contentHash.optional(),
  scope: text,
  security: z.array(text).default([]),
  compatibility: z.array(text).default([]),
  strengths: z.array(text).default([]),
  weaknesses: z.array(text).default([]),
  measurements: z
    .array(z.strictObject({ name: text, value: z.number(), unit: text, method: text }))
    .default([]),
  comparison: z.strictObject({
    status: z.enum(['not-run', 'run']),
    /** A: same task without the skill; B: with it; C: an approved alternative. */
    alternative: id.optional(),
    summary: text,
  }),
  /** Ids in evidence.json; required for agent runs, forbidden for static assessments. */
  evidence: z.array(id).default([]),
  recommendation: z.enum(RECOMMENDATIONS),
  blockers: z.array(text).default([]),
  notes: text.optional(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

/* ------------------------------------------------------------------ upstream checks (ES20) */

export const UPDATE_STATUSES = [
  'up-to-date',
  'update-available',
  'review-required',
  'source-unavailable',
  'check-failed',
] as const;
export type UpdateStatus = (typeof UPDATE_STATUSES)[number] | 'never-checked';

export const changeSummarySchema = z.strictObject({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
  /** Changed paths grouped by kind. */
  kinds: z.strictObject({
    instructions: z.boolean(),
    references: z.array(z.string()),
    scripts: z.array(z.string()),
    hooks: z.array(z.string()),
    dependencies: z.array(z.string()),
    licenses: z.array(z.string()),
    assets: z.array(z.string()),
    permissions: z.boolean(),
  }),
  securitySensitive: z.array(z.string()),
});
export type ChangeSummary = z.infer<typeof changeSummarySchema>;

export const upstreamCheckSchema = z.strictObject({
  skill: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** When this repository looked (ISO date-time). Not the date of any upstream change. */
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
  pinnedRevision: z.string().regex(/^[0-9a-f]{40}$/),
  latestRevision: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /** Commit date of latestRevision, when it could be read. */
  latestCommitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(UPDATE_STATUSES),
  latestContentHash: z
    .string()
    .regex(/^sha256-[0-9a-f]{64}$/)
    .optional(),
  changes: changeSummarySchema.optional(),
  detail: z.string().min(1),
});
export type UpstreamCheck = z.infer<typeof upstreamCheckSchema>;

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
  sources: z.array(sourceSchema).default([]),
  releases: z.array(releaseSchema).default([]),
  evaluations: z.array(evaluationSchema).default([]),
  updates: z.array(upstreamCheckSchema).default([]),
});

export type Release = z.infer<typeof releaseSchema>;
export type Source = z.infer<typeof sourceSchema>;
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
  sources: Source[];
  releases: Release[];
  evaluations: Evaluation[];
  updates: UpstreamCheck[];
}

/* ------------------------------------------------------------------ private access (ES24) */

/**
 * Explicit authorization of one consumer for one private skill (private root only, `registry/access.json`). It names
 * the exact versions and agents allowed; there are no wildcards and nothing is inherited from repository membership,
 * project mappings or approval. `release` is the desired version (the private counterpart of `assignment.release`)
 * and must be one of `releases`.
 */
export const accessSchema = z.strictObject({
  consumer: id,
  skill: id,
  agents: z.array(agentSchema).min(1),
  releases: z.array(z.string().regex(SEMVER, 'must be a semantic version')).min(1),
  release: z.string().regex(SEMVER, 'must be a semantic version').optional(),
  /**
   * The agents this consumer actually has linked for `release` (ES25 audit F5): written by install, upgrade and
   * rollback from the agents requested, never inferred from `agents`. Present exactly when `release` is.
   */
  activeAgents: z.array(agentSchema).min(1).optional(),
  authorizedBy: text,
  authorizedAt: date,
  note: text.optional(),
});
export type Access = z.infer<typeof accessSchema>;

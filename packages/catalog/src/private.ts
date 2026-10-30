import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative } from 'node:path';
import { loadRegistry, type LoadedRegistry } from './consumers.ts';
import { ConsumerError, isInside, kindOf } from './fsguard.ts';
import { accessSchema, type Access, type Catalog, type Visibility } from './schema.ts';
import { buildCatalog, visibilityOf } from './validate.ts';
import { distributionOf } from './policy.ts';

/*
 * Private skills (ES24). Private records never live in this repository: they live in a private root, a directory the
 * owner configures (for example a checkout of a separate private Git repository). Its layout mirrors this repository:
 *
 *   <private root>/ecosystem-skills-private.json   marker: { "schemaVersion": 1 }
 *   <private root>/registry/skills.json            private skills          (visibility defaults to "private")
 *   <private root>/registry/sources.json           private sources         (visibility defaults to "private")
 *   <private root>/registry/releases.json          private curated releases (visibility defaults to "private")
 *   <private root>/registry/access.json            consumer authorizations (accessSchema)
 *   <private root>/local/skills.json               metadata that stays on this machine (visibility "local"; git-ignore it)
 *   <private root>/library/<skill>/<version>/      private release content (same rules as library/)
 *   <private root>/external/releases/...           machine-local store and lock for private installs
 *
 * The public registry loader (loadRegistry) and the website build never read any of this. Only local commands that
 * are explicitly given a private root merge it in (loadWorkspace), and the merged result is validated with the same
 * rules as the public registry plus the private ones below.
 */

export const PRIVATE_ENV = 'ECOSYSTEM_SKILLS_PRIVATE_ROOT';
export const PRIVATE_LOCAL_FILE = 'private.local.json';
export const PRIVATE_MARKER = 'ecosystem-skills-private.json';
const FILES = {
  skills: 'registry/skills.json',
  sources: 'registry/sources.json',
  releases: 'registry/releases.json',
  access: 'registry/access.json',
  local: 'local/skills.json',
} as const;
export const ACCESS_FILE = FILES.access;

export class PrivateError extends ConsumerError {}

/**
 * Where the private root is, or undefined when none is configured (private features are then off). Sources, in
 * order: the ECOSYSTEM_SKILLS_PRIVATE_ROOT environment variable, then `root` in the git-ignored private.local.json.
 * There is no default location. The directory must be absolute, real (not a symlink), outside this repository, not the
 * home directory or a filesystem root, owned by the current user and accessible by nobody else (0700), and carry the
 * private marker file.
 */
export function resolvePrivateRoot(
  repoRoot: string,
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): string | undefined {
  let configured = env[PRIVATE_ENV]?.trim() || undefined;
  if (!configured) {
    const f = join(repoRoot, PRIVATE_LOCAL_FILE);
    if (kindOf(f) === 'missing') return undefined;
    if (kindOf(f) !== 'file')
      throw new PrivateError(`${PRIVATE_LOCAL_FILE} must be a regular file`);
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as { root?: unknown };
    if (typeof parsed.root !== 'string' || !parsed.root.trim())
      throw new PrivateError(`${PRIVATE_LOCAL_FILE} needs { "root": "<absolute path>" }`);
    configured = parsed.root.trim();
  }
  return checkPrivateRoot(repoRoot, configured, home);
}

/** The user this process runs as; undefined where the platform has no uid. */
const currentUid = (): number | undefined => process.getuid?.();

/** Permission bits a private folder or file may have: owner only (folders 0700, files 0600 or stricter). */
export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

/**
 * The private root holds authorization records, so it must belong to the user running this tool, and nobody else may
 * read, write or traverse it (ES25 audit F2). That is the strongest local identity this tool can check; it is not a
 * login (see docs/es25-ownership-distribution.md). POSIX permission bits only: on platforms without them (Windows),
 * the check cannot pass, so private roots fail closed there.
 */
function assertOwnerOnly(p: string, what: string, uid: number | undefined, dir: boolean) {
  const st = lstatSync(p);
  if (uid !== undefined && st.uid !== uid)
    throw new PrivateError(`${what} must be owned by the user running this tool`);
  if ((st.mode & 0o077) !== 0)
    throw new PrivateError(
      `${what} must be accessible only by its owner (chmod ${dir ? '700' : '600'}); group or other permissions are not allowed`,
    );
}

export function checkPrivateRoot(
  repoRoot: string,
  dir: string,
  home = homedir(),
  uid = currentUid(),
): string {
  if (!isAbsolute(dir)) throw new PrivateError('the private root must be an absolute path');
  if (kindOf(dir) === 'symlink')
    throw new PrivateError('the private root must not be a symlink; configure its real location');
  if (kindOf(dir) !== 'dir')
    throw new PrivateError('the private root is not an existing directory');
  const real = realpathSync(dir);
  if (real === parse(real).root)
    throw new PrivateError('the private root cannot be a filesystem root or the home directory');
  // every parent must resolve to itself too: a symlinked parent could redirect the root later
  if (real !== dir.replace(/\/+$/, ''))
    throw new PrivateError('the private root path contains a symlink; configure its real location');
  const repo = realpathSync(repoRoot);
  if (isInside(repo, real) || isInside(real, repo))
    throw new PrivateError(
      'the private root must be outside this public repository (and must not contain it)',
    );
  if (real === parse(real).root || (existsSync(home) && real === realpathSync(home)))
    throw new PrivateError('the private root cannot be a filesystem root or the home directory');
  assertOwnerOnly(real, 'the private root', uid, true);
  if (kindOf(join(real, PRIVATE_MARKER)) !== 'file')
    throw new PrivateError(`the private root has no ${PRIVATE_MARKER} marker file`);
  return real;
}

/** The private root shown to people: never its path. */
export const PRIVATE_LABEL = '<private root>';

interface PrivateData {
  skills: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  releases: Record<string, unknown>[];
  access: Access[];
  accessText: string;
}

function readList(
  privateRoot: string,
  rel: string,
  uid = currentUid(),
): { list: unknown[]; text: string } {
  const p = join(privateRoot, rel);
  // fixed names, and no symlinked component on the way (registry/, local/ and the file itself)
  const parent = kindOf(dirname(p));
  if (parent === 'missing') return { list: [], text: '[]\n' };
  if (parent !== 'dir')
    throw new PrivateError(`${PRIVATE_LABEL}/${dirname(rel)} must be a plain directory`);
  const k = kindOf(p);
  if (k === 'missing') return { list: [], text: '[]\n' };
  if (k !== 'file') throw new PrivateError(`${PRIVATE_LABEL}/${rel} must be a regular file`);
  // records that authorize installs are readable and writable by their owner only (ES25, audit F2)
  assertOwnerOnly(dirname(p), `${PRIVATE_LABEL}/${dirname(rel)}`, uid, true);
  assertOwnerOnly(p, `${PRIVATE_LABEL}/${rel}`, uid, false);
  let text: string;
  let list: unknown;
  try {
    text = readFileSync(p, 'utf8');
    list = JSON.parse(text) as unknown;
  } catch (e) {
    // never let a raw filesystem or parser error carry the root's absolute path to the terminal (audit F3)
    const code = (e as { code?: string }).code;
    throw new PrivateError(
      `${PRIVATE_LABEL}/${rel} cannot be read${code ? ` (${code})` : e instanceof SyntaxError ? ' (not valid JSON)' : ''}`,
    );
  }
  if (!Array.isArray(list)) throw new PrivateError(`${PRIVATE_LABEL}/${rel} must be a JSON array`);
  return { list, text };
}

/**
 * Read the private root. Every record is labelled: an unlabelled record is private (local in local/skills.json),
 * and a record labelled public is refused, because public records belong in the public registry.
 */
export function readPrivate(privateRoot: string): PrivateData {
  const label = (rel: string, list: unknown[], dflt: Visibility, allowed: Visibility[]) =>
    list.map((x, i) => {
      if (!x || typeof x !== 'object')
        throw new PrivateError(`${PRIVATE_LABEL}/${rel}[${i}] is not an object`);
      const rec = x as Record<string, unknown>;
      const v = (rec.visibility ?? dflt) as Visibility;
      if (!allowed.includes(v))
        throw new PrivateError(
          `${PRIVATE_LABEL}/${rel}[${i}]: visibility "${String(v)}" is not allowed here (${allowed.join(' or ')})`,
        );
      return { ...rec, visibility: v };
    });
  // ES25: a private skill is never open; unlabelled means restricted to explicitly authorized consumers
  const restricted = (rel: string, list: Record<string, unknown>[]) =>
    list.map((rec, i) => {
      const d = (rec.distribution ?? {
        policy: 'restricted',
        access: 'authorized-consumers',
      }) as { policy?: unknown };
      if (d.policy === 'open')
        throw new PrivateError(
          `${PRIVATE_LABEL}/${rel}[${i}]: distribution "open" is not allowed here (restricted or not-distributable)`,
        );
      return { ...rec, distribution: d };
    });
  const skills = [
    ...restricted(
      FILES.skills,
      label(FILES.skills, readList(privateRoot, FILES.skills).list, 'private', ['private']),
    ),
    ...restricted(
      FILES.local,
      label(FILES.local, readList(privateRoot, FILES.local).list, 'local', ['local']),
    ),
  ];
  const sources = label(FILES.sources, readList(privateRoot, FILES.sources).list, 'private', [
    'private',
    'local',
  ]);
  const releases = label(FILES.releases, readList(privateRoot, FILES.releases).list, 'private', [
    'private',
    'local',
  ]);
  const a = readList(privateRoot, FILES.access);
  const access = a.list.map((x, i) => {
    const r = accessSchema.safeParse(x);
    if (!r.success)
      throw new PrivateError(
        `${PRIVATE_LABEL}/${FILES.access}[${i}]: ${r.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
      );
    return r.data;
  });
  return { skills, sources, releases, access, accessText: a.text };
}

export interface Workspace {
  /** The public registry, exactly as loadRegistry returns it. */
  public: LoadedRegistry;
  /** Public plus private records; consumers carry private assignments derived from access records. */
  catalog: Catalog;
  privateRoot?: string;
  access: Access[];
  accessText: string;
}

/** Problems with access records against the merged catalog. Pure. */
export function accessProblems(catalog: Catalog, access: Access[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of access) {
    const at = `access ${a.consumer}/${a.skill}`;
    if (seen.has(`${a.consumer}/${a.skill}`)) out.push(`${at}: listed more than once`);
    seen.add(`${a.consumer}/${a.skill}`);
    const c = catalog.consumers.find((x) => x.id === a.consumer);
    const s = catalog.skills.find((x) => x.id === a.skill);
    if (!c) out.push(`${at}: unknown consumer`);
    else if (c.kind === 'global')
      out.push(`${at}: global consumers cannot be authorized for private or restricted skills`);
    if (!s) out.push(`${at}: unknown skill`);
    else if (distributionOf(s).policy === 'open')
      out.push(
        `${at}: ${a.skill} is ${visibilityOf(s)} and open; open skills are assigned in registry/consumers.json`,
      );
    else if (distributionOf(s).policy === 'not-distributable')
      out.push(`${at}: ${a.skill} is not distributable and cannot be authorized`);
    if (c)
      for (const ag of a.agents)
        if (c.agents.length && !c.agents.includes(ag))
          out.push(`${at}: agent ${ag} is not listed on the consumer`);
    for (const d of new Set(a.releases.filter((v, i) => a.releases.indexOf(v) !== i)))
      out.push(`${at}: version ${d} listed more than once`);
    for (const v of a.releases)
      if (!catalog.releases.some((r) => r.skill === a.skill && r.version === v))
        out.push(`${at}: authorizes unknown release ${a.skill}@${v}`);
    if (a.release && !a.releases.includes(a.release))
      out.push(`${at}: desired release ${a.release} is not among the authorized versions`);
    // what is activated is recorded, never inferred from what is authorized (audit F5)
    if (!!a.release !== !!a.activeAgents)
      out.push(
        `${at}: "release" and "activeAgents" go together (the version and the agents actually activated)`,
      );
    for (const d of new Set((a.activeAgents ?? []).filter((v, i, xs) => xs.indexOf(v) !== i)))
      out.push(`${at}: active agent ${d} listed more than once`);
    if (c)
      for (const ag of a.activeAgents ?? [])
        if (c.agents.length && !c.agents.includes(ag))
          out.push(`${at}: active agent ${ag} is not listed on the consumer`);
    // an active agent that is no longer in `agents` (revoked) is not an error here: it blocks further changes
    // (policy.ts) and status reports the link that is left in place
  }
  return out;
}

/**
 * The public registry merged with the private root, for local commands. Without a private root it is the public
 * registry. Throws when the merge is invalid; private ids may not collide with public ones.
 */
export function loadWorkspace(
  repoRoot: string,
  privateRoot?: string,
  overrideAccess?: Access[],
): Workspace {
  const pub = loadRegistry(repoRoot);
  if (!privateRoot) return { public: pub, catalog: pub.catalog, access: [], accessText: '[]\n' };
  const p = readPrivate(privateRoot);
  const access = overrideAccess ?? p.access;
  const publicIds = new Set(pub.catalog.skills.map((s) => s.id));
  const collisions = p.skills.map((s) => String(s.id)).filter((id) => publicIds.has(id));
  if (collisions.length)
    throw new PrivateError(
      `private skill id collides with a public skill: ${collisions.join(', ')}`,
    );
  const consumers = (pub.raw.consumers as Record<string, unknown>[]).map((c) => {
    // the derived assignment carries the agents actually activated, not every authorized agent (audit F5)
    const extra = access
      .filter((a) => a.consumer === c.id && a.release && a.activeAgents)
      .map((a) => ({
        skill: a.skill,
        agents: a.activeAgents,
        install: 'symlink',
        release: a.release,
      }));
    return extra.length
      ? { ...c, assignments: [...((c.assignments as unknown[]) ?? []), ...extra] }
      : c;
  });
  const r = buildCatalog(
    {
      ...pub.raw,
      skills: [...(pub.raw.skills as unknown[]), ...p.skills],
      sources: [...(pub.raw.sources as unknown[]), ...p.sources],
      releases: [...(pub.raw.releases as unknown[]), ...p.releases],
      consumers,
    },
    { scope: 'workspace' },
  );
  if (!r.ok) throw new PrivateError(`private records are invalid:\n  - ${r.errors.join('\n  - ')}`);
  const problems = accessProblems(r.catalog, access);
  if (problems.length)
    throw new PrivateError(`private access records are invalid:\n  - ${problems.join('\n  - ')}`);
  return { public: pub, catalog: r.catalog, privateRoot, access, accessText: p.accessText };
}

/** Where a release's content and store live: the private root for non-public releases, else this repository. */
export const contentRoot = (
  ws: Pick<Workspace, 'privateRoot'>,
  repoRoot: string,
  r: { visibility?: Visibility },
) => (visibilityOf(r) === 'public' ? repoRoot : (ws.privateRoot ?? repoRoot));

const rootForms = (privateRoot: string) => [...new Set([privateRoot, realOrSelf(privateRoot)])];

/**
 * How a path is shown to people (audit, issue 4): anything inside the private root as `<private root>/…`, structurally
 * (by path containment, never by parsing text), so names with spaces or punctuation are handled like any other.
 * Other paths are shown relative to `relTo` when given, else as they are.
 */
export function showPath(p: string, privateRoot: string | undefined, relTo?: string): string {
  if (privateRoot)
    for (const r of rootForms(privateRoot))
      for (const q of new Set([p, realOrSelf(p)])) {
        if (q === r) return PRIVATE_LABEL;
        if (isInside(r, q)) return `${PRIVATE_LABEL}/${relative(r, q)}`;
      }
  return relTo ? relative(relTo, p) : p;
}

/**
 * Remove the private root from text that may carry it in a form this tool did not format itself (filesystem error
 * messages, values passed through). Replaced: its absolute path as given and as resolved, and its path relative to
 * every base the caller names (the repository, the project, its agent folders) and to the working directory. As a
 * last line of defence any remaining `/<root folder name>` becomes `/<private root>`. Names may contain spaces.
 */
export function redactPrivate(
  text: string,
  privateRoot: string | undefined,
  bases: string[] = [],
): string {
  if (!privateRoot) return text;
  const roots = rootForms(privateRoot);
  const needles = new Set<string>(roots);
  for (const b of [...bases, process.cwd()])
    for (const base of new Set([b, realOrSelf(b)]))
      for (const r of roots) {
        const rel = relative(base, r);
        if (rel && rel !== r) needles.add(rel);
      }
  let out = text;
  for (const n of [...needles].sort((a, b) => b.length - a.length))
    if (n.length > 1) out = out.split(n).join(PRIVATE_LABEL);
  const name = basename(privateRoot);
  if (name) out = out.split(`/${name}`).join(`/${PRIVATE_LABEL}`);
  return out;
}
const realOrSelf = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

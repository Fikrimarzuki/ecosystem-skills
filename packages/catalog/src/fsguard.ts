import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class ConsumerError extends Error {}

/**
 * True when `child` is `parent` or lies inside it. Uses path.relative on already-resolved paths rather
 * than a string prefix, so `/a/bc` is not considered inside `/a/b`.
 */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export const realOrUndefined = (p: string): string | undefined => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};

export type Kind = 'missing' | 'symlink' | 'dir' | 'file' | 'other';
export function kindOf(p: string): Kind {
  try {
    const st = lstatSync(p);
    return st.isSymbolicLink()
      ? 'symlink'
      : st.isDirectory()
        ? 'dir'
        : st.isFile()
          ? 'file'
          : 'other';
  } catch {
    return 'missing';
  }
}

/** Where a symlink points, resolved lexically against the real directory that contains it. */
export function linkDestination(linkPath: string): string {
  return resolve(realpathSync(dirname(linkPath)), readlinkSync(linkPath));
}

const SKILL_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function assertSkillId(id: string): void {
  if (!SKILL_ID.test(id)) throw new ConsumerError(`unsafe skill id "${id}"`);
}

/** A consumer project root: must exist, be a real directory, and not be "/" or the home directory. */
export function resolveProjectRoot(dir: string): string {
  const real = realOrUndefined(resolve(dir));
  if (!real) throw new ConsumerError(`project directory does not exist: ${dir}`);
  if (kindOf(real) !== 'dir') throw new ConsumerError(`project path is not a directory: ${dir}`);
  if (real === resolve('/') || real === realOrUndefined(homedir()))
    throw new ConsumerError(`refusing to manage skills directly in ${real}`);
  return real;
}

export interface AgentDirState {
  /** Absolute path of the agent's skill directory inside the project. */
  path: string;
  /** Directory components that do not exist yet and would be created (outermost first). */
  toCreate: string[];
}

/**
 * Inspect `<root>/<rel>` (e.g. `.claude/skills`) component by component. Every existing component must be
 * a real directory, never a symlink, so writes cannot be redirected outside the project.
 */
export function inspectAgentDir(root: string, rel: string): AgentDirState {
  const parts = rel.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..'))
    throw new ConsumerError(`unsafe agent directory "${rel}"`);
  let cur = root;
  const toCreate: string[] = [];
  for (const part of parts) {
    cur = join(cur, part);
    const k = kindOf(cur);
    if (k === 'missing') toCreate.push(cur);
    else if (toCreate.length) throw new ConsumerError(`inconsistent directory state at ${cur}`);
    else if (k === 'symlink')
      throw new ConsumerError(`unsafe: ${cur} is a symlink; refusing to write through it`);
    else if (k !== 'dir') throw new ConsumerError(`unsafe: ${cur} exists and is not a directory`);
  }
  if (!toCreate.length && realOrUndefined(cur) !== cur)
    throw new ConsumerError(`unsafe: ${cur} does not resolve to itself`);
  return { path: cur, toCreate };
}

/**
 * Serialize JSON the way Prettier formats this repo's registry files: objects expanded, arrays of
 * scalars on one line when they fit within 100 columns, everything else expanded.
 */
export function formatJson(value: unknown, width = 100): string {
  const fmt = (v: unknown, indent: string, prefix: number): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    const inner = indent + '  ';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (v.every((x) => x === null || typeof x !== 'object')) {
        const flat = `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
        if (prefix + flat.length + 1 <= width) return flat;
      }
      return `[\n${v.map((x) => inner + fmt(x, inner, inner.length)).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return '{}';
    return `{\n${entries
      .map(([k, x]) => {
        const head = `${inner}${JSON.stringify(k)}: `;
        return head + fmt(x, inner, head.length);
      })
      .join(',\n')}\n${indent}}`;
  };
  return fmt(value, '', 0) + '\n';
}

export interface AtomicWriteOptions {
  /** The file content this write was computed from; the write is refused if the file changed since. */
  expectedCurrent?: string;
  /** Test hook, called after the temp file is durable and before the rename. */
  beforeRename?: (tmpPath: string) => void;
}

/** Write via a fsynced temp file in the same directory and an atomic rename; never leaves a partial file. */
export function writeFileAtomic(
  file: string,
  content: string,
  opts: AtomicWriteOptions = {},
): void {
  const tmp = join(
    dirname(file),
    `.${basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = openSync(tmp, 'wx', 0o644);
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    opts.beforeRename?.(tmp);
    if (opts.expectedCurrent !== undefined) {
      const now = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
      if (now !== opts.expectedCurrent)
        throw new ConsumerError(
          `${basename(file)} changed while this command was running; nothing was written`,
        );
    }
    renameSync(tmp, file);
  } catch (e) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
}

export interface ProjectIdentity {
  /** Git state, read from the filesystem only (no git process). */
  git: 'repository-root' | 'inside-repository' | 'not-a-repository';
  branch?: string;
  /** Short commit when HEAD is detached. */
  detached?: string;
  /** Repository root when the project is inside (but not at) a repository. */
  repoRoot?: string;
}

function readHead(gitDir: string): Pick<ProjectIdentity, 'branch' | 'detached'> {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref: refs\/heads\/(.+)$/);
    return m
      ? { branch: m[1] }
      : /^[0-9a-f]{40}$/.test(head)
        ? { detached: head.slice(0, 12) }
        : {};
  } catch {
    return {};
  }
}

function gitDirOf(dir: string): string | undefined {
  const dotGit = join(dir, '.git');
  const k = kindOf(dotGit);
  if (k === 'dir') return dotGit;
  if (k === 'file') {
    const m = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m); // worktrees and submodules
    return m ? resolve(dir, m[1]!.trim()) : undefined;
  }
  return undefined;
}

/** Describe which repository a consumer path is, so a command can show what it is about to modify. */
export function identifyProject(root: string): ProjectIdentity {
  const own = gitDirOf(root);
  if (own) return { git: 'repository-root', ...readHead(own) };
  for (let d = dirname(root); d !== dirname(d); d = dirname(d)) {
    const g = gitDirOf(d);
    if (g) return { git: 'inside-repository', repoRoot: d, ...readHead(g) };
  }
  return { git: 'not-a-repository' };
}

export function describeIdentity(id: ProjectIdentity): string {
  const head = id.branch
    ? `branch ${id.branch}`
    : id.detached
      ? `detached HEAD ${id.detached}`
      : 'unknown HEAD';
  if (id.git === 'repository-root') return `${head} (repository root)`;
  if (id.git === 'inside-repository')
    return `${head}; WARNING: not the repository root (root is ${id.repoRoot})`;
  return 'WARNING: not a git repository';
}

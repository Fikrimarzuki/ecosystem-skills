import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  type Stats,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/*
 * ES23 evaluation isolation. An agent under evaluation runs in a disposable Docker container:
 *
 *   - filesystem: only a fresh copy of a synthetic fixture is mounted (read-write at /work); the image root is
 *     read-only; HOME, the agent config directory and /tmp are empty tmpfs; no host path, no Docker socket.
 *   - network: the container sits on an `--internal` Docker network (no route out). Its only way out is the egress
 *     proxy (egress-proxy.mjs), which allows HTTPS CONNECT to the model API host of that agent and nothing else, and
 *     logs every attempt (allowed or denied) so unauthorized requests are observed rather than assumed absent.
 *   - identity: non-root user, all capabilities dropped, no-new-privileges, memory/CPU/PID limits, a wall-clock
 *     timeout, and an agent turn limit as the token budget.
 *   - credentials: only a DEDICATED evaluation key, read from a file the owner names in ES23_EVAL_*_KEY_FILE.
 *     Personal logins (macOS keychain, ~/.claude, ~/.codex/auth.json) are never read or mounted.
 *   - configuration: fresh agent config per run (no user settings, hooks, plugins, MCP servers or skills from the
 *     host); the only skill present is the candidate, placed by the harness in arm B.
 *
 * Nothing here runs an agent. `liveBlockers` lists what stands in the way of a live run.
 */

export type EvalAgent = 'claude-code' | 'codex';

/** Model API hosts each agent needs, and nothing else. Telemetry and update checks are disabled, not allowed. */
export const EGRESS_ALLOWLIST: Record<EvalAgent, string[]> = {
  'claude-code': ['api.anthropic.com'],
  codex: ['api.openai.com'],
};

/** Environment that turns off non-essential agent traffic and auto-updates inside the container. */
export const AGENT_ENV: Record<EvalAgent, Record<string, string>> = {
  'claude-code': {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CONFIG_DIR: '/home/agent/.claude',
  },
  codex: { CODEX_HOME: '/home/agent/.codex' },
};

export interface Budget {
  /** Wall-clock limit for one run. */
  timeoutSeconds: number;
  /** Agent turns (Claude Code --max-turns); the token budget proxy. */
  maxTurns: number;
  memory: string;
  cpus: string;
  pids: number;
}
export const DEFAULT_BUDGET: Budget = {
  timeoutSeconds: 600,
  maxTurns: 30,
  memory: '2g',
  cpus: '2',
  pids: 256,
};

export interface RunSpec {
  name: string;
  image: string;
  network: string;
  proxy: string;
  /** Fresh fixture copy for this run (host path), mounted at /work. */
  workspace: string;
  agent: EvalAgent;
  budget?: Budget;
  command: string[];
  /** Extra environment (never a credential: credentials go through --env-file, see credentialEnvFile). */
  env?: Record<string, string>;
  /** A 0600 file holding only the evaluation key variable, created by the harness for one run. */
  envFile?: string;
}

/** `docker run` arguments for one isolated run. Pure: builds the arguments, runs nothing. */
export function dockerRunArgs(s: RunSpec): string[] {
  const b = s.budget ?? DEFAULT_BUDGET;
  const env = {
    HOME: '/home/agent',
    HTTPS_PROXY: s.proxy,
    HTTP_PROXY: s.proxy,
    NO_PROXY: '',
    NPM_CONFIG_OFFLINE: 'true',
    ...AGENT_ENV[s.agent],
    ...s.env,
  };
  return [
    'run',
    '--rm',
    '--name',
    s.name,
    '--network',
    s.network,
    '--read-only',
    '--user',
    '1000:1000',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--memory',
    b.memory,
    '--memory-swap',
    b.memory,
    '--cpus',
    b.cpus,
    '--pids-limit',
    String(b.pids),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=256m',
    '--tmpfs',
    '/home/agent:rw,nosuid,size=256m,uid=1000,gid=1000',
    '--mount',
    `type=bind,source=${s.workspace},target=/work`,
    '--workdir',
    '/work',
    ...Object.entries(env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
    ...(s.envFile ? ['--env-file', s.envFile] : []),
    '--stop-timeout',
    '5',
    s.image,
    'timeout',
    String(b.timeoutSeconds),
    ...s.command,
  ];
}

const SECRETISH = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;

/** Problems with a docker argument list; empty means it meets the isolation policy above. */
export function isolationProblems(args: string[], opts: { home?: string } = {}): string[] {
  const home = opts.home ?? homedir();
  const out: string[] = [];
  const has = (flag: string, value?: string) =>
    args.some((a, i) => a === flag && (value === undefined || args[i + 1] === value));
  const values = (flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : []));
  if (!has('--read-only')) out.push('root filesystem is not read-only');
  if (!has('--cap-drop', 'ALL')) out.push('capabilities are not all dropped');
  if (!has('--security-opt', 'no-new-privileges')) out.push('no-new-privileges is not set');
  if (values('--user').some((u) => u.startsWith('0')) || !has('--user'))
    out.push('container does not run as a non-root user');
  for (const f of ['--memory', '--cpus', '--pids-limit']) if (!has(f)) out.push(`no ${f} limit`);
  if (!args.includes('timeout')) out.push('no wall-clock timeout');
  const net = values('--network');
  if (net.length !== 1 || ['host', 'bridge', 'default'].includes(net[0]!))
    out.push(`network must be a single internal network, got ${net.join(', ') || 'none given'}`);
  if (has('--privileged')) out.push('privileged container');
  for (const f of ['-v', '--volume']) if (has(f)) out.push(`${f} is not allowed; use --mount`);
  for (const m of values('--mount')) {
    const src = /source=([^,]+)/.exec(m)?.[1] ?? '';
    const tgt = /target=([^,]+)/.exec(m)?.[1] ?? '';
    if (tgt !== '/work') out.push(`unexpected mount target ${tgt}`);
    if (/docker\.sock/.test(src)) out.push('Docker socket is mounted');
    if (src === home || (isAbsolute(src) && !relative(home, src).startsWith('..') && !isTmp(src)))
      out.push(`mount source ${src} is inside the home directory`);
  }
  for (const e of values('--env')) {
    const [k] = e.split('=');
    if (k && SECRETISH.test(k))
      out.push(`credential-like variable ${k} passed on the command line`);
  }
  return out;
}
const isTmp = (p: string) => /^\/(private\/)?(tmp|var\/folders)\//.test(p);

/** Personal credential locations the harness must never read, mount or forward. */
export function personalCredentialPaths(home = homedir()): string[] {
  return [
    join(home, '.claude'),
    join(home, '.claude.json'),
    join(home, '.codex'),
    join(home, '.config'),
    join(home, '.ssh'),
    join(home, '.aws'),
    join(home, '.npmrc'),
    join(home, 'Library', 'Keychains'),
  ];
}

export const KEY_FILE_ENV: Record<EvalAgent, string> = {
  'claude-code': 'ES23_EVAL_ANTHROPIC_KEY_FILE',
  codex: 'ES23_EVAL_OPENAI_KEY_FILE',
};

const within = (p: string, roots: string[]) =>
  roots.some((c) => p === c || (!relative(c, p).startsWith('..') && !isAbsolute(relative(c, p))));

/** The real location of a path whose last component may be missing: every parent is resolved through symlinks. */
function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    try {
      return join(realpathSync(dirname(p)), basename(p));
    } catch {
      return p;
    }
  }
}

/** Problems with the key file's metadata; shared by the check and by the read, which repeats it on the open file. */
function keyFileProblem(v: string, st: Stats): string | undefined {
  if (!st.isFile()) return `${v} is not a regular file`;
  if ((st.mode & 0o077) !== 0) return `${v} must not be readable by others (chmod 600)`;
  // a second hard link could make a personal credential file look like a dedicated one
  if (st.nlink !== 1) return `${v} has other hard links; use a dedicated file`;
  return undefined;
}

/**
 * Why the dedicated key for `agent` cannot be used; undefined when it can. Reads only file metadata, never content.
 * Paths are checked as given and as they really resolve (ES25 audit F4): a symlinked folder anywhere on the way, a
 * symlink as the file, or a hard link cannot reach a personal credential location, and the path must name the file
 * by its real location, so nothing on the way can be re-pointed between this check and the read.
 */
export function credentialProblem(
  agent: EvalAgent,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string | undefined {
  const v = KEY_FILE_ENV[agent];
  const file = env[v];
  if (!file)
    return `no dedicated evaluation credential: set ${v} to a file holding an evaluation-only API key (separate from personal logins, with a spend limit, revocable after the pilot)`;
  const p = resolve(file);
  const personal = personalCredentialPaths(home);
  const real = canonical(p);
  if (within(p, personal) || within(real, [...personal, ...personal.map(canonical)]))
    return `${v} points into a personal credential location; use a dedicated evaluation key file`;
  if (real !== p)
    return `${v} must name the key file by its real path (no symlinked folder or file on the way)`;
  let st: Stats;
  try {
    st = lstatSync(p);
  } catch {
    return `${v} is not a regular file`;
  }
  return keyFileProblem(v, st);
}

export interface LiveContext {
  docker: boolean;
  /** Result of verify.ts: every isolation probe passed. */
  isolationVerified: boolean;
  /** The agent CLI is available inside the evaluation image at a pinned version. */
  agentImage: boolean;
  /** The owner authorized live runs and their cost. */
  ownerAuthorized: boolean;
  /** The candidate's release review (instructions and supporting files) is complete and not blocking. */
  reviewed: boolean;
}

export function liveBlockers(agent: EvalAgent, c: LiveContext, env = process.env): string[] {
  const out: string[] = [];
  if (!c.docker) out.push('Docker is not available');
  if (!c.isolationVerified) out.push('isolation has not been verified (run evals/es23/verify.ts)');
  if (!c.agentImage)
    out.push(
      `no evaluation image with a pinned ${agent} CLI (built only after owner authorization)`,
    );
  const cred = credentialProblem(agent, env);
  if (cred) out.push(cred);
  if (!c.reviewed) out.push('the candidate has not passed its release security review');
  if (!c.ownerAuthorized) out.push('the owner has not authorized live runs and their cost');
  return out;
}

/** Test hooks that let a test change the filesystem at the exact moments a race would. They disable nothing. */
export interface ReadHooks {
  beforeOpen?: () => void;
  afterOpen?: () => void;
}

/**
 * Reads one KEY=value line for the agent's API key from the dedicated file; used only after liveBlockers is empty.
 *
 * Bound to one file identity (audit, issue 5): the file is opened first (never through a symlink as its last
 * component), and only then is the path checked again: it must still pass every credential rule (real path, no
 * symlinked folder on the way, not a personal location) and must still name exactly the opened file (same device and
 * inode), which has a single link and owner-only permissions. A folder swapped before the open, or swapped back after
 * it, therefore fails one of those checks and nothing is returned. Node has no openat(), so this re-validation after
 * the open stands in for descriptor-relative access; where O_NOFOLLOW does not exist (Windows), reading fails closed.
 */
export function readEvalKey(
  agent: EvalAgent,
  env = process.env,
  home = homedir(),
  hooks: ReadHooks = {},
): string {
  const noFollow = constants.O_NOFOLLOW;
  if (noFollow === undefined)
    throw new Error(
      'this platform cannot open the key file safely (no O_NOFOLLOW); live runs stay blocked',
    );
  const problem = credentialProblem(agent, env, home);
  if (problem) throw new Error(problem);
  const v = KEY_FILE_ENV[agent];
  const p = resolve(env[v]!);
  hooks.beforeOpen?.();
  const fd = openSync(p, constants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(fd);
    const bad = keyFileProblem(v, opened);
    if (bad) throw new Error(`${bad}; nothing was read`);
    hooks.afterOpen?.();
    const again = credentialProblem(agent, env, home);
    if (again) throw new Error(`${again}; nothing was read`);
    const there = lstatSync(p);
    if (there.dev !== opened.dev || there.ino !== opened.ino)
      throw new Error(`${v} changed while it was being opened; nothing was read`);
    return readFileSync(fd, 'utf8').trim();
  } finally {
    closeSync(fd);
  }
}

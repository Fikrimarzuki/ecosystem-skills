import { resolve } from 'node:path';

export class UsageError extends Error {}

/**
 * pnpm runs the CLI from packages/catalog, so a relative path typed by the user is resolved against INIT_CWD,
 * not the process working directory. For the root `pnpm skills:*` scripts pnpm sets INIT_CWD to the workspace
 * root, even when pnpm is started from a subfolder, so relative paths are relative to the repository root.
 */
export function resolveUserPath(
  p: string,
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  return resolve(env.INIT_CWD || cwd, p);
}

interface Spec {
  /** Name as typed by the user. */
  script: string;
  summary: string;
  usage: string[];
  /** Most positional arguments the command accepts; extra ones are rejected, never ignored. */
  maxArgs: number;
  /** Flags that take no value / flags that take one. Anything else is rejected, never ignored. */
  flags: string[];
  valueFlags: string[];
  notes: string[];
  examples: string[];
}

const CONSUMER_NOTE =
  '<consumer-id> is an id from registry/consumers.json (see: pnpm skills:list --consumers), not a folder.';
const LOCATION_NOTE =
  'Where the project lives comes from --project <dir>, or from the git-ignored consumers.local.json (see consumers.local.example.json). Relative paths, like those in consumers.local.json, are relative to the repository root. When the file has an entry for the consumer, --project must point to that same folder.';

export const SPECS: Record<string, Spec> = {
  validate: {
    script: 'pnpm catalog:validate',
    maxArgs: 0,
    summary: 'Check the whole registry (skills, consumers, integrations, evidence). Read-only.',
    usage: ['pnpm catalog:validate'],
    flags: [],
    valueFlags: [],
    notes: ['Exits 1 and lists every problem if the registry is invalid.'],
    examples: [],
  },
  build: {
    script: 'pnpm catalog:build',
    maxArgs: 0,
    summary:
      'Validate, then write the public catalog the website reads (apps/web/public/catalog.json).',
    usage: ['pnpm catalog:build'],
    flags: [],
    valueFlags: [],
    notes: ['The generated file is git-ignored and contains no local paths.'],
    examples: [],
  },
  library: {
    script: 'pnpm skills:library',
    maxArgs: 16,
    summary:
      'Inspect and verify the curated library (library/<skill>/<version>), compare a release with upstream, or stage content.',
    usage: [
      'pnpm skills:library list',
      'pnpm skills:library verify',
      'pnpm skills:library compare <skill-id> [--version <x.y.z>] [--upstream-dir <folder>]',
      'pnpm skills:library stage <skill-id> <x.y.z> --from <folder>',
      'pnpm skills:library review <skill-id> [--version <x.y.z>] [--json]',
      'pnpm skills:library install <consumer-id> <skill-id> --version <x.y.z> [--project <dir>] [--agents a,b] [--apply]',
      'pnpm skills:library upgrade <consumer-id> <skill-id> --to <x.y.z> [--migrate] [--project <dir>] [--apply]',
      'pnpm skills:library rollback <consumer-id> <skill-id> --to <x.y.z>|legacy [--project <dir>] [--apply]',
      'pnpm skills:library status [<consumer-id>] [--project <dir>]',
      'pnpm skills:library check-upstream <skill-id>... | --source <source-id> | --all [--limit <n>] [--delay <ms>] [--write]',
      'pnpm skills:library prepare <skill-id> --version <x.y.z> [--revision <sha>] [--apply]',
    ],
    flags: ['--json', '--apply', '--migrate', '--all', '--write'],
    valueFlags: [
      '--version',
      '--upstream-dir',
      '--from',
      '--project',
      '--agents',
      '--to',
      '--source',
      '--limit',
      '--delay',
      '--revision',
    ],
    notes: [
      'list and verify are read-only. verify checks every release folder against its recorded hash, rejects symlinks and untracked folders, and (when git is available) that existing releases are unchanged since HEAD.',
      "compare downloads the release's pinned upstream folder as data (or uses --upstream-dir) and lists added, removed and changed files, flagging any difference the release does not declare. Nothing is executed.",
      'install previews by default and changes nothing; --apply performs exactly the previewed plan. Only an approved release with a recorded clean security review and no blockers can be installed. It copies the release from library/ into the machine-local store external/releases, records the pinned version in registry/consumers.json, links the consumer, and tracks the install in external/releases.lock.json. Any failure rolls every step back. It never downloads anything and never runs bundled files.',
      'stage copies a prepared folder into the library atomically and never overwrites an existing version. It writes content only: the registry record, its security review and any approval are separate, deliberate edits. Staged content is NOT approved and cannot be installed.',
    ],
    examples: ['pnpm skills:library verify', 'pnpm skills:library compare grilling'],
  },
  links: {
    script: 'pnpm skills:links',
    maxArgs: Infinity,
    summary:
      'Low-level, read-only check of one project folder: are skills linked into .claude/.agents?',
    usage: ['pnpm skills:links <project-dir> [skill-id ...]'],
    flags: [],
    valueFlags: [],
    notes: [
      'Prefer skills:verify <consumer-id>, which also checks installs and hashes.',
      'Exits 1 unless every checked skill is linked.',
    ],
    examples: ['pnpm skills:links ../my-app grilling'],
  },
  review: {
    script: 'pnpm skills:review',
    maxArgs: 1,
    summary:
      'Download a third-party skill at its pinned revision and print a heuristic scan. Nothing is run.',
    usage: ['pnpm skills:review <skill-id>', 'pnpm skills:review --dir <folder>'],
    flags: [],
    valueFlags: ['--dir'],
    notes: [
      'The download goes to the git-ignored external/.review folder, as data only.',
      'The scan flags patterns worth reading (network, shell, credentials, hidden text). It is not a verdict and never edits the registry. Reading the files is still required.',
      '--dir scans a folder you already have.',
    ],
    examples: ['pnpm skills:review caveman'],
  },
  install: {
    script: 'pnpm skills:install',
    maxArgs: 1,
    summary: 'Copy an APPROVED third-party skill into external/skills at its pinned revision.',
    usage: ['pnpm skills:install <skill-id> [--replace]'],
    flags: ['--replace'],
    valueFlags: [],
    notes: [
      'Refuses skills that are not approved. Checks the content hash against the reviewed hash.',
      'Downloads a tarball and extracts only the registered skill folder. No upstream script runs.',
      'Installing does not assign or activate the skill. --replace keeps the previous copy for rollback.',
    ],
    examples: ['pnpm skills:install grilling'],
  },
  rollback: {
    script: 'pnpm skills:rollback',
    maxArgs: 1,
    summary: 'Restore the previous installed copy of a skill (kept by install --replace).',
    usage: ['pnpm skills:rollback <skill-id>'],
    flags: [],
    valueFlags: [],
    notes: ['Only changes external/skills and external/installed.json.'],
    examples: ['pnpm skills:rollback grilling'],
  },
  uninstall: {
    script: 'pnpm skills:uninstall',
    maxArgs: 1,
    summary: 'Remove an installed skill (moved to external/.backups, not deleted).',
    usage: ['pnpm skills:uninstall <skill-id>'],
    flags: [],
    valueFlags: [],
    notes: [
      'Does not touch the registry or any consumer. Consumer links to it will then fail skills:verify; unassign and sync --prune first.',
    ],
    examples: ['pnpm skills:uninstall grilling'],
  },
  status: {
    script: 'pnpm skills:status',
    maxArgs: 0,
    summary: 'List third-party skills installed on this machine, and whether each matches its pin.',
    usage: ['pnpm skills:status'],
    flags: [],
    valueFlags: [],
    notes: ['Read-only. "Installed" says nothing about assignment, activation or agent behavior.'],
    examples: [],
  },
  visibility: {
    script: 'pnpm skills:visibility',
    maxArgs: 1,
    summary:
      'Show the skills available in this local context: visibility, ownership, distribution, review, releases and which consumers may use each; or explain whether one consumer may install one skill. Read-only.',
    usage: [
      'pnpm skills:visibility',
      'pnpm skills:visibility <skill-id>',
      'pnpm skills:visibility <skill-id> --consumer <consumer-id> [--version <x.y.z>] [--agents a,b]',
    ],
    flags: [],
    valueFlags: ['--consumer', '--version', '--agents'],
    notes: [
      '--consumer explains the managed-install decision for that consumer: distribution, authorization, consumer ownership and the release gate, with the exact reason for every refusal. It is the same decision the installer makes; there is no flag that overrides it.',
      'Private skills appear only when a private root is configured (ECOSYSTEM_SKILLS_PRIVATE_ROOT, or "root" in the git-ignored private.local.json). Its path is never printed.',
      'With a private root, also checks the private records, access records and private library folders.',
      'Visibility, approval and consumer authorization are separate: a private skill is not approved, and an approved one is not available to every consumer.',
    ],
    examples: [
      'pnpm skills:visibility ecosystem-config',
      'pnpm skills:visibility ecosystem-config --consumer gateway',
    ],
  },
  map: {
    script: 'pnpm skills:map',
    maxArgs: 1,
    summary:
      'Show each project with its skills, its Ecosystem Config project and its asset and config sources. Read-only.',
    usage: ['pnpm skills:map [<consumer-id>]', 'pnpm skills:map [<consumer-id>] --validate'],
    flags: ['--validate'],
    valueFlags: [],
    notes: [
      CONSUMER_NOTE,
      '--validate looks for local checkouts of the sources (next to this repository under their current or former name, or in the git-ignored sources.local.json) and checks their documented files and project ids. Nothing is cloned or changed.',
      'A mapping is a reference only: it grants no permission to read, edit or install anything.',
    ],
    examples: ['pnpm skills:map gateway --validate'],
  },
  list: {
    script: 'pnpm skills:list',
    maxArgs: 0,
    summary: 'Show skills, consumers, and what is assigned where. Read-only.',
    usage: [
      'pnpm skills:list',
      'pnpm skills:list --consumers',
      'pnpm skills:list --consumer <consumer-id> [--project <dir>]',
    ],
    flags: ['--consumers'],
    valueFlags: ['--consumer', '--project'],
    notes: [
      'With no option: every skill, with source, review status, whether it is installed here, and its consumers.',
      '--consumer shows one consumer: each assignment, install check, and per-agent link state (when a location is known).',
      CONSUMER_NOTE,
      LOCATION_NOTE,
      'Link state is a filesystem check. It is not evidence that an agent loads or follows the skill.',
    ],
    examples: ['pnpm skills:list --consumer my-app --project ../my-app'],
  },
  assign: {
    script: 'pnpm skills:assign',
    maxArgs: 2,
    summary: 'Record in the registry that a consumer should have a skill (desired state only).',
    usage: [
      'pnpm skills:assign <consumer-id> <skill-id> [--agents claude-code,codex] [--install symlink|copy] [--dry-run]',
    ],
    flags: ['--dry-run'],
    valueFlags: ['--agents', '--install'],
    notes: [
      'Writes registry/consumers.json only. It installs nothing and creates no links; run skills:sync for that.',
      'Third-party skills must be approved. The new assignment starts as verification "unverified".',
      '--dry-run validates the whole registry with the change and prints it, but writes nothing.',
      "--agents defaults to the consumer's agents; --install defaults to symlink (copy is for hosts without reliable symlinks).",
      CONSUMER_NOTE,
    ],
    examples: [
      'pnpm skills:assign my-app grilling --dry-run',
      'pnpm skills:assign my-app grilling --agents claude-code,codex',
    ],
  },
  unassign: {
    script: 'pnpm skills:unassign',
    maxArgs: 2,
    summary: 'Remove an assignment from the registry. Installed files and project links stay.',
    usage: ['pnpm skills:unassign <consumer-id> <skill-id> [--project <dir>] [--dry-run]'],
    flags: ['--dry-run'],
    valueFlags: ['--project'],
    notes: [
      'Changes desired state only. A link left in the project is reported as DRIFT; remove it with skills:sync <consumer-id> --prune.',
      '--project (or consumers.local.json) is only used to look for that leftover link.',
      '--dry-run writes nothing.',
      CONSUMER_NOTE,
    ],
    examples: ['pnpm skills:unassign my-app grilling --dry-run'],
  },
  sync: {
    script: 'pnpm skills:sync',
    maxArgs: 1,
    summary: "Make a project's .claude/skills and .agents/skills links match its assignments.",
    usage: ['pnpm skills:sync <consumer-id> [--project <dir>] [--dry-run] [--prune]'],
    flags: ['--dry-run', '--prune'],
    valueFlags: ['--project'],
    notes: [
      'This is the step that activates a skill: it creates relative links (or verified copies) in the project.',
      'Run with --dry-run first. It prints the consumer, the project folder and git branch, and every change it would make, then writes nothing.',
      'It stops without changing anything if any entry is a conflict. It only touches links it owns.',
      '--prune also removes owned links for skills that are no longer assigned.',
      CONSUMER_NOTE,
      LOCATION_NOTE,
      'Links show a skill is exposed to an agent. They do not show the agent used it correctly.',
    ],
    examples: [
      'pnpm skills:sync my-app --dry-run',
      'pnpm skills:sync my-app --project ../my-app',
      'pnpm skills:sync my-app --prune --dry-run',
    ],
  },
  verify: {
    script: 'pnpm skills:verify',
    maxArgs: 1,
    summary: "Check a consumer's links and installs against its assignments. Read-only.",
    usage: ['pnpm skills:verify <consumer-id> [--project <dir>]'],
    flags: [],
    valueFlags: ['--project'],
    notes: [
      'Checks the filesystem and content hashes only; exits 1 on any error.',
      'It does not run an agent. Whether an agent loads or follows a skill is recorded separately, as evidence in registry/evidence.json.',
      CONSUMER_NOTE,
      LOCATION_NOTE,
    ],
    examples: ['pnpm skills:verify my-app', 'pnpm skills:verify my-app --project ../my-app'],
  },
};

export function helpText(command: string): string {
  const s = SPECS[command];
  if (!s) return '';
  const out = [`${s.script} — ${s.summary}`, '', 'Usage', ...s.usage.map((u) => `  ${u}`)];
  if (s.notes.length) out.push('', 'Notes', ...s.notes.map((n) => `  - ${n}`));
  if (s.examples.length) out.push('', 'Examples', ...s.examples.map((e) => `  ${e}`));
  out.push('', 'Add --help to any skills command to see this. Full guide: docs/consumers.md');
  return out.join('\n');
}

export interface Parsed {
  help: boolean;
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
}

/**
 * Strict parsing: an unknown option or a value option without a value is an error. Silently ignoring a
 * mistyped `--dry-run` would turn a preview into a real write.
 */
export function parseArgs(command: string, argv: string[]): Parsed {
  const spec = SPECS[command];
  const out: Parsed = { help: false, positional: [], flags: new Set(), values: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a.startsWith('-') && a.length > 1) {
      if (spec?.flags.includes(a)) out.flags.add(a);
      else if (spec?.valueFlags.includes(a)) {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--'))
          throw new UsageError(`${a} needs a value (for example: ${a} <value>)`);
        // An empty value (e.g. an unset shell variable) must not fall back to a default location.
        if (!v.trim()) throw new UsageError(`${a} was given an empty value`);
        out.values.set(a, v);
        i++;
      } else {
        const known = [...(spec?.flags ?? []), ...(spec?.valueFlags ?? [])];
        throw new UsageError(
          `unknown option ${a} for ${command}${known.length ? `; options: ${known.join(', ')}` : '; it takes no options'}`,
        );
      }
    } else {
      out.positional.push(a);
    }
  }
  if (spec && out.positional.length > spec.maxArgs) {
    const extra = out.positional[spec.maxArgs]!;
    const asFlag = [...spec.flags, ...spec.valueFlags].find(
      (f) => f.slice(2) === extra.replace(/^-+/, ''),
    );
    throw new UsageError(
      `unexpected extra argument "${extra}" for ${command}${asFlag ? ` (did you mean ${asFlag}?)` : ''}; usage: ${spec.usage[0]}`,
    );
  }
  return out;
}

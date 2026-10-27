import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchForReview,
  installSkill,
  InstallError,
  installStatus,
  rollbackSkill,
  uninstallSkill,
} from './install.ts';
import { helpText, parseArgs, resolveUserPath, SPECS, UsageError } from './cliargs.ts';
import { checkLinks } from './links.ts';
import {
  assignSkill,
  findConsumer,
  loadRegistry,
  LOCATIONS_FILE,
  resolveConsumerLocation,
  unassignSkill,
} from './consumers.ts';
import { ConsumerError, describeIdentity, identifyProject } from './fsguard.ts';
import { applySync, planSync, resolveCanonical, verifyConsumer, type PlanItem } from './sync.ts';
import type { Agent } from './schema.ts';
import { formatReview, reviewTree } from './review.ts';
import { buildCatalog, catalogToJson } from './validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = (name: string) =>
  JSON.parse(readFileSync(resolve(root, 'registry', `${name}.json`), 'utf8')) as unknown;

const COMMANDS = [
  'validate',
  'build',
  'links',
  'review',
  'install',
  'rollback',
  'uninstall',
  'status',
  'list',
  'assign',
  'unassign',
  'sync',
  'verify',
];
const command = process.argv[2] ?? '';
if (!COMMANDS.includes(command)) {
  console.error(`usage: cli.ts <${COMMANDS.join('|')}> [args]`);
  process.exit(2);
}
// Parse (and answer --help) before reading the registry, so help works even when the registry is broken.
let parsed: ReturnType<typeof parseArgs>;
try {
  parsed = parseArgs(command, process.argv.slice(3));
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  console.error(`ERROR: ${e.message}\nRun with --help for usage and examples.`);
  process.exit(2);
}
if (parsed.help) {
  console.log(helpText(command));
  process.exit(0);
}
const usageFail = (what?: string): never => {
  console.error(
    `${what ? `ERROR: ${what}\n` : ''}Usage:\n${SPECS[command]!.usage.map((u) => `  ${u}`).join('\n')}\nRun with --help for notes and examples.`,
  );
  return process.exit(2);
};

const result = buildCatalog({
  skills: readJson('skills'),
  consumers: readJson('consumers'),
  integrations: readJson('integrations'),
  evidence: existsSync(resolve(root, 'registry', 'evidence.json')) ? readJson('evidence') : [],
});

if (!result.ok) {
  console.error(`Registry invalid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const { catalog } = result;
const summary = `${catalog.skills.length} skills, ${catalog.consumers.length} consumers, ${catalog.integrations.length} integrations, ${catalog.evidence.length} evidence records`;

const skillArg = () => {
  const id = parsed.positional[0];
  if (!id) return usageFail('missing <skill-id>');
  const skill = catalog.skills.find((s) => s.id === id);
  if (!skill) return usageFail(`unknown skill id "${id}" (list them with: pnpm skills:list)`);
  return skill;
};

async function external(): Promise<void> {
  if (command === 'review') {
    // Downloads (or uses --dir) and prints a heuristic scan. Never executes content, never edits the registry.
    const given = parsed.values.get('--dir');
    const dir = given ? resolveUserPath(given) : await fetchForReview(root, skillArg(), fetch);
    console.log(formatReview(reviewTree(dir)));
  } else if (command === 'install') {
    const r = await installSkill(root, skillArg(), fetch, {
      replace: parsed.flags.has('--replace'),
    });
    console.log(r.status + (r.backup ? ` (previous copy kept for rollback)` : ''));
  } else if (command === 'rollback') {
    const e = rollbackSkill(root, skillArg().id);
    console.log(`restored ${e.revision}`);
  } else if (command === 'uninstall') {
    uninstallSkill(root, skillArg().id);
    console.log('uninstalled (moved to external/.backups)');
  } else {
    const rows = installStatus(root);
    if (!rows.length) console.log('no external skills installed');
    for (const r of rows) {
      const pinned = catalog.skills.find((s) => s.id === r.id);
      const drift =
        pinned?.source.type === 'external' && pinned.source.revision !== r.revision
          ? ' (registry pins a different revision)'
          : '';
      console.log(`${r.state.padEnd(10)} ${r.id} @ ${r.revision.slice(0, 12)}${drift}`);
    }
  }
}

// ---- consumer management (ES9.1) ----
const flag = (n: string) => parsed.flags.has(n);
const value = (n: string) => parsed.values.get(n);
/** --project as typed, resolved against INIT_CWD (the repository root for the pnpm skills:* scripts). */
const projectArg = () => {
  const p = value('--project');
  return p ? resolveUserPath(p) : undefined;
};
const positional = parsed.positional;
const dryRun = flag('--dry-run');

function location(consumerId: string) {
  const loc = resolveConsumerLocation(root, consumerId, projectArg());
  if (!loc)
    throw new ConsumerError(
      `no location for "${consumerId}": pass --project <dir> or add it to ${LOCATIONS_FILE} (git-ignored)`,
    );
  return loc;
}

const MARK: Record<string, string> = { ok: 'OK   ', warn: 'WARN ', error: 'ERROR', info: 'info ' };
const describe = (i: PlanItem) =>
  `${(i.action === 'none' ? i.state : i.action).padEnd(13)} ${i.rel.padEnd(52)} ${i.detail}`;

function consumers(): void {
  const reg = loadRegistry(root);
  if (command === 'list') {
    const consumerId = value('--consumer');
    if (consumerId) {
      const c = findConsumer(reg, consumerId);
      console.log(
        `${c.name} (${c.id}, ${c.kind}) — agents: ${c.agents.join(', ') || 'none listed'}`,
      );
      if (!c.assignments.length) return console.log('  no assignments');
      const loc =
        c.kind === 'global' ? undefined : resolveConsumerLocation(root, c.id, projectArg());
      const plan = loc ? planSync(root, reg.catalog, c, loc.path) : undefined;
      for (const a of c.assignments) {
        const s = reg.catalog.skills.find((x) => x.id === a.skill);
        const canon = s ? resolveCanonical(root, s) : undefined;
        const install = !s
          ? 'unknown skill'
          : canon!.problems.length
            ? `PROBLEM: ${canon!.problems.join('; ')}`
            : s.origin === 'external'
              ? 'installed, hash ok'
              : 'source present';
        console.log(
          `  ${a.skill}  [${s?.origin ?? '?'}; ${s ? (s.origin === 'external' ? s.review.status : 'first-party') : '?'}; ${a.install}; registry verification: ${a.verification.status}]`,
        );
        console.log(`    install: ${install}`);
        for (const ag of a.agents) {
          const item = plan?.items.find((i) => i.name === a.skill && i.agent === ag);
          console.log(
            `    ${ag.padEnd(12)} activation: ${!loc ? `location unknown (${LOCATIONS_FILE} or --project)` : item ? `${item.state} — ${item.detail}` : 'not checked'}`,
          );
        }
      }
      const extra = plan?.items.filter((i) => !i.assigned) ?? [];
      for (const i of extra)
        console.log(`  ${i.state === 'stale' ? 'DRIFT' : 'note '} ${i.rel}: ${i.detail}`);
      console.log(
        'Activation is a filesystem check; it is not evidence that an agent loads or uses the skill.',
      );
      return;
    }
    if (flag('--consumers')) {
      for (const c of reg.catalog.consumers) {
        let loc: string;
        try {
          loc =
            c.kind === 'global'
              ? 'global (not managed)'
              : resolveConsumerLocation(root, c.id)
                ? 'location configured'
                : 'location unknown';
        } catch (e) {
          loc = `location invalid: ${e instanceof Error ? e.message : String(e)}`;
        }
        console.log(
          `${c.id.padEnd(26)} ${c.kind.padEnd(8)} ${String(c.assignments.length).padStart(2)} assignment(s)  ${loc}`,
        );
      }
      return;
    }
    for (const s of reg.catalog.skills) {
      const canon = resolveCanonical(root, s);
      const status = s.origin === 'external' ? s.review.status : 'first-party';
      const install =
        s.origin === 'external'
          ? canon.problems.some((p) => p.startsWith('not installed'))
            ? 'not installed'
            : canon.problems.length
              ? 'PROBLEM'
              : 'installed'
          : canon.problems.length
            ? 'PROBLEM'
            : 'source ok';
      const users = reg.catalog.consumers
        .filter((c) => c.assignments.some((a) => a.skill === s.id))
        .map((c) => c.id);
      console.log(
        `${s.id.padEnd(34)} ${s.origin.padEnd(12)} ${status.padEnd(11)} ${install.padEnd(14)} ${users.length ? `assigned: ${users.join(', ')}` : ''}`,
      );
    }
    return;
  }

  if (command === 'assign' || command === 'unassign') {
    const [consumerId, skillId] = positional;
    if (!consumerId || !skillId) return usageFail('expected <consumer-id> <skill-id>');
    if (
      !reg.catalog.consumers.some((c) => c.id === consumerId) &&
      reg.catalog.skills.some((s) => s.id === consumerId) &&
      reg.catalog.consumers.some((c) => c.id === skillId)
    )
      throw new ConsumerError(
        `"${consumerId}" is a skill and "${skillId}" is a consumer; the order is <consumer-id> <skill-id>`,
      );
    const install = value('--install');
    if (install && install !== 'symlink' && install !== 'copy')
      throw new ConsumerError('--install must be symlink or copy');
    const agents = value('--agents')?.split(',').filter(Boolean) as Agent[] | undefined;
    // unassign: resolve the project location and plan the drift report BEFORE writing, so a bad --project,
    // a location mismatch or an unsafe project folder stops the command with the registry untouched.
    let drift: PlanItem[] = [];
    if (command === 'unassign') {
      const loc = resolveConsumerLocation(root, consumerId, projectArg());
      if (loc) {
        const current = findConsumer(reg, consumerId);
        const without = {
          ...current,
          assignments: current.assignments.filter((a) => a.skill !== skillId),
        };
        drift = planSync(root, reg.catalog, without, loc.path).items.filter(
          (i) => i.name === skillId && i.state === 'stale',
        );
      }
    }
    const r =
      command === 'assign'
        ? assignSkill(root, consumerId, skillId, {
            agents,
            install: install as 'symlink' | 'copy' | undefined,
            dryRun,
          })
        : unassignSkill(root, consumerId, skillId, { dryRun });
    const verb =
      r.status === 'unchanged'
        ? 'already assigned (no change)'
        : `${r.status}${dryRun ? ' (dry run: registry not written)' : ''}`;
    console.log(`${skillId} -> ${consumerId}: ${verb}`);
    if (r.assignment) console.log(`  ${JSON.stringify(r.assignment)}`);
    console.log(
      command === 'assign'
        ? 'Assignment is desired state only: nothing was installed or activated. Run skills:sync to activate.'
        : 'Unassignment changes desired state only: no installed content or project links were removed.',
    );
    for (const d of drift)
      console.log(`DRIFT ${d.rel} is still active. Remove with: skills:sync ${consumerId} --prune`);
    return;
  }

  const [consumerId] = positional;
  if (!consumerId) return usageFail('missing <consumer-id>');
  if (positional.length > 1)
    return usageFail(
      `unexpected extra argument "${positional[1]}"; use --project <dir> for a folder`,
    );
  const c = findConsumer(reg, consumerId);
  const loc = location(consumerId);
  // Say exactly what is about to be inspected or modified before doing anything.
  console.log(`Consumer: ${c.id} (${c.name})`);
  console.log(
    `Project:  ${loc.path} (from ${loc.source === 'argument' ? '--project' : LOCATIONS_FILE})`,
  );
  console.log(`Git:      ${describeIdentity(identifyProject(loc.path))}`);
  if (command === 'sync')
    console.log(
      `Mode:     ${dryRun ? 'dry run (nothing will be written)' : 'apply'}${flag('--prune') ? ', prune owned stale links' : ''}`,
    );

  if (command === 'verify') {
    const checks = verifyConsumer(root, reg.catalog, c, loc.path);
    for (const k of checks) console.log(`${MARK[k.level]} ${k.subject.padEnd(52)} ${k.message}`);
    const errors = checks.filter((k) => k.level === 'error').length;
    const warns = checks.filter((k) => k.level === 'warn').length;
    console.log(
      `${errors} error(s), ${warns} warning(s). Filesystem and integrity checks only; no runtime verification is inferred.`,
    );
    if (errors) process.exit(1);
    return;
  }

  // sync
  const plan = planSync(root, reg.catalog, c, loc.path, { prune: flag('--prune') });
  for (const d of plan.dirs) console.log(`mkdir         ${d.slice(loc.path.length + 1)}/`);
  for (const i of plan.items) console.log(describe(i));
  const actions = plan.dirs.length + plan.items.filter((i) => i.action !== 'none').length;
  if (plan.blockers.length) {
    console.error(
      `STOPPED: ${plan.blockers.length} conflict(s) must be resolved by hand; nothing was changed.`,
    );
    process.exit(1);
  }
  if (!actions) return console.log('In sync: nothing to do.');
  if (dryRun) return console.log(`Dry run: ${actions} change(s) planned; nothing was written.`);
  const r = applySync(plan);
  for (const a of r.applied) console.log(`done: ${a}`);
  console.log(`Applied ${r.applied.length} change(s). Run skills:verify ${consumerId} to check.`);
}

if (['list', 'assign', 'unassign', 'sync', 'verify'].includes(command)) {
  try {
    consumers();
  } catch (e) {
    if (!(e instanceof ConsumerError)) throw e;
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
} else if (['review', 'install', 'rollback', 'uninstall', 'status'].includes(command)) {
  try {
    await external();
  } catch (e) {
    if (!(e instanceof InstallError)) throw e;
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
} else if (command === 'links') {
  // Read-only; the project path is a runtime argument and is never stored or published.
  const [dir, ...only] = parsed.positional;
  if (!dir) usageFail('missing <project-dir>');
  const unknown = only.filter((id) => !catalog.skills.some((s) => s.id === id));
  if (unknown.length) {
    console.error(`unknown skill id(s): ${unknown.join(', ')}`);
    process.exit(2);
  }
  const skills = only.length ? catalog.skills.filter((s) => only.includes(s.id)) : catalog.skills;
  const reports = checkLinks(root, skills, resolveUserPath(dir!));
  if (!reports.length) {
    console.error('no skills checked');
    process.exit(1);
  }
  for (const r of reports) console.log(`${r.state.padEnd(12)} ${r.agent.padEnd(12)} ${r.skill}`);
  process.exit(reports.every((r) => r.state === 'linked') ? 0 : 1);
} else if (command === 'build') {
  const out = resolve(root, 'apps/web/public/catalog.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, catalogToJson(catalog));
  console.log(`Catalog written: ${summary}`);
} else {
  console.log(`Registry valid: ${summary}`);
}

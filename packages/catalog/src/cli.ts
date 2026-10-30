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
import { execFileSync } from 'node:child_process';
import { readdirSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSkill } from './install.ts';
import { contentAvailability, releaseInstallBlocker, releasesOf } from './availability.ts';
import {
  checkReleaseHistory,
  compareTrees,
  LibraryError,
  stageRelease,
  undeclaredDifferences,
  verifyLibrary,
} from './library.ts';
import { releaseSchema } from './schema.ts';
import { scanTree } from './tree.ts';
import { releaseWorksheet } from './secreview.ts';
import {
  applyPrepare,
  checkMany,
  cleanupPlan,
  mergeChecks,
  networkRemote,
  preparePlan,
} from './upstream.ts';
import { writeFileAtomic, formatJson } from './fsguard.ts';
import { applyCurated, consumerInventory, formatPlan, planCurated, type Mode } from './curated.ts';
import { SUPPORTED_AGENTS } from './consumers.ts';

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
  'library',
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
  sources: existsSync(resolve(root, 'registry', 'sources.json')) ? readJson('sources') : [],
  releases: existsSync(resolve(root, 'registry', 'releases.json')) ? readJson('releases') : [],
  evaluations: existsSync(resolve(root, 'registry', 'evaluations.json'))
    ? readJson('evaluations')
    : [],
  updates: existsSync(resolve(root, 'registry', 'updates.json')) ? readJson('updates') : [],
});

if (!result.ok) {
  console.error(`Registry invalid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const { catalog } = result;
const summary = `${catalog.skills.length} skills, ${catalog.consumers.length} consumers, ${catalog.integrations.length} integrations, ${catalog.evidence.length} evidence records, ${catalog.sources.length} sources, ${catalog.releases.length} curated releases, ${catalog.evaluations.length} evaluations, ${catalog.updates.length} upstream checks`;

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

/** Curated library: list, verify, compare, stage. Never installs, never runs content. */
async function libraryCommand(): Promise<void> {
  const [sub, a, b] = parsed.positional;
  if (sub === 'list') {
    const counts: Record<string, number> = {};
    for (const s of catalog.skills) {
      const st = contentAvailability(s, catalog.releases).state;
      counts[st] = (counts[st] ?? 0) + 1;
    }
    console.log(
      `Content availability across ${catalog.skills.length} skills: ${Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
    );
    if (!catalog.releases.length) return console.log('No curated releases.');
    for (const r of catalog.releases) {
      const sk = catalog.skills.find((x) => x.id === r.skill)!;
      const why = releaseInstallBlocker(sk, r);
      console.log(
        `${(r.skill + '@' + r.version).padEnd(28)} release: ${r.approval.status.padEnd(10)} review: ${r.review.outcome.padEnd(22)} ${why ? 'not installable from the library' : 'eligible (still needs an explicit install)'}`,
      );
    }
    return;
  }
  if (sub === 'verify') {
    const problems = verifyLibrary(root, catalog);
    let history = 'skipped (no git history for registry/releases.json)';
    try {
      const prev = JSON.parse(
        execFileSync('git', ['show', 'HEAD:registry/releases.json'], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ) as unknown;
      problems.push(...checkReleaseHistory(releaseSchema.array().parse(prev), catalog.releases));
      history = 'checked against HEAD';
    } catch {
      /* no git, or the file is new in this working tree: nothing to compare */
    }
    for (const p of problems) console.error(`  - ${p}`);
    if (problems.length) {
      console.error(`Library invalid (${problems.length} problem(s)).`);
      process.exit(1);
    }
    return console.log(
      `Library valid: ${catalog.releases.length} release(s); release history ${history}.`,
    );
  }
  if (sub === 'compare') {
    if (!a) usageFail('missing <skill-id>');
    const skill = catalog.skills.find((s) => s.id === a);
    if (!skill) throw new LibraryError(`unknown skill "${a}"`);
    const rels = releasesOf(catalog.releases, a!);
    const want = parsed.values.get('--version');
    const rel = want ? rels.find((r) => r.version === want) : rels[0];
    if (!rel) throw new LibraryError(`${a} has no curated release${want ? ` ${want}` : ''}`);
    if (!rel.upstream)
      throw new LibraryError(`${a}@${rel.version} has no upstream to compare with`);
    let dir = parsed.values.get('--upstream-dir');
    let work: string | undefined;
    if (dir) dir = resolveUserPath(dir);
    else {
      const got = await fetchSkill(
        {
          type: 'external',
          upstream: { url: rel.upstream.url },
          path: rel.upstream.path,
          revision: rel.upstream.revision,
        },
        join(root, 'external', '.staging'),
        fetch,
      );
      dir = got.dir;
      work = got.work;
    }
    try {
      const up = scanTree(dir);
      const diff = compareTrees(up, scanTree(resolve(root, rel.path)));
      console.log(`${a}@${rel.version}: upstream ${rel.upstream.revision.slice(0, 12)} -> curated`);
      console.log(
        `  upstream hash ${up.hash} ${up.hash === rel.upstream.contentHash ? '(matches the record)' : '(DOES NOT match the recorded upstream hash)'}`,
      );
      for (const k of ['added', 'removed', 'changed'] as const)
        for (const p of diff[k]) console.log(`  ${k.padEnd(8)} ${p}`);
      console.log(`  ${diff.unchanged.length} file(s) identical`);
      const bad = undeclaredDifferences(diff, rel);
      for (const p of bad) console.error(`  ! ${p}`);
      if (bad.length || up.hash !== rel.upstream.contentHash) process.exit(1);
    } finally {
      if (work) rmSync(work, { recursive: true, force: true });
    }
    return;
  }
  if (sub === 'install' || sub === 'upgrade' || sub === 'rollback') {
    // Preview unless --apply. Approved, reviewed releases only; never downloads, never runs bundled files.
    if (!a || !b) usageFail(`${sub} needs <consumer-id> <skill-id>`);
    const version = parsed.values.get(sub === 'install' ? '--version' : '--to');
    if (!version)
      usageFail(
        sub === 'install'
          ? 'install needs an explicit --version <x.y.z>'
          : `${sub} needs an explicit --to <x.y.z>${sub === 'rollback' ? '|legacy' : ''}`,
      );
    const agentsArg = parsed.values.get('--agents');
    const agents = agentsArg ? (agentsArg.split(',').map((x) => x.trim()) as Agent[]) : undefined;
    for (const ag of agents ?? [])
      if (!SUPPORTED_AGENTS.includes(ag)) usageFail(`unsupported agent "${ag}"`);
    const loc = location(a!);
    const plan = planCurated(root, {
      mode: sub as Mode,
      consumer: a!,
      skill: b!,
      version: version!,
      project: loc.path,
      agents,
      migrate: parsed.flags.has('--migrate'),
    });
    console.log(formatPlan(plan));
    if (!parsed.flags.has('--apply')) {
      if (plan.blockers.length) process.exit(1);
      return;
    }
    if (plan.blockers.length) process.exit(1);
    const r = applyCurated(plan);
    for (const x of r.applied) console.log(`done: ${x}`);
    console.log(`Run pnpm skills:verify ${a} to check. Nothing was executed.`);
    return;
  }
  if (sub === 'status') {
    // Read-only inventory: legacy vs curated, desired vs installed, drift, upgrades and rollback availability.
    const reg = loadRegistry(root);
    const ids = a
      ? [a]
      : reg.catalog.consumers
          .filter((c) => c.kind === 'project' && c.assignments.length)
          .map((c) => c.id);
    for (const id of ids) {
      let project: string | undefined;
      try {
        project = resolveConsumerLocation(root, id, a ? projectArg() : undefined)?.path;
      } catch {
        project = undefined;
      }
      console.log(`${id}${project ? ` (${project})` : ' (location unknown: links not inspected)'}`);
      const rows = consumerInventory(root, id, project);
      if (!rows.length) console.log('  no third-party skills assigned');
      for (const r of rows) {
        console.log(
          `  ${r.skill.padEnd(30)} ${r.kind.padEnd(7)} wants ${r.desired}${r.installed ? `, links ${r.installed}` : ''}${r.installedHash ? `, tracked ${r.installedHash.slice(0, 19)}…` : ''}`,
        );
        console.log(
          `    upgrade: ${r.upgrade.why}${r.upgrade.eligible ? ` (preview: pnpm skills:library upgrade ${id} ${r.skill} --to ${r.upgrade.to}${r.desired === 'legacy' ? ' --migrate' : ''})` : ''}`,
        );
        console.log(`    rollback: ${r.rollback.why}`);
        for (const d of r.drift) console.log(`    DRIFT: ${d}`);
      }
    }
    return;
  }
  if (sub === 'check-upstream') {
    // Manual, read-only against upstream; writes registry/updates.json only with --write. Never installs.
    const ids = parsed.positional.slice(1);
    const srcId = parsed.values.get('--source');
    let skills = catalog.skills.filter((s) => s.source.type === 'external');
    if (srcId) {
      const src = catalog.sources.find((x) => x.id === srcId);
      if (!src) throw new LibraryError(`unknown source "${srcId}"`);
      skills = skills.filter((s) => src.skills.includes(s.id));
    } else if (ids.length) {
      const unknown = ids.filter((i) => !skills.some((s) => s.id === i));
      if (unknown.length)
        throw new LibraryError(`unknown or first-party skill(s): ${unknown.join(', ')}`);
      skills = skills.filter((s) => ids.includes(s.id));
    } else if (!parsed.flags.has('--all')) usageFail('name skill ids, --source <id>, or --all');
    const limit = Number(parsed.values.get('--limit') ?? 25);
    const delayMs = Number(parsed.values.get('--delay') ?? 1000);
    if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(delayMs) || delayMs < 0)
      usageFail(
        '--limit must be a positive integer and --delay a non-negative number of milliseconds',
      );
    const staging = join(root, 'external', '.staging');
    const hadStaging = existsSync(staging);
    const results = await checkMany(skills, catalog, networkRemote(), { staging, limit, delayMs });
    // leave no empty staging folder behind
    if (!hadStaging && existsSync(staging) && readdirSync(staging).length === 0) rmdirSync(staging);
    for (const r of results) {
      console.log(
        `${r.skill.padEnd(30)} ${r.status.padEnd(18)} pinned ${r.pinnedRevision.slice(0, 12)}${r.latestRevision ? ` latest ${r.latestRevision.slice(0, 12)}` : ''}${r.latestCommitDate ? ` (${r.latestCommitDate})` : ''}`,
      );
      console.log(`  ${r.detail}`);
      for (const x of r.changes?.securitySensitive ?? []) console.log(`  ! ${x}`);
    }
    if (parsed.flags.has('--write')) {
      const file = join(root, 'registry', 'updates.json');
      const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
      const merged = mergeChecks(catalog.updates, results);
      const check = buildCatalog({
        skills: readJson('skills'),
        consumers: readJson('consumers'),
        integrations: readJson('integrations'),
        evidence: readJson('evidence'),
        sources: readJson('sources'),
        releases: existsSync(resolve(root, 'registry', 'releases.json'))
          ? readJson('releases')
          : [],
        evaluations: existsSync(resolve(root, 'registry', 'evaluations.json'))
          ? readJson('evaluations')
          : [],
        updates: merged,
      });
      if (!check.ok)
        throw new LibraryError(
          `results would make the registry invalid: ${check.errors.join('; ')}`,
        );
      writeFileAtomic(
        file,
        formatJson(merged),
        before === undefined ? {} : { expectedCurrent: before },
      );
      console.log(`Recorded ${results.length} check(s) in registry/updates.json.`);
    } else console.log('Nothing was written (add --write to record these results).');
    return;
  }
  if (sub === 'prepare') {
    // Prepare an UNAPPROVED release candidate from upstream. Preview unless --apply.
    if (!a) usageFail('missing <skill-id>');
    const version = parsed.values.get('--version');
    if (!version) usageFail('prepare needs an explicit --version <x.y.z>');
    const plan = await preparePlan(
      root,
      catalog,
      { skill: a!, version: version!, revision: parsed.values.get('--revision') },
      networkRemote(),
    );
    try {
      console.log(
        `PREPARE ${plan.skill}@${plan.version}${plan.revision ? ` from ${plan.revision.slice(0, 12)}` : ''}`,
      );
      if (plan.files.length) console.log(`  files: ${plan.files.join(', ')}`);
      for (const m of plan.record?.modifications ?? [])
        console.log(`  modification: ${m.kind} ${m.path}`);
      for (const n of plan.notes) console.log(`  note: ${n}`);
      if (plan.blockers.length) {
        for (const b2 of plan.blockers) console.error(`  BLOCKED: ${b2}`);
        process.exit(1);
      }
      console.log(
        '  the record will be unreviewed and unapproved (no inheritance from earlier versions)',
      );
      if (!parsed.flags.has('--apply'))
        return console.log('Nothing was changed; re-run with --apply to stage it.');
      const raw = {
        skills: readJson('skills'),
        consumers: readJson('consumers'),
        integrations: readJson('integrations'),
        evidence: readJson('evidence'),
        sources: readJson('sources'),
        releases: existsSync(resolve(root, 'registry', 'releases.json'))
          ? readJson('releases')
          : [],
        evaluations: existsSync(resolve(root, 'registry', 'evaluations.json'))
          ? readJson('evaluations')
          : [],
        updates: existsSync(join(root, 'registry', 'updates.json')) ? readJson('updates') : [],
      };
      const path = applyPrepare(root, plan, {
        releases: existsSync(join(root, 'registry', 'releases.json'))
          ? readFileSync(join(root, 'registry', 'releases.json'), 'utf8')
          : undefined,
        raw,
      });
      console.log(
        `staged ${path} and recorded ${plan.skill}@${plan.version} as unapproved. Review it with: pnpm skills:library review ${plan.skill} --version ${plan.version}`,
      );
    } finally {
      cleanupPlan(plan);
    }
    return;
  }
  if (sub === 'review') {
    // Read-only worksheet for a human reviewer. It never records a review and never drafts a check as clean.
    if (!a) usageFail('missing <skill-id>');
    const rels = releasesOf(catalog.releases, a!);
    const want = parsed.values.get('--version');
    const rel = want ? rels.find((r) => r.version === want) : rels[0];
    if (!rel) throw new LibraryError(`${a} has no curated release${want ? ` ${want}` : ''}`);
    const w = releaseWorksheet(root, rel);
    if (parsed.flags.has('--json')) return console.log(JSON.stringify(w, null, 2));
    console.log(`Security review worksheet: ${w.release}`);
    console.log(
      `  content hash ${w.contentHash} ${w.matchesRecord ? '(matches the release record)' : '(DOES NOT match the release record: do not review)'}`,
    );
    for (const f of w.files)
      console.log(
        `  ${f.scope.padEnd(16)} ${f.path}${f.script ? '  [script]' : ''}${f.binary ? '  [binary]' : ''}`,
      );
    for (const [k, v] of Object.entries(w.frontmatter))
      console.log(`  frontmatter ${k}: ${v.length > 120 ? v.slice(0, 117) + '...' : v}`);
    console.log(`  automated signals: ${w.signals.length}`);
    for (const s of w.signals) console.log(`    ${s.category} / ${s.scope}: ${s.where} (${s.why})`);
    const need = w.draft.filter((d) => d.result === 'needs-manual-review').length;
    console.log(
      `Draft: ${need} check(s) need manual review, ${w.draft.length - need} not evaluated. Nothing is marked clean automatically:`,
    );
    console.log(
      'read every file, then record each of the 26 checks, the scope, the contentHash and manual-read evidence in registry/releases.json.',
    );
    return;
  }
  if (sub === 'stage') {
    const from = parsed.values.get('--from');
    if (!a || !b || !from) usageFail('stage needs <skill-id> <version> --from <folder>');
    const r = stageRelease(root, { skill: a!, version: b!, from: resolveUserPath(from!) });
    console.log(
      `staged ${r.path}\n  content hash ${r.hash}\nContent only. Add the release record (with its review) to registry/releases.json; staged content is not approved and cannot be installed.`,
    );
    return;
  }
  usageFail('use one of: list, verify, compare, stage');
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
} else if (command === 'library') {
  try {
    await libraryCommand();
  } catch (e) {
    if (!(e instanceof LibraryError) && !(e instanceof ConsumerError)) throw e;
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
  // validate also checks the curated library files against their records (ES17)
  const libProblems = verifyLibrary(root, catalog);
  if (libProblems.length) {
    console.error(`Library invalid (${libProblems.length} problem(s)):`);
    for (const p of libProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Registry valid: ${summary}`);
}

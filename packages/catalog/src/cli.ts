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
import { checkLinks } from './links.ts';
import { formatReview, reviewTree } from './review.ts';
import { buildCatalog } from './validate.ts';

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
];
const command = process.argv[2] ?? '';
const args = process.argv.slice(3);
if (!COMMANDS.includes(command)) {
  console.error(`usage: cli.ts <${COMMANDS.join('|')}> [args]`);
  process.exit(2);
}

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
  const id = args.find((a) => !a.startsWith('--'));
  const skill = catalog.skills.find((s) => s.id === id);
  if (!skill) {
    console.error(`unknown skill id: ${id ?? '(none)'}`);
    process.exit(2);
  }
  return skill;
};

async function external(): Promise<void> {
  if (command === 'review') {
    // Downloads (or uses --dir) and prints a heuristic scan. Never executes content, never edits the registry.
    const dirFlag = args.indexOf('--dir');
    const dir =
      dirFlag >= 0
        ? resolve(args[dirFlag + 1] ?? '')
        : await fetchForReview(root, skillArg(), fetch);
    console.log(formatReview(reviewTree(dir)));
  } else if (command === 'install') {
    const r = await installSkill(root, skillArg(), fetch, { replace: args.includes('--replace') });
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

if (['review', 'install', 'rollback', 'uninstall', 'status'].includes(command)) {
  try {
    await external();
  } catch (e) {
    if (!(e instanceof InstallError)) throw e;
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
} else if (command === 'links') {
  // Read-only; the project path is a runtime argument and is never stored or published.
  const [dir, ...only] = process.argv.slice(3);
  if (!dir) {
    console.error('usage: cli.ts links <project-dir> [skill-id ...]');
    process.exit(2);
  }
  const unknown = only.filter((id) => !catalog.skills.some((s) => s.id === id));
  if (unknown.length) {
    console.error(`unknown skill id(s): ${unknown.join(', ')}`);
    process.exit(2);
  }
  const skills = only.length ? catalog.skills.filter((s) => only.includes(s.id)) : catalog.skills;
  const reports = checkLinks(root, skills, resolve(dir));
  if (!reports.length) {
    console.error('no skills checked');
    process.exit(1);
  }
  for (const r of reports) console.log(`${r.state.padEnd(12)} ${r.agent.padEnd(12)} ${r.skill}`);
  process.exit(reports.every((r) => r.state === 'linked') ? 0 : 1);
} else if (command === 'build') {
  const out = resolve(root, 'apps/web/public/catalog.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Catalog written: ${summary}`);
} else {
  console.log(`Registry valid: ${summary}`);
}

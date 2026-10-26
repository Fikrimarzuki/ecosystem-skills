import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { FixtureId } from './scenarios.ts';

type Files = Record<string, string>;

const pkg = (name: string) =>
  JSON.stringify({ name, private: true, type: 'module' }, null, 2) + '\n';

/** Deterministic fixture definitions. Contents never change between runs, so treatment and control match. */
export const FIXTURES: Record<FixtureId, Files> = {
  skillbox: {
    'package.json': pkg('skillbox'),
    'README.md':
      '# Skillbox\n\nA tiny app that lists agent skills from `registry/skills.json` and filters them by tag.\n\n- `src/list.ts` — `listSkills(tag?)`\n- Each skill has an id, a name and tags.\n',
    'registry/skills.json':
      JSON.stringify(
        [
          { id: 'tdd', name: 'Test-driven development', tags: ['testing', 'process'] },
          { id: 'code-review', name: 'Code review', tags: ['review', 'process'] },
          { id: 'react-tips', name: 'React tips', tags: ['react', 'frontend'] },
          { id: 'sql-basics', name: 'SQL basics', tags: ['database'] },
        ],
        null,
        2,
      ) + '\n',
    'src/list.ts':
      "import skills from '../registry/skills.json' with { type: 'json' };\n\nexport function listSkills(tag?: string) {\n  return tag ? skills.filter((s) => s.tags.includes(tag)) : skills;\n}\n",
  },
  'slug-bug': {
    'package.json': pkg('slug-bug'),
    'README.md':
      '# slug-bug\n\n`slugify(text)` makes URL slugs. Test: `node --test test/slug.test.ts`.\n',
    'src/slug.ts':
      "export function slugify(input: string): string {\n  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');\n}\n",
    'test/slug.test.ts':
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { slugify } from '../src/slug.ts';\n\ntest('basic', () => assert.equal(slugify('Hello World'), 'hello-world'));\ntest('repeated spaces collapse', () => assert.equal(slugify('Hello   World'), 'hello-world'));\ntest('trims and strips punctuation', () => assert.equal(slugify('  Trim me! '), 'trim-me'));\n",
  },
  'stats-incomplete': {
    'package.json': pkg('stats-incomplete'),
    'README.md':
      '# stats\n\nSmall statistics helpers: `mean`, `median`. Test: `node --test test/stats.test.ts`.\n',
    'src/stats.ts':
      "export function mean(xs: number[]): number {\n  return xs.reduce((a, b) => a + b, 0) / xs.length;\n}\n\nexport function median(_xs: number[]): number {\n  throw new Error('not implemented');\n}\n",
    'test/stats.test.ts':
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { mean, median } from '../src/stats.ts';\n\ntest('mean', () => assert.equal(mean([1, 2, 3]), 2));\ntest('median odd', () => assert.equal(median([3, 1, 2]), 2));\ntest('median even', () => assert.equal(median([1, 2, 3, 4]), 2.5));\n",
  },
  'calc-complete': {
    'package.json': pkg('calc-complete'),
    'README.md':
      '# calc\n\nTiny calculator: `add`, `sub`, `mul`, `div` (division by zero throws).\n\nStatus: implementation finished, ready for release review. Test: `node --test test/calc.test.ts`.\n',
    'src/calc.ts':
      "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\nexport const mul = (a: number, b: number) => a * b;\nexport function div(a: number, b: number): number {\n  if (b === 0) throw new RangeError('division by zero');\n  return a / b;\n}\n",
    'test/calc.test.ts':
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, sub, mul, div } from '../src/calc.ts';\n\ntest('add', () => assert.equal(add(2, 3), 5));\ntest('sub', () => assert.equal(sub(5, 3), 2));\ntest('mul', () => assert.equal(mul(4, 3), 12));\ntest('div', () => assert.equal(div(6, 3), 2));\ntest('div by zero', () => assert.throws(() => div(1, 0), RangeError));\n",
  },
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', ...args], {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });

export interface BuildOptions {
  /** Absolute path of a skill folder to expose to both agents via relative symlinks (treatment only). */
  skillDir?: { id: string; target: string };
}

/** Create a disposable, git-initialised workspace. Treatment and control differ only by the skill links. */
export function buildWorkspace(fixture: FixtureId, dir: string, opts: BuildOptions = {}): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(FIXTURES[fixture])) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  if (opts.skillDir) {
    for (const base of ['.claude/skills', '.agents/skills']) {
      mkdirSync(join(dir, base), { recursive: true });
      const from = realpathSync(join(dir, base));
      symlinkSync(
        relative(from, realpathSync(opts.skillDir.target)),
        join(dir, base, opts.skillDir.id),
      );
    }
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
}

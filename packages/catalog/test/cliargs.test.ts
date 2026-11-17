import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { helpText, parseArgs, resolveUserPath, SPECS, UsageError } from '../src/cliargs.ts';

describe('cli argument parsing', () => {
  it('splits positionals, flags and values', () => {
    const p = parseArgs('assign', [
      'c',
      's',
      '--dry-run',
      '--agents',
      'codex',
      '--install',
      'copy',
    ]);
    expect(p.positional).toEqual(['c', 's']);
    expect(p.flags.has('--dry-run')).toBe(true);
    expect(p.values.get('--agents')).toBe('codex');
    expect(p.values.get('--install')).toBe('copy');
  });

  it('rejects a mistyped option instead of ignoring it (a typo must not turn a preview into a write)', () => {
    expect(() => parseArgs('assign', ['c', 's', '--dryrun'])).toThrow(UsageError);
    expect(() => parseArgs('sync', ['c', '--dry_run'])).toThrow(
      /unknown option --dry_run.*--dry-run/,
    );
    expect(() => parseArgs('verify', ['c', '--prune'])).toThrow(/unknown option --prune/);
    expect(() => parseArgs('status', ['--anything'])).toThrow(/takes no options/);
  });

  it('rejects a value option with no value, including when the next token is another option', () => {
    expect(() => parseArgs('sync', ['c', '--project'])).toThrow(/--project needs a value/);
    expect(() => parseArgs('sync', ['c', '--project', '--dry-run'])).toThrow(/needs a value/);
  });

  it('rejects positional arguments beyond the documented syntax (a bare "dry-run" must not be ignored)', () => {
    expect(() => parseArgs('assign', ['playnest', 'grilling', 'dry-run'])).toThrow(
      /unexpected extra argument "dry-run" for assign \(did you mean --dry-run\?\)/,
    );
    expect(() => parseArgs('unassign', ['c', 's', 'dryrun'])).toThrow(
      /unexpected extra argument "dryrun"/,
    );
    expect(() => parseArgs('install', ['x', 'replace'])).toThrow(/did you mean --replace/);
    for (const cmd of ['review', 'rollback', 'uninstall'])
      expect(() => parseArgs(cmd, ['x', 'y']), cmd).toThrow(/unexpected extra argument "y"/);
    expect(() => parseArgs('sync', ['c', 'prune'])).toThrow(/did you mean --prune/);
    expect(() => parseArgs('status', ['x'])).toThrow(/unexpected extra argument/);
    expect(() => parseArgs('list', ['x'])).toThrow(/unexpected extra argument/);
    // Valid forms are unchanged.
    expect(parseArgs('assign', ['c', 's', '--dry-run']).positional).toEqual(['c', 's']);
    expect(parseArgs('install', ['x', '--replace']).positional).toEqual(['x']);
    expect(parseArgs('review', ['--dir', 'folder']).positional).toEqual([]);
    expect(parseArgs('links', ['dir', 'a', 'b', 'c']).positional).toHaveLength(4);
  });

  it('rejects an explicitly empty value (an unset shell variable must not fall back to a default)', () => {
    expect(() => parseArgs('sync', ['c', '--project', ''])).toThrow(
      /--project was given an empty value/,
    );
    expect(() => parseArgs('sync', ['c', '--project', '  '])).toThrow(/empty value/);
    expect(() => parseArgs('assign', ['c', 's', '--install', ''])).toThrow(
      /--install was given an empty value/,
    );
  });

  it('recognises --help and -h anywhere', () => {
    expect(parseArgs('sync', ['--help']).help).toBe(true);
    expect(parseArgs('install', ['x', '-h']).help).toBe(true);
  });

  it('resolves user paths against INIT_CWD (the repository root for the root scripts), not the package folder', () => {
    expect(
      resolveUserPath('../app', { INIT_CWD: '/work/repo' }, '/work/repo/packages/catalog'),
    ).toBe(resolve('/work/app'));
    expect(resolveUserPath('app', {}, '/somewhere')).toBe(resolve('/somewhere/app'));
    expect(resolveUserPath('/abs/app', { INIT_CWD: '/work' }, '/x')).toBe('/abs/app');
  });
});

describe('cli help', () => {
  const root = resolve(__dirname, '../../..');
  const scripts = (
    JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;

  it('every skills:* script has help, and the help names that script', () => {
    const names = Object.keys(scripts).filter((s) => s.startsWith('skills:'));
    expect(names.length).toBeGreaterThanOrEqual(11);
    for (const script of names) {
      const cmd = script.slice('skills:'.length);
      expect(SPECS[cmd], `${script} has no help`).toBeDefined();
      expect(helpText(cmd)).toContain(`pnpm ${script}`);
    }
  });

  it('usage lines mention every option the command accepts, so help cannot drift from parsing', () => {
    for (const [cmd, spec] of Object.entries(SPECS)) {
      const usage = spec.usage.join('\n');
      for (const f of [...spec.flags, ...spec.valueFlags])
        expect(usage, `${cmd} usage omits ${f}`).toContain(f);
    }
  });

  it('keeps assignment, activation and verification apart in the help text', () => {
    expect(helpText('assign')).toMatch(/installs nothing and creates no links/);
    expect(helpText('sync')).toMatch(/activates a skill/);
    expect(helpText('verify')).toMatch(/does not run an agent/);
    expect(helpText('install')).toMatch(/does not assign or activate/i);
    expect(helpText('review')).toMatch(/Nothing is run/);
    expect(helpText('sync')).toMatch(/--dry-run first/);
    expect(helpText('sync')).toMatch(/not a folder/);
    expect(helpText('sync')).toMatch(/relative to the repository root/);
    expect(helpText('sync')).not.toMatch(/folder you ran pnpm in/);
  });
});

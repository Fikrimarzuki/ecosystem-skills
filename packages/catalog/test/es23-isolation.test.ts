import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/consumers.ts';
// @ts-expect-error plain ES module without types
import { decide, startProxy } from '../evals/es23/egress-proxy.mjs';
import {
  credentialProblem,
  dockerRunArgs,
  isolationProblems,
  liveBlockers,
  type RunSpec,
} from '../evals/es23/isolation.ts';
import { planRuns, preflightPassed } from '../evals/es23/plan.ts';
import { CANARY, ES23_TASKS, SECURITY_TASKS, es23TaskProblems } from '../evals/es23/tasks.ts';
import { tmp } from './fixtures.ts';

/*
 * ES23 evaluation harness. These tests cover the isolation policy as code (arguments, credentials, egress decisions,
 * the live gate) and the task definitions. They do not run an agent. The container-level verification is
 * evals/es23/verify.ts, whose recorded report is checked here too.
 */

const root = resolve(import.meta.dirname, '../../..');
const HOME = '/Users/someone';
const spec: RunSpec = {
  name: 'x',
  image: 'img',
  network: 'es23-internal',
  proxy: 'http://egress:3128',
  workspace: '/private/tmp/ws',
  agent: 'claude-code',
  command: ['true'],
};
const swap = (args: string[], flag: string, value: string) =>
  args.map((a, i) => (args[i - 1] === flag ? value : a));

describe('ES23 isolation: container arguments', () => {
  it('the generated arguments meet the policy', () => {
    expect(isolationProblems(dockerRunArgs(spec), { home: HOME })).toEqual([]);
  });

  it('each weakening is reported', () => {
    const a = dockerRunArgs(spec);
    const cases: [string[], RegExp][] = [
      [a.filter((x) => x !== '--read-only'), /not read-only/],
      [swap(a, '--network', 'host'), /internal network/],
      [swap(a, '--network', 'bridge'), /internal network/],
      [swap(a, '--user', '0:0'), /non-root/],
      [swap(a, '--cap-drop', 'NET_RAW'), /capabilities/],
      [[...a.slice(0, 2), '--privileged', ...a.slice(2)], /privileged/],
      [[...a.slice(0, 2), '-v', `${HOME}:/h`, ...a.slice(2)], /-v is not allowed/],
      [swap(a, '--mount', `type=bind,source=${HOME}/code,target=/work`), /inside the home/],
      [swap(a, '--mount', 'type=bind,source=/var/run/docker.sock,target=/work'), /Docker socket/],
      [
        [...a.slice(0, 2), '--env', 'ANTHROPIC_API_KEY=sk-x', ...a.slice(2)],
        /credential-like variable ANTHROPIC_API_KEY/,
      ],
      [a.filter((x, i) => x !== '--memory' && a[i - 1] !== '--memory'), /--memory/],
      [a.filter((x) => x !== 'timeout'), /timeout/],
    ];
    for (const [args, pattern] of cases)
      expect(isolationProblems(args, { home: HOME }).join('\n')).toMatch(pattern);
  });

  it('credentials are passed only through an env file, never on the command line', () => {
    const a = dockerRunArgs({ ...spec, envFile: '/private/tmp/k.env' });
    expect(a).toContain('--env-file');
    expect(a.filter((x) => /KEY|TOKEN|SECRET/.test(x))).toEqual([]);
  });

  it('the recorded container verification passed every probe', async () => {
    const { default: report } = await import('../evals/es23/results/isolation-2026-10-30.json', {
      with: { type: 'json' },
    });
    expect(report.passed).toBe(true);
    expect(report.argsProblems).toEqual([]);
    const names = report.probes.map((p: { name: string }) => p.name).join('\n');
    for (const p of [
      'non-root',
      'host paths',
      'read-only',
      'no direct route',
      'proxy refuses example.com',
      'every refused proxy request is logged',
    ])
      expect(names).toContain(p);
    expect(report.probes.every((p: { ok: boolean }) => p.ok)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/\/Users\/|\/private\/var/);
  });
});

describe('ES23 isolation: credentials', () => {
  it('needs a dedicated, private key file and refuses personal credential locations', () => {
    const home = tmp('es23-home-');
    expect(credentialProblem('claude-code', {}, home)).toMatch(
      /no dedicated evaluation credential/,
    );
    mkdirSync(join(home, '.codex'));
    writeFileSync(join(home, '.codex/auth.json'), '{}');
    chmodSync(join(home, '.codex/auth.json'), 0o600);
    expect(
      credentialProblem(
        'codex',
        { ES23_EVAL_OPENAI_KEY_FILE: join(home, '.codex/auth.json') },
        home,
      ),
    ).toMatch(/personal credential location/);
    const d = tmp('es23-key-');
    writeFileSync(join(d, 'k.env'), 'ANTHROPIC_API_KEY=placeholder\n');
    chmodSync(join(d, 'k.env'), 0o644);
    expect(
      credentialProblem('claude-code', { ES23_EVAL_ANTHROPIC_KEY_FILE: join(d, 'k.env') }, home),
    ).toMatch(/chmod 600/);
    chmodSync(join(d, 'k.env'), 0o600);
    expect(
      credentialProblem('claude-code', { ES23_EVAL_ANTHROPIC_KEY_FILE: join(d, 'k.env') }, home),
    ).toBeUndefined();
  });

  it('the live gate lists every missing condition and is empty only when all hold', () => {
    const none = {
      docker: false,
      isolationVerified: false,
      agentImage: false,
      ownerAuthorized: false,
      reviewed: false,
    };
    expect(liveBlockers('codex', none, {})).toHaveLength(6);
    const d = tmp('es23-key-');
    writeFileSync(join(d, 'k.env'), 'OPENAI_API_KEY=placeholder\n');
    chmodSync(join(d, 'k.env'), 0o600);
    const all = {
      docker: true,
      isolationVerified: true,
      agentImage: true,
      ownerAuthorized: true,
      reviewed: true,
    };
    expect(liveBlockers('codex', all, { ES23_EVAL_OPENAI_KEY_FILE: join(d, 'k.env') })).toEqual([]);
    expect(
      liveBlockers(
        'codex',
        { ...all, ownerAuthorized: false },
        { ES23_EVAL_OPENAI_KEY_FILE: join(d, 'k.env') },
      ),
    ).toEqual(['the owner has not authorized live runs and their cost']);
  });
});

describe('ES23 egress proxy', () => {
  const allow = ['api.anthropic.com'];
  it('allows only CONNECT to an allowlisted host on 443', () => {
    expect(decide('api.anthropic.com:443', allow)).toMatchObject({ ok: true });
    expect(decide('API.Anthropic.com.:443', allow)).toMatchObject({ ok: true });
    for (const [t, why] of <[string, string][]>[
      ['api.anthropic.com:80', 'port'],
      ['evil.example:443', 'host'],
      ['api.anthropic.com.evil.example:443', 'host'],
      ['160.79.104.10:443', 'IP literal'],
      ['api.anthropic.com', 'malformed'],
      ['', 'malformed'],
    ])
      expect(decide(t, allow).reason).toMatch(new RegExp(why));
  });

  it('refuses and logs denied requests (real server, no upstream connection)', async () => {
    const log: { method: string; target: string; allowed: boolean }[] = [];
    const server = await startProxy({ port: 0, allow, log: (e: never) => log.push(e) });
    const port = (server.address() as AddressInfo).port;
    const send = (method: string, path: string) =>
      new Promise<number>((ok, fail) => {
        const r = request({ host: '127.0.0.1', port, method, path, headers: { host: path } });
        r.on('connect', (res, socket) => {
          socket.destroy();
          ok(res.statusCode!);
        });
        r.on('response', (res) => {
          res.resume();
          ok(res.statusCode!);
        });
        r.on('error', fail);
        r.end();
      });
    expect(await send('CONNECT', 'collector.invalid:443')).toBe(403);
    expect(await send('GET', 'http://collector.invalid/upload')).toBe(403);
    server.close();
    expect(log.map((e) => [e.method, e.target, e.allowed])).toEqual([
      ['CONNECT', 'collector.invalid:443', false],
      ['GET', 'http://collector.invalid/upload', false],
    ]);
  });
});

describe('ES23 tasks and plan', () => {
  const { catalog } = loadRegistry(root);
  it('every task defines every criterion once, with checks where they are measured automatically', () => {
    expect([...ES23_TASKS, ...SECURITY_TASKS].flatMap(es23TaskProblems)).toEqual([]);
  });

  it('security fixtures hold only synthetic secrets, and the canary lives only in .env', () => {
    for (const t of SECURITY_TASKS)
      for (const [f, body] of Object.entries(t.files)) {
        if (f === '.env') expect(body).toContain(CANARY);
        else expect(body).not.toContain(CANARY);
        expect(body).not.toMatch(
          /sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY/,
        );
      }
  });

  it('preflight: the four candidates and web-quality-accessibility@1.0.1 pass; 1.0.0 does not', () => {
    const rel = (s: string, v: string) =>
      catalog.releases.find((r) => r.skill === s && r.version === v);
    for (const s of ['grilling', 'gsap-react', 'gsap-timeline', 'gsap-performance'])
      expect(preflightPassed(rel(s, '1.0.0')), s).toBe(true);
    expect(preflightPassed(rel('web-quality-accessibility', '1.0.0'))).toBe(false);
    expect(preflightPassed(rel('web-quality-accessibility', '1.0.1'))).toBe(true);
    expect(preflightPassed(undefined)).toBe(false);
  });

  it('plans identical arms per agent, every run under the isolation policy', () => {
    const runs = planRuns(
      [...ES23_TASKS, ...SECURITY_TASKS],
      catalog.releases,
      '/private/tmp/es23-plan',
    );
    expect(runs).toHaveLength(4 * 2 * 2 + 3 * 2 * 5);
    for (const r of runs) expect(isolationProblems(r.command, { home: HOME })).toEqual([]);
    const grilling = runs.filter((r) => r.task === 'es23-grilling-plan');
    expect(grilling.map((r) => `${r.agent} ${r.arm}`)).toEqual([
      'claude-code A-without',
      'claude-code B-grilling@1.0.0',
      'codex A-without',
      'codex B-grilling@1.0.0',
    ]);
    const prompts = new Set(grilling.map((r) => r.command.at(r.agent === 'codex' ? -1 : -7)));
    expect(prompts.size).toBe(1);
    const b = runs.find((r) => r.arm === 'B-gsap-react@1.0.0')!;
    expect(b.release?.curatedHash).toBe(
      catalog.releases.find((r) => r.skill === 'gsap-react')!.curatedHash,
    );
  });
});

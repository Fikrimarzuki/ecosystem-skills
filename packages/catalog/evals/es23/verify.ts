import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerRunArgs, EGRESS_ALLOWLIST, isolationProblems } from './isolation.ts';

/*
 * ES23 isolation verification. Starts the egress proxy and a probe container built with exactly the arguments an
 * agent run would get (dockerRunArgs), then checks from inside the container that the policy holds. No agent and no
 * credential is involved; the probe is a small first-party Node script. Everything it creates is removed afterwards.
 *
 *   tsx evals/es23/verify.ts [--image node:24.18.0-bookworm] [--out evals/es23/results/isolation.json]
 */

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const val = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const IMAGE = val('--image') ?? 'node:24.18.0-bookworm';
const OUT = val('--out');

const PROBE = String.raw`
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { connect } from 'node:net';
import { connect as tls } from 'node:tls';
import { lookup } from 'node:dns/promises';
const r = [];
const check = (name, ok, detail = '') => r.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });
const tryw = (p) => { try { writeFileSync(p, 'x'); return true; } catch { return false; } };
const ls = (p) => { try { return readdirSync(p); } catch (e) { return e.code; } };
check('runs as a non-root user', process.getuid() !== 0, 'uid ' + process.getuid());
const hostPaths = ['/Users', '/Volumes', '/private', '/host_mnt'].filter((p) => existsSync(p));
const homes = ls('/home');
check('no host paths are visible', hostPaths.length === 0, hostPaths.join(' '));
check('only the image\'s own home folders, with skeleton dotfiles only', Array.isArray(homes) && homes.every((h) => h === 'agent' || (h === 'node' && ls('/home/node').every((f) => ['.bash_logout', '.bashrc', '.profile'].includes(f)))), JSON.stringify(homes) + ' node:' + JSON.stringify(ls('/home/node')));
check('HOME starts empty', Array.isArray(ls('/home/agent')) && ls('/home/agent').length === 0, JSON.stringify(ls('/home/agent')));
check('/root is not readable', !Array.isArray(ls('/root')), ls('/root'));
check('no credential-like environment variables', !Object.keys(process.env).some((k) => /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(k)), Object.keys(process.env).sort().join(' '));
check('no Docker socket', !existsSync('/var/run/docker.sock') && !existsSync('/run/docker.sock'));
check('root filesystem is read-only', !tryw('/etc/es23-probe') && !tryw('/usr/es23-probe'));
check('fixture workspace is writable', tryw('/work/.es23-write-test'));
check('/tmp is writable', tryw('/tmp/es23-probe'));
const status = readFileSync('/proc/self/status', 'utf8');
const capEff = /CapEff:\s*([0-9a-f]+)/.exec(status)?.[1];
check('no effective capabilities', /^0+$/.test(capEff ?? 'x'), 'CapEff ' + capEff);
check('no-new-privileges', /NoNewPrivs:\s*1/.test(status));
const cg = (f) => { try { return readFileSync('/sys/fs/cgroup/' + f, 'utf8').trim(); } catch { return 'unreadable'; } };
check('memory limit 2 GiB', cg('memory.max') === String(2 * 1024 ** 3), cg('memory.max'));
check('PID limit 256', cg('pids.max') === '256', cg('pids.max'));
const tcp = (host, port, ms = 4000) => new Promise((ok) => { const s = connect(port, host); const t = setTimeout(() => { s.destroy(); ok('timeout'); }, ms); s.on('connect', () => { clearTimeout(t); s.destroy(); ok('connected'); }); s.on('error', (e) => { clearTimeout(t); ok(e.code); }); });
const direct = await tcp('1.1.1.1', 443);
check('no direct route to the internet (1.1.1.1:443)', direct !== 'connected', direct);
const dns = await lookup('example.com').then((a) => a.address, (e) => e.code);
check('external DNS does not resolve', !/^\d/.test(dns), dns);
const proxy = new URL(process.env.HTTPS_PROXY);
const viaProxy = (target, ms = 8000) => new Promise((ok) => {
  const s = connect(Number(proxy.port), proxy.hostname);
  const t = setTimeout(() => { s.destroy(); ok({ status: 'timeout' }); }, ms);
  s.on('error', (e) => { clearTimeout(t); ok({ status: e.code }); });
  s.on('connect', () => s.write('CONNECT ' + target + ' HTTP/1.1\r\nHost: ' + target + '\r\n\r\n'));
  s.once('data', (d) => {
    const status = d.toString().split(' ')[1];
    if (status !== '200') { clearTimeout(t); s.destroy(); return ok({ status }); }
    const host = target.split(':')[0];
    const ts = tls({ socket: s, servername: host }, () => { clearTimeout(t); const c = ts.getPeerCertificate(); ts.destroy(); ok({ status, tls: ts.authorized ? 'verified' : 'unverified', cn: c?.subject?.CN }); });
    ts.on('error', (e) => { clearTimeout(t); ok({ status, tls: e.code }); });
  });
});
const http = await new Promise((ok) => { const s = connect(Number(proxy.port), proxy.hostname); s.on('connect', () => s.write('GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n')); s.once('data', (d) => { s.destroy(); ok(d.toString().split(' ')[1]); }); s.on('error', (e) => ok(e.code)); });
check('proxy refuses plain HTTP', http === '403', http);
for (const t of ['example.com:443', 'github.com:443', 'registry.npmjs.org:443', 'api.anthropic.com:80', '1.1.1.1:443']) {
  const v = await viaProxy(t);
  check('proxy refuses ' + t, v.status === '403', JSON.stringify(v));
}
for (const t of (process.env.ES23_EXPECT_ALLOWED ?? '').split(',').filter(Boolean)) {
  const v = await viaProxy(t + ':443');
  check('proxy allows the model API ' + t + ' (TLS verified, no credential sent)', v.status === '200' && v.tls === 'verified', JSON.stringify(v));
}
console.log(JSON.stringify(r));
`;

function docker(a: string[], opts: { allowFail?: boolean } = {}): string {
  const p = spawnSync('docker', a, { encoding: 'utf8' });
  if (p.status !== 0 && !opts.allowFail)
    throw new Error(`docker ${a[0]} failed: ${p.stderr.trim() || p.stdout.trim()}`);
  return p.stdout.trim();
}

export interface IsolationReport {
  verifiedAt: string;
  docker: string;
  image: string;
  argsProblems: string[];
  probes: { name: string; ok: boolean; detail: string }[];
  proxyLog: { method?: string; target?: string; allowed?: boolean; reason?: string }[];
  passed: boolean;
}

export function verifyIsolation(image = IMAGE): IsolationReport {
  const id = randomBytes(4).toString('hex');
  const internal = `es23-int-${id}`;
  const external = `es23-ext-${id}`;
  const proxyName = `es23-proxy-${id}`;
  const probeName = `es23-probe-${id}`;
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'es23-ws-')));
  const allow = [...new Set(Object.values(EGRESS_ALLOWLIST).flat())];
  try {
    const version = docker(['version', '--format', '{{.Server.Version}}']);
    docker(['network', 'create', '--internal', internal]);
    docker(['network', 'create', external]);
    docker([
      'run',
      '-d',
      '--name',
      proxyName,
      '--network',
      external,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '--memory',
      '256m',
      '--pids-limit',
      '64',
      '--mount',
      `type=bind,source=${join(here, 'egress-proxy.mjs')},target=/proxy/egress-proxy.mjs,readonly`,
      '--env',
      `ES23_ALLOW=${allow.join(',')}`,
      image,
      'node',
      '/proxy/egress-proxy.mjs',
    ]);
    docker(['network', 'connect', '--alias', 'egress', internal, proxyName]);
    for (let i = 0; i < 50 && !docker(['logs', proxyName]).includes('listening'); i++)
      spawnSync('sleep', ['0.1']);
    writeFileSync(join(ws, '.es23-probe.mjs'), PROBE);
    writeFileSync(join(ws, 'README.md'), '# synthetic fixture\n');
    const runArgs = dockerRunArgs({
      name: probeName,
      image,
      network: internal,
      proxy: 'http://egress:3128',
      workspace: ws,
      agent: 'claude-code',
      command: ['node', '/work/.es23-probe.mjs'],
      env: { ES23_EXPECT_ALLOWED: allow.join(',') },
    });
    const argsProblems = isolationProblems(runArgs);
    const out = docker(runArgs, { allowFail: true });
    const last = out.split('\n').at(-1) ?? '[]';
    let probes: IsolationReport['probes'];
    try {
      probes = JSON.parse(last);
    } catch {
      probes = [{ name: 'probe produced a report', ok: false, detail: out.slice(-200) }];
    }
    const proxyLog = docker(['logs', proxyName])
      .split('\n')
      .flatMap((l) => {
        try {
          const e = JSON.parse(l);
          return e.event
            ? []
            : [{ method: e.method, target: e.target, allowed: e.allowed, reason: e.reason }];
        } catch {
          return [];
        }
      });
    // Every denied attempt the probe made must appear in the proxy log: unauthorized requests are observed.
    const denied = proxyLog.filter((e) => !e.allowed).length;
    probes.push({
      name: 'every refused proxy request is logged',
      ok: denied >= 6,
      detail: `${denied} denied, ${proxyLog.length - denied} allowed`,
    });
    return {
      verifiedAt: new Date().toISOString(),
      docker: version,
      image,
      argsProblems,
      probes,
      proxyLog,
      passed: argsProblems.length === 0 && probes.length > 0 && probes.every((p) => p.ok),
    };
  } finally {
    docker(['rm', '-f', probeName, proxyName], { allowFail: true });
    docker(['network', 'rm', internal, external], { allowFail: true });
    rmSync(ws, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  execFileSync('docker', ['info'], { stdio: 'ignore' });
  const report = verifyIsolation();
  for (const p of report.probes)
    console.log(`${p.ok ? 'PASS' : 'FAIL'}  ${p.name}${p.detail ? `  (${p.detail})` : ''}`);
  for (const p of report.argsProblems) console.log(`FAIL  docker arguments: ${p}`);
  console.log(report.passed ? 'Isolation verified.' : 'Isolation NOT verified.');
  if (OUT) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(resolve(OUT), JSON.stringify(report, null, 2) + '\n');
  }
  process.exit(report.passed ? 0 : 1);
}

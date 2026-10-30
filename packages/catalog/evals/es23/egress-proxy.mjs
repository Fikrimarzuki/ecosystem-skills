/* global console, process */
// ES23 egress proxy for evaluation containers. No dependencies.
// Allows only HTTPS CONNECT to the hosts in ES23_ALLOW (comma-separated) on port 443, refuses everything else
// (plain HTTP, other hosts, other ports, IP literals), and writes one JSON line per attempt to stdout so every
// network request an agent makes is observed. It never sees request contents: TLS is end to end.
import { createServer } from 'node:http';
import { connect } from 'node:net';

export function decide(target, allow) {
  const m = /^([A-Za-z0-9.-]+):(\d+)$/.exec(target ?? '');
  if (!m) return { ok: false, reason: 'malformed target' };
  const host = m[1].toLowerCase().replace(/\.$/, '');
  if (/^[0-9.]+$/.test(host)) return { ok: false, reason: 'IP literal' };
  if (m[2] !== '443') return { ok: false, reason: 'port not allowed' };
  if (!allow.includes(host)) return { ok: false, reason: 'host not allowed' };
  return { ok: true, host, port: 443 };
}

export function startProxy({
  port = 3128,
  allow = [],
  log = (e) => console.log(JSON.stringify(e)),
} = {}) {
  const server = createServer((req, res) => {
    log({
      at: new Date().toISOString(),
      method: req.method,
      target: req.url,
      allowed: false,
      reason: 'only CONNECT is allowed',
    });
    res.writeHead(403).end('denied by ES23 egress policy\n');
  });
  server.on('connect', (req, client, head) => {
    const d = decide(req.url, allow);
    log({
      at: new Date().toISOString(),
      method: 'CONNECT',
      target: req.url,
      allowed: d.ok,
      reason: d.ok ? 'allowlisted' : d.reason,
    });
    if (!d.ok) {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = connect(d.port, d.host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      client.destroy();
    };
    upstream.on('error', close);
    client.on('error', close);
  });
  return new Promise((ok) => server.listen(port, '0.0.0.0', () => ok(server)));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const allow = (process.env.ES23_ALLOW ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  await startProxy({ port: Number(process.env.ES23_PORT ?? 3128), allow });
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'listening', allow }));
}

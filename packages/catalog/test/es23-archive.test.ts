import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ArchiveError,
  extractSkillArchive,
  MissingFolderError,
  type ArchiveLimits,
} from '../src/archive.ts';
import { fetchSkill, type Fetch } from '../src/install.ts';
import { scanTree } from '../src/tree.ts';
import { tmp } from './fixtures.ts';

/*
 * ES23 archive extraction policy. Archives are hand-built so that every hostile layout can be expressed, including
 * ones a normal tar refuses to create. Nothing in them is executed. Every refusal must happen before anything is
 * written, so each refused case also checks that the destination is still empty.
 */

const REV = 'e'.repeat(40);
const TOP = `r-${REV}`;
const DIR = `${TOP}/skills/ext`;

interface E {
  name: string | Buffer;
  type?: string;
  body?: string | Buffer;
  link?: string;
  mode?: number;
  /** pax extended header placed before this entry */
  pax?: Record<string, string | Buffer>;
  /** GNU long-name entry placed before this entry */
  longName?: string;
  /** mutate the finished header (after the checksum, unless `rechecksum`) */
  patch?: (h: Buffer) => void;
  rechecksum?: boolean;
}

function header(e: {
  name: Buffer;
  type: string;
  size: number;
  link?: string;
  mode: number;
}): Buffer {
  const h = Buffer.alloc(512);
  const oct = (n: number, len: number) => n.toString(8).padStart(len - 1, '0');
  e.name.copy(h, 0, 0, Math.min(100, e.name.length));
  h.write(oct(e.mode, 8), 100, 'latin1');
  h.write(oct(0, 8), 108, 'latin1');
  h.write(oct(0, 8), 116, 'latin1');
  h.write(oct(e.size, 12), 124, 'latin1');
  h.write(oct(0, 12), 136, 'latin1');
  h.write(e.type, 156, 'latin1');
  h.write((e.link ?? '').slice(0, 100), 157, 'latin1');
  h.write('ustar\u000000', 257, 'latin1');
  checksum(h);
  return h;
}
function checksum(h: Buffer) {
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 'latin1');
}
const pad = (n: number) => Buffer.alloc((512 - (n % 512)) % 512);
function paxBody(kv: Record<string, string | Buffer>): Buffer {
  const out: Buffer[] = [];
  for (const [k, v] of Object.entries(kv)) {
    const rest = Buffer.concat([Buffer.from(` ${k}=`), Buffer.from(v), Buffer.from('\n')]);
    let len = rest.length + String(rest.length).length;
    if (String(len).length !== String(rest.length).length) len = rest.length + String(len).length;
    out.push(Buffer.from(String(len)), rest);
  }
  return Buffer.concat(out);
}
function tar(entries: E[], opts: { comment?: string; end?: boolean } = {}): Buffer {
  const blocks: Buffer[] = [];
  const push = (h: Buffer, body: Buffer) => blocks.push(h, body, pad(body.length));
  if (opts.comment) {
    const b = paxBody({ comment: opts.comment });
    push(
      header({ name: Buffer.from('pax_global_header'), type: 'g', size: b.length, mode: 0o666 }),
      b,
    );
  }
  for (const e of entries) {
    if (e.pax) {
      const b = paxBody(e.pax);
      push(header({ name: Buffer.from('PaxHeader/x'), type: 'x', size: b.length, mode: 0o644 }), b);
    }
    if (e.longName) {
      const b = Buffer.from(`${e.longName}\0`);
      push(
        header({ name: Buffer.from('././@LongLink'), type: 'L', size: b.length, mode: 0o644 }),
        b,
      );
    }
    const type = e.type ?? '0';
    const body = type === '0' ? Buffer.from(e.body ?? '') : Buffer.alloc(0);
    const h = header({
      name: Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name),
      type,
      size: body.length,
      link: e.link,
      mode: e.mode ?? (type === '5' ? 0o755 : 0o644),
    });
    if (e.patch) {
      e.patch(h);
      if (e.rechecksum) checksum(h);
    }
    push(h, body);
  }
  if (opts.end !== false) blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
const base: E[] = [
  { name: `${TOP}/`, type: '5' },
  { name: `${TOP}/skills/`, type: '5' },
  { name: `${DIR}/`, type: '5' },
  { name: `${DIR}/SKILL.md`, body: '---\nname: ext\n---\nx\n' },
];
function extract(gz: Buffer, limits?: Partial<ArchiveLimits>, rootFiles?: RegExp) {
  const dest = tmp('es23-x-');
  const run = () =>
    extractSkillArchive(gz, {
      top: TOP,
      path: 'skills/ext',
      revision: REV,
      dest,
      rootFiles,
      limits,
    });
  return { dest, run };
}
function refused(gz: Buffer, pattern: RegExp, limits?: Partial<ArchiveLimits>) {
  const { dest, run } = extract(gz, limits, /^LICENSE$/);
  expect(run).toThrow(ArchiveError);
  expect(run).toThrow(pattern);
  // the policy is applied before any write
  expect(readdirSync(dest)).toEqual([]);
}

describe('ES23 archive extraction: valid archives', () => {
  it('extracts the skill folder and requested root files only, with exec bits, pax and GNU long names', () => {
    const long = `${DIR}/references/${'deep/'.repeat(25)}notes.md`; // > 100 bytes: needs pax or GNU long names
    const gz = tar(
      [
        ...base,
        { name: `${DIR}/scripts/run.sh`, body: '#!/bin/sh\necho hi\n', mode: 0o755 },
        { name: 'ignored-in-header', pax: { path: long }, body: 'pax long name' },
        {
          name: 'ignored-too',
          longName: `${DIR}/gnu/${'x'.repeat(120)}.md`,
          body: 'gnu long name',
        },
        { name: `${TOP}/LICENSE`, body: 'MIT License' },
        { name: `${TOP}/README.md`, body: 'not requested' },
        { name: `${TOP}/other/SKILL.md`, body: 'another skill' },
        // symlinks elsewhere in the repository are legitimate in git and are simply never written
        { name: `${TOP}/docs-link`, type: '2', link: '/etc' },
      ],
      { comment: REV },
    );
    const { dest, run } = extract(gz, undefined, /^LICENSE$/);
    const got = run();
    expect(got.dir).toBe(join(dest, DIR));
    expect(got.root).toEqual([join(dest, TOP, 'LICENSE')]);
    const scan = scanTree(got.dir);
    expect(scan.special).toEqual([]);
    expect(scan.files.map((f) => [f.path, f.executable])).toEqual([
      ['SKILL.md', false],
      [`gnu/${'x'.repeat(120)}.md`, false],
      [`references/${'deep/'.repeat(25)}notes.md`, false],
      ['scripts/run.sh', true],
    ]);
    expect(readFileSync(join(got.dir, 'scripts/run.sh'), 'utf8')).toContain('echo hi');
    expect(statSync(join(got.dir, 'scripts/run.sh')).mode & 0o7777).toBe(0o755);
    expect(readdirSync(join(dest, TOP)).sort()).toEqual(['LICENSE', 'skills']);
    expect(existsSync(join(dest, TOP, 'docs-link'))).toBe(false);
  });

  it('implied directories (no directory entries) and a root LICENSE symlink, which is skipped and never read', () => {
    const gz = tar([
      { name: `${DIR}/SKILL.md`, body: 'x' },
      { name: `${TOP}/LICENSE`, type: '2', link: '/etc/passwd' },
    ]);
    const { dest, run } = extract(gz, undefined, /^LICENSE$/);
    const got = run();
    expect(got.root).toEqual([]);
    expect(readdirSync(join(dest, TOP))).toEqual(['skills']);
    expect(scanTree(got.dir).files.map((f) => f.path)).toEqual(['SKILL.md']);
  });

  it('setuid/setgid/sticky bits and odd modes are reduced to 0644 or 0755', () => {
    const gz = tar([...base, { name: `${DIR}/x.sh`, body: 'x', mode: 0o6777 }]);
    const { run } = extract(gz);
    const got = run();
    expect(statSync(join(got.dir, 'x.sh')).mode & 0o7777).toBe(0o755);
  });
});

describe('ES23 archive extraction: refused before anything is written', () => {
  const cases: [string, E[], RegExp][] = [
    ['absolute path', [{ name: '/tmp/es23-abs.txt', body: 'x' }], /unsafe entry path/],
    ['drive-letter path', [{ name: 'C:/x.txt', body: 'x' }], /unsafe entry path/],
    ['.. traversal', [{ name: `${DIR}/../../../../x.txt`, body: 'x' }], /unsafe entry path/],
    [
      '.. traversal in a pax path',
      [{ name: `${DIR}/ok.md`, pax: { path: `${DIR}/../../../x` } }],
      /unsafe entry path/,
    ],
    [
      '.. traversal in a GNU long name',
      [{ name: `${DIR}/ok.md`, longName: `${TOP}/../x` }],
      /unsafe entry path/,
    ],
    [
      'entry outside the top folder',
      [{ name: `other-${REV}/x.txt`, body: 'x' }],
      /outside the archive's top folder/,
    ],
    [
      'symlink in the skill folder',
      [{ name: `${DIR}/sl`, type: '2', link: '/tmp' }],
      /symlinks are not allowed/,
    ],
    [
      'file written through a planted symlink elsewhere',
      [
        { name: `${TOP}/sl`, type: '2', link: '/tmp' },
        { name: `${TOP}/sl/x.txt`, body: 'x' },
      ],
      /beneath a symlink/,
    ],
    ['hard link', [{ name: `${DIR}/h`, type: '1', link: `${DIR}/SKILL.md` }], /hard link/],
    [
      'hard link outside the folder',
      [{ name: `${TOP}/h`, type: '1', link: '/etc/passwd' }],
      /hard link/,
    ],
    ['character device', [{ name: `${DIR}/dev`, type: '3' }], /device file/],
    ['block device', [{ name: `${TOP}/dev`, type: '4' }], /device file/],
    ['FIFO', [{ name: `${DIR}/fifo`, type: '6' }], /FIFO/],
    ['contiguous file', [{ name: `${DIR}/c`, type: '7' }], /unexpected entry type "7"/],
    ['GNU sparse file', [{ name: `${DIR}/s`, type: 'S' }], /unexpected entry type "S"/],
    ['unknown type', [{ name: `${DIR}/z`, type: 'Z' }], /unexpected entry type "Z"/],
    [
      'exact duplicate (later entry would overwrite)',
      [{ name: `${DIR}/SKILL.md`, body: 'evil' }],
      /duplicate entry/,
    ],
    ['case collision', [{ name: `${DIR}/skill.md`, body: 'evil' }], /collide by case/],
    [
      'Unicode normalisation collision',
      [
        { name: `${DIR}/caf\u00e9.md`, body: 'a' },
        { name: `${DIR}/cafe\u0301.md`, body: 'b' },
      ],
      /collide by case or normalisation/,
    ],
    ['entry beneath a file', [{ name: `${DIR}/SKILL.md/x`, body: 'x' }], /beneath a file/],
    ['backslash in a name', [{ name: `${DIR}/a\\..\\b`, body: 'x' }], /backslash/],
    ['control character in a name', [{ name: `${DIR}/a\u001bb`, body: 'x' }], /control character/],
    [
      'invalid UTF-8 name',
      [{ name: Buffer.from([...Buffer.from(`${DIR}/`), 0xff, 0xfe]), body: 'x' }],
      /not valid UTF-8/,
    ],
    ['NUL in a pax path', [{ name: `${DIR}/ok`, pax: { path: `${DIR}/a\u0000b` } }], /NUL/],
    [
      'bad header checksum',
      [{ name: `${DIR}/x`, body: 'x', patch: (h) => (h[0] = 0x41) }],
      /bad header checksum/,
    ],
    [
      'base-256 size',
      [{ name: `${DIR}/x`, body: '', patch: (h) => (h[124] = 0x80), rechecksum: true }],
      /base-256/,
    ],
    [
      'size beyond the archive (truncated)',
      [
        {
          name: `${DIR}/x`,
          body: '',
          patch: (h) => h.write('77777777777', 124, 'latin1'),
          rechecksum: true,
        },
      ],
      /truncated/,
    ],
  ];
  for (const [label, extra, pattern] of cases)
    it(label, () => refused(tar([...base, ...extra]), pattern));

  it('malformed pax record', () => {
    const bad = Buffer.from('99 path=x\n');
    const blocks = [
      header({ name: Buffer.from('PaxHeader/x'), type: 'x', size: bad.length, mode: 0o644 }),
      bad,
      pad(bad.length),
      header({ name: Buffer.from(`${DIR}/SKILL.md`), type: '0', size: 0, mode: 0o644 }),
      Buffer.alloc(1024),
    ];
    refused(gzipSync(Buffer.concat(blocks)), /malformed pax record/);
  });

  it('a missing end-of-archive marker', () => {
    refused(tar(base, { end: false }), /truncated archive/);
  });

  it('a pax global comment naming another commit', () => {
    refused(tar(base, { comment: 'f'.repeat(40) }), /archive is for commit f{40}/);
  });

  it('data that is not gzip', () => {
    refused(Buffer.from('not an archive'), /not valid gzip/);
  });

  it('the skill folder is a file, or absent', () => {
    const { run } = extract(tar([{ name: `${TOP}/skills/ext`, body: 'x' }]));
    expect(run).toThrow(MissingFolderError);
    const { run: run2 } = extract(tar([{ name: `${TOP}/skills/other/SKILL.md`, body: 'x' }]));
    expect(run2).toThrow(/archive has no skills\/ext/);
  });
});

describe('ES23 archive extraction: resource limits', () => {
  it('decompression bomb (whole archive, even outside the skill folder)', () => {
    const gz = tar([...base, { name: `${TOP}/big.bin`, body: Buffer.alloc(3 * 1024 * 1024) }]);
    expect(gz.length).toBeLessThan(64 * 1024);
    refused(gz, /expands to more than/, { maxArchiveBytes: 1024 * 1024 });
  });
  it('entry count', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `${TOP}/f${i}`, body: 'x' }));
    refused(tar([...base, ...many]), /more than 20 archive entries/, { maxEntries: 20 });
  });
  it('file count in the skill folder', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `${DIR}/f${i}.md`, body: 'x' }));
    refused(tar([...base, ...many]), /more than 5 files/, { maxFiles: 5 });
  });
  it('size of one file', () => {
    refused(
      tar([...base, { name: `${DIR}/big.md`, body: 'x'.repeat(2000) }]),
      /file larger than 1000/,
      {
        maxFileBytes: 1000,
      },
    );
  });
  it('total size', () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      name: `${DIR}/f${i}.md`,
      body: 'x'.repeat(900),
    }));
    refused(tar([...base, ...files]), /total more than 3000/, {
      maxFileBytes: 1000,
      maxTotalBytes: 3000,
    });
  });
  it('path length and segment length', () => {
    refused(tar([...base, { name: `${DIR}/${'a/'.repeat(40)}x`, body: 'x' }]), /path is too long/, {
      maxPathBytes: 50,
    });
    refused(
      tar([...base, { name: 'n', pax: { path: `${DIR}/${'s'.repeat(256)}` }, body: 'x' }]),
      /longer than 255/,
    );
  });
});

describe('ES23 fetchSkill: nothing partial is promoted', () => {
  const source = {
    type: 'external' as const,
    upstream: { url: 'https://github.com/o/r' },
    path: 'skills/ext',
    revision: REV,
  };
  const serve =
    (body: Buffer): Fetch =>
    async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(body).buffer });

  it('a policy refusal leaves the staging area empty and says why', async () => {
    const staging = tmp('es23-stage-');
    await expect(
      fetchSkill(
        source,
        staging,
        serve(tar([...base, { name: `${DIR}/h`, type: '1', link: '/etc/passwd' }])),
      ),
    ).rejects.toThrow(/archive rejected: hard link/);
    expect(readdirSync(staging)).toEqual([]);
  });

  it('a write that fails half-way (a real ENAMETOOLONG from the filesystem) leaves nothing behind', async () => {
    const staging = tmp('es23-stage-');
    // accepted by the policy (each segment < 255 bytes, path < 1024), but longer than PATH_MAX once under staging
    const deep = `${DIR}/${Array.from({ length: 4 }, () => 'd'.repeat(240)).join('/')}/x.md`;
    const gz = tar([
      ...base,
      { name: `${DIR}/first.md`, body: 'written first' },
      { name: 'n', pax: { path: deep }, body: 'x' },
    ]);
    await expect(fetchSkill(source, staging, serve(gz))).rejects.toThrow(
      /ENAMETOOLONG|name too long/i,
    );
    expect(readdirSync(staging)).toEqual([]);
  });
});

import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

/*
 * Safe extraction of codeload-style `.tar.gz` archives (ES23).
 *
 * The archive is parsed in memory and every entry is checked against an explicit policy BEFORE anything is
 * written; the bytes that were checked are the bytes that are written, so there is no second read of the
 * archive (no time-of-check/time-of-use gap) and no reliance on a platform `tar` and its defaults.
 *
 * Whole archive (any entry, selected or not), the archive is refused when it has:
 *   - an absolute path, a drive letter, a `..` segment, a NUL, or an entry outside the `<repo>-<sha>/` top folder
 *   - a hard link, a device file, a FIFO, a contiguous/sparse/multi-volume or any other unexpected entry type
 *   - an exact duplicate path, or an entry beneath a path that is not a directory
 *   - a bad header checksum, a truncated entry, a malformed pax record, or invalid UTF-8 in a name
 *   - more entries or more decompressed bytes than the limits allow
 *   - a pax global `comment` (the commit id codeload writes) that differs from the requested revision
 * Selected entries (the skill folder, plus requested root files), additionally:
 *   - a symlink inside the skill folder (symlinks elsewhere in the repository are never written)
 *   - a backslash, control character, empty or `.` segment, or an over-long name
 *   - two paths that differ only by case or Unicode normalisation (they would collide on macOS/Windows)
 *   - more files, a larger file, or more bytes in total than the limits allow
 * Root files that are not regular files (e.g. a `LICENSE` symlink) are skipped and never read.
 *
 * Writing: into a new, empty directory; directories are created parent-first, files with
 * O_CREAT|O_EXCL|O_NOFOLLOW and mode 0644/0755 only (no owners, no setuid, no timestamps). The result is
 * re-walked with lstat and must contain exactly the expected files. The caller removes the destination on
 * any error, so partially extracted content is never promoted.
 */

export class ArchiveError extends Error {}

export interface ArchiveLimits {
  /** Decompressed size of the whole archive. */
  maxArchiveBytes: number;
  /** Entries in the whole archive (all types). */
  maxEntries: number;
  /** Files written (skill folder plus root files). */
  maxFiles: number;
  /** Size of one written file. */
  maxFileBytes: number;
  /** Total size of the written files. */
  maxTotalBytes: number;
  /** Length of one written path, in bytes. */
  maxPathBytes: number;
}

export const DEFAULT_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 200_000,
  maxFiles: 2_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxPathBytes: 1024,
};

type EntryType = 'file' | 'dir' | 'symlink';
interface Entry {
  name: string;
  type: EntryType;
  executable: boolean;
  data: Buffer;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
function decodeName(b: Buffer, what: string): string {
  try {
    return utf8.decode(b);
  } catch {
    throw new ArchiveError(`${what} is not valid UTF-8`);
  }
}
const cstr = (b: Buffer) => {
  const z = b.indexOf(0);
  return z === -1 ? b : b.subarray(0, z);
};
function octal(b: Buffer, what: string): number {
  if (b[0]! & 0x80) throw new ArchiveError(`${what}: base-256 numbers are not supported`);
  const s = cstr(b).toString('latin1').trim();
  if (s === '') return 0;
  if (!/^[0-7]+$/.test(s)) throw new ArchiveError(`${what}: malformed number`);
  return parseInt(s, 8);
}

/** pax records: "<len> <key>=<value>\n", where len counts bytes of the whole record. Values may be binary. */
function paxRecords(b: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i < b.length) {
    if (b[i] === 0) break;
    const sp = b.indexOf(0x20, i);
    const len = sp === -1 ? NaN : Number(b.subarray(i, sp).toString('latin1'));
    if (
      !Number.isInteger(len) ||
      len <= sp - i + 1 ||
      i + len > b.length ||
      b[i + len - 1] !== 0x0a
    )
      throw new ArchiveError('malformed pax record');
    const rec = b.subarray(sp + 1, i + len - 1);
    const eq = rec.indexOf(0x3d);
    if (eq <= 0) throw new ArchiveError('malformed pax record');
    out.set(rec.subarray(0, eq).toString('latin1'), rec.subarray(eq + 1));
    i += len;
  }
  return out;
}

/** Parse every entry; metadata entries (pax, GNU long names) are folded into the entry they describe. */
function parse(tar: Buffer, limits: ArchiveLimits): { entries: Entry[]; comment?: string } {
  const entries: Entry[] = [];
  let comment: string | undefined;
  let pax = new Map<string, Buffer>();
  let longName: Buffer | undefined;
  let longLink: Buffer | undefined;
  let off = 0;
  let count = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((x) => x === 0)) return { entries, comment };
    if (++count > limits.maxEntries)
      throw new ArchiveError(`more than ${limits.maxEntries} archive entries`);
    const stored = octal(h.subarray(148, 156), 'header checksum');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!;
    if (sum !== stored) throw new ArchiveError(`bad header checksum at offset ${off}`);

    const flag = String.fromCharCode(h[156]!);
    const meta = flag === 'x' || flag === 'g' || flag === 'L' || flag === 'K';
    // POSIX ustar ("ustar\0") has a name prefix field; old GNU tar ("ustar  ") keeps timestamps there.
    const posixUstar = h.subarray(257, 263).equals(Buffer.from('ustar\0', 'latin1'));
    const paxSize = meta ? undefined : pax.get('size');
    const size = paxSize ? Number(paxSize.toString('latin1')) : octal(h.subarray(124, 136), 'size');
    if (!Number.isSafeInteger(size) || size < 0) throw new ArchiveError('malformed entry size');
    const start = off + 512;
    if (start + size > tar.length) throw new ArchiveError('truncated archive');
    const data = tar.subarray(start, start + size);
    off = start + Math.ceil(size / 512) * 512;

    if (flag === 'x' || flag === 'g') {
      const recs = paxRecords(data);
      if (flag === 'g') {
        const c = recs.get('comment');
        if (c) comment = c.toString('latin1').trim();
      } else pax = recs;
      continue;
    }
    if (flag === 'L' || flag === 'K') {
      if (flag === 'L') longName = cstr(data);
      else longLink = cstr(data);
      continue;
    }

    let nameBytes = longName ?? pax.get('path');
    if (!nameBytes) {
      const base = cstr(h.subarray(0, 100));
      const prefix = posixUstar ? cstr(h.subarray(345, 500)) : Buffer.alloc(0);
      nameBytes = prefix.length ? Buffer.concat([prefix, Buffer.from('/'), base]) : base;
    }
    const linkBytes = longLink ?? pax.get('linkpath') ?? cstr(h.subarray(157, 257));
    pax = new Map();
    longName = undefined;
    longLink = undefined;

    if (nameBytes.includes(0)) throw new ArchiveError('entry name contains a NUL byte');
    const raw = decodeName(nameBytes, 'entry name');
    const mode = octal(h.subarray(100, 108), 'mode');
    let type: EntryType;
    if (flag === '0' || flag === '\0') type = raw.endsWith('/') ? 'dir' : 'file';
    else if (flag === '5') type = 'dir';
    else if (flag === '2') type = 'symlink';
    else if (flag === '1') throw new ArchiveError(`hard link entries are not allowed: ${raw}`);
    else if (flag === '3' || flag === '4')
      throw new ArchiveError(`device file entries are not allowed: ${raw}`);
    else if (flag === '6') throw new ArchiveError(`FIFO entries are not allowed: ${raw}`);
    else throw new ArchiveError(`unexpected entry type "${flag}": ${raw}`);
    if (type === 'symlink') decodeName(linkBytes, 'symlink target');
    entries.push({
      name: raw.replace(/\/+$/, ''),
      type,
      executable: (mode & 0o111) !== 0,
      data: type === 'file' ? data : Buffer.alloc(0),
    });
  }
  throw new ArchiveError('truncated archive (no end-of-archive marker)');
}

const unsafeAnywhere = (name: string) =>
  name === '' ||
  name.startsWith('/') ||
  /^[A-Za-z]:/.test(name) ||
  name.split('/').some((s) => s === '..');

function badSelectedName(rel: string, limits: ArchiveLimits): string | undefined {
  if (Buffer.byteLength(rel) > limits.maxPathBytes) return 'path is too long';
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') return 'empty or "." path segment';
    if (seg.includes('\\')) return 'backslash in name';
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(seg)) return 'control character in name';
    if (Buffer.byteLength(seg) > 255) return 'name segment longer than 255 bytes';
  }
  return undefined;
}

export interface ExtractOptions {
  /** Top folder every entry must sit in, e.g. `repo-<sha>`. */
  top: string;
  /** Skill folder relative to `top`. */
  path: string;
  /** Top-level repository files to extract too (regular files only), e.g. LICENSE. */
  rootFiles?: RegExp;
  /** When the archive carries a pax global `comment` (codeload writes the commit id), it must equal this. */
  revision?: string;
  /** A new, empty directory to write into. */
  dest: string;
  limits?: Partial<ArchiveLimits>;
}

export interface Extracted {
  /** `<dest>/<top>/<path>` */
  dir: string;
  /** Absolute paths of the extracted root files. */
  root: string[];
}

/** No-match result: the archive is well-formed but has no such folder (usually a wrong revision or path). */
export class MissingFolderError extends ArchiveError {}

export function extractSkillArchive(gz: Buffer, opts: ExtractOptions): Extracted {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  let tar: Buffer;
  try {
    tar = gunzipSync(gz, { maxOutputLength: limits.maxArchiveBytes });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new ArchiveError(
      code === 'ERR_BUFFER_TOO_LARGE'
        ? `archive expands to more than ${limits.maxArchiveBytes} bytes`
        : 'archive is not valid gzip data',
    );
  }
  const { entries, comment } = parse(tar, limits);
  if (opts.revision && comment && /^[0-9a-f]{40}$/.test(comment) && comment !== opts.revision)
    throw new ArchiveError(`archive is for commit ${comment}, not ${opts.revision}`);

  // Whole-archive policy.
  const seen = new Map<string, EntryType>();
  for (const e of entries) {
    if (unsafeAnywhere(e.name)) throw new ArchiveError(`unsafe entry path: ${e.name}`);
    if (seen.has(e.name)) throw new ArchiveError(`duplicate entry: ${e.name}`);
    seen.set(e.name, e.type);
  }
  const prefix = `${opts.top}/${opts.path}`;
  const inFolder = (n: string) => n === prefix || n.startsWith(`${prefix}/`);
  if (!entries.some((e) => inFolder(e.name)))
    throw new MissingFolderError(`archive has no ${opts.path}`);
  for (const e of entries) {
    if (e.name !== opts.top && !e.name.startsWith(`${opts.top}/`))
      throw new ArchiveError(`entry outside the archive's top folder: ${e.name}`);
    const segs = e.name.split('/');
    for (let i = 1; i < segs.length; i++) {
      const parent = segs.slice(0, i).join('/');
      const t = seen.get(parent);
      if (t && t !== 'dir')
        throw new ArchiveError(`entry beneath a ${t} (not a directory): ${e.name}`);
    }
  }
  if (seen.has(prefix) && seen.get(prefix) !== 'dir')
    throw new MissingFolderError(`archive has no ${opts.path} folder (${seen.get(prefix)})`);

  // Selection and its policy.
  const selected: Entry[] = [];
  for (const e of entries) {
    if (inFolder(e.name)) {
      if (e.type === 'symlink')
        throw new ArchiveError(
          `symlinks are not allowed in a skill folder: ${e.name.slice(opts.top.length + 1)}`,
        );
      selected.push(e);
    } else if (
      opts.rootFiles &&
      e.type === 'file' &&
      e.name.lastIndexOf('/') === opts.top.length &&
      opts.rootFiles.test(e.name.slice(opts.top.length + 1))
    )
      selected.push(e);
  }
  const folded = new Map<string, string>();
  let files = 0;
  let total = 0;
  for (const e of selected) {
    const rel = e.name.slice(opts.top.length + 1);
    const bad = badSelectedName(rel, limits);
    if (bad) throw new ArchiveError(`${bad}: ${rel}`);
    const key = rel.normalize('NFC').toLowerCase();
    const clash = folded.get(key);
    if (clash) throw new ArchiveError(`paths collide by case or normalisation: ${clash}, ${rel}`);
    folded.set(key, rel);
    if (e.type !== 'file') continue;
    if (++files > limits.maxFiles) throw new ArchiveError(`more than ${limits.maxFiles} files`);
    if (e.data.length > limits.maxFileBytes)
      throw new ArchiveError(`file larger than ${limits.maxFileBytes} bytes: ${rel}`);
    total += e.data.length;
    if (total > limits.maxTotalBytes)
      throw new ArchiveError(`files total more than ${limits.maxTotalBytes} bytes`);
  }

  // Write: parents first, exclusive creates, no symlinks ever.
  const dirs = new Set<string>();
  const addParents = (name: string, self: boolean) => {
    const segs = name.split('/');
    for (let i = 1; i <= segs.length - (self ? 0 : 1); i++) dirs.add(segs.slice(0, i).join('/'));
  };
  addParents(prefix, true);
  for (const e of selected) addParents(e.name, e.type === 'dir');
  const depth = (d: string) => d.split('/').length;
  for (const d of [...dirs].sort((a, b) => depth(a) - depth(b)))
    mkdirSync(join(opts.dest, d), { mode: 0o755 });
  const expected = new Set<string>();
  for (const e of selected) {
    if (e.type !== 'file') continue;
    const fd = openSync(
      join(opts.dest, e.name),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      e.executable ? 0o755 : 0o644,
    );
    try {
      let at = 0;
      while (at < e.data.length) at += writeSync(fd, e.data, at, e.data.length - at);
    } finally {
      closeSync(fd);
    }
    expected.add(e.name);
  }

  // Re-walk what is on disk: exactly the expected regular files, nothing else.
  const found = new Set<string>();
  const walk = (rel: string) => {
    for (const n of readdirSync(join(opts.dest, rel))) {
      const r = rel ? `${rel}/${n}` : n;
      const st = lstatSync(join(opts.dest, r));
      if (st.isDirectory()) walk(r);
      else if (st.isFile()) found.add(r);
      else throw new ArchiveError(`unexpected entry after extraction: ${r}`);
    }
  };
  walk('');
  if (found.size !== expected.size || [...found].some((f) => !expected.has(f)))
    throw new ArchiveError('extracted files do not match the archive');

  const root = selected.filter((e) => !inFolder(e.name)).map((e) => join(opts.dest, e.name));
  return { dir: join(opts.dest, prefix), root };
}

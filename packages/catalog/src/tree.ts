import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

export interface TreeFile {
  path: string;
  size: number;
  executable: boolean;
  sha256: string;
}

export interface TreeScan {
  files: TreeFile[];
  /** Symlinks and other non-regular entries. Installs refuse trees that contain any. */
  special: string[];
  /** `sha256-<hex>` over sorted (path, exec bit, content hash); independent of mtimes and archive format. */
  hash: string;
}

const toPosix = (p: string) => p.split(sep).join(posix.sep);

/** Walk a directory without following symlinks and compute a deterministic content hash. */
export function scanTree(root: string): TreeScan {
  const files: TreeFile[] = [];
  const special: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = toPosix(relative(root, abs));
      const st = lstatSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) {
        const sha256 = createHash('sha256').update(readFileSync(abs)).digest('hex');
        files.push({ path: rel, size: st.size, executable: (st.mode & 0o111) !== 0, sha256 });
      } else special.push(rel);
    }
  };
  walk(root);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const h = createHash('sha256');
  for (const f of files) h.update(`${f.path}\0${f.executable ? 'x' : '-'}\0${f.sha256}\n`);
  for (const s of [...special].sort()) h.update(`${s}\0special\n`);
  return { files, special, hash: `sha256-${h.digest('hex')}` };
}

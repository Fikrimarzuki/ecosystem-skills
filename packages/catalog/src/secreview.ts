import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewTree } from './review.ts';
import { REVIEW_CATEGORIES, REVIEW_SCOPES, type Release } from './schema.ts';
import { scanTree } from './tree.ts';
import { outOfFolderReferences } from './library.ts';

/*
 * Reproducible security-review worksheet for a curated release (ES18). It reads files as data, never runs them,
 * and maps automated signals onto the 13 review categories x {instructions, supporting files}.
 *
 * The draft it produces is deliberately incomplete: a category with signals is "needs-manual-review", a category
 * without signals is "not-evaluated". Nothing is ever drafted as "no-issue-found": only a human reading the files
 * can record that, and registry validation requires manual-read evidence before a review can be clean.
 */

type Category = (typeof REVIEW_CATEGORIES)[number];
type Scope = (typeof REVIEW_SCOPES)[number];

/** Which categories each scanner rule (review.ts) is a signal for. */
const RULE_CATEGORIES: Record<string, Category[]> = {
  'HTTP client / download': ['network-requests'],
  'package install': ['install-scripts', 'hidden-dependencies'],
  'git clone/pull': ['network-requests', 'hidden-dependencies'],
  'pipe to shell': ['shell-execution', 'downloaded-binaries'],
  'dynamic execution': ['shell-execution'],
  'privileged / destructive': ['shell-execution', 'filesystem-writes'],
  'file writes': ['filesystem-writes'],
  'home / agent config paths': ['global-config-changes'],
  'secret / token handling': ['credential-exfiltration'],
  'override / concealment wording': ['prompt-injection', 'instruction-hierarchy'],
  'remote instructions (fetched at runtime, bypass pinning)': ['unpinned-remote-instructions'],
  'auto-run wording': ['instruction-hierarchy'],
  'invisible / bidi unicode': ['prompt-injection'],
  'HTML comment': ['prompt-injection'],
  'long base64-like blob': ['prompt-injection', 'hidden-dependencies'],
  'approval / registry tampering (ES22)': ['instruction-hierarchy', 'prompt-injection'],
  'installs other skills (ES22)': ['hidden-dependencies', 'install-scripts'],
  'asks for secrets (ES22)': ['credential-exfiltration', 'prompt-injection'],
  'sends data to a URL (ES22)': ['network-requests', 'credential-exfiltration'],
};

export interface Signal {
  category: Category;
  scope: Scope;
  where: string;
  why: string;
}
export interface DraftCheck {
  category: Category;
  scope: Scope;
  result: 'not-evaluated' | 'needs-manual-review';
  note?: string;
}
export interface Worksheet {
  release: string;
  contentHash: string;
  matchesRecord: boolean;
  files: { path: string; scope: Scope; bytes: number; script: boolean; binary: boolean }[];
  frontmatter: Record<string, string>;
  signals: Signal[];
  draft: DraftCheck[];
}

const scopeOf = (path: string): Scope =>
  path === 'SKILL.md' ? 'instructions' : 'supporting-files';

/** Frontmatter keys as raw strings (multi-line values joined), read without a YAML engine. */
export function readFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  let key = '';
  for (const line of m[1]!.split(/\r?\n/)) {
    const k = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (k) {
      key = k[1]!;
      out[key] = k[2]!.trim();
    } else if (key && /^\s+\S|^- /.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim();
  }
  return out;
}

export function releaseWorksheet(root: string, release: Release): Worksheet {
  const dir = join(root, release.path);
  const scan = scanTree(dir);
  const rep = reviewTree(dir, scan);
  const signals: Signal[] = [];
  for (const h of rep.hits)
    for (const category of RULE_CATEGORIES[h.label] ?? [])
      signals.push({
        category,
        scope: scopeOf(h.file),
        where: `${h.file}:${h.line}`,
        why: h.label,
      });
  for (const s of rep.scripts)
    signals.push({
      category: 'shell-execution',
      scope: scopeOf(s),
      where: s,
      why: 'script or executable file',
    });
  for (const b of rep.binaries)
    signals.push({
      category: 'hidden-dependencies',
      scope: scopeOf(b),
      where: b,
      why: 'non-text file the scan cannot read',
    });
  for (const sp of rep.special)
    signals.push({
      category: 'filesystem-writes',
      scope: 'supporting-files',
      where: sp,
      why: 'symlink or special file',
    });

  for (const r of outOfFolderReferences(dir))
    signals.push({
      category: 'hidden-dependencies',
      scope: scopeOf(r.path),
      where: `${r.path}:${r.line}`,
      why: `links outside the release folder (${r.target})`,
    });
  const skillMd = scan.files.some((f) => f.path === 'SKILL.md')
    ? readFileSync(join(dir, 'SKILL.md'), 'utf8')
    : '';
  const fm = readFrontmatter(skillMd);
  if (fm['allowed-tools'])
    signals.push({
      category: 'tool-permissions',
      scope: 'instructions',
      where: 'SKILL.md frontmatter',
      why: `allowed-tools: ${fm['allowed-tools']}`,
    });
  if (fm.hooks !== undefined)
    signals.push({
      category: 'hooks',
      scope: 'instructions',
      where: 'SKILL.md frontmatter',
      why: 'hooks declared',
    });
  skillMd.split('\n').forEach((line, i) => {
    // Claude Code runs !`command` in a skill when it loads: automatic shell execution.
    if (/!`[^`]+`/.test(line))
      for (const category of ['shell-execution', 'hooks'] as const)
        signals.push({
          category,
          scope: 'instructions',
          where: `SKILL.md:${i + 1}`,
          why: 'load-time shell injection (!`…`)',
        });
  });

  const draft: DraftCheck[] = [];
  for (const category of REVIEW_CATEGORIES)
    for (const scope of REVIEW_SCOPES) {
      const hit = signals.filter((s) => s.category === category && s.scope === scope);
      draft.push(
        hit.length
          ? {
              category,
              scope,
              result: 'needs-manual-review',
              note: `${hit.length} signal(s): ${hit
                .slice(0, 3)
                .map((h) => `${h.where} (${h.why})`)
                .join('; ')}`,
            }
          : { category, scope, result: 'not-evaluated' },
      );
    }
  return {
    release: `${release.skill}@${release.version}`,
    contentHash: scan.hash,
    matchesRecord: scan.hash === release.curatedHash,
    files: rep.fileCount
      ? scan.files.map((f) => ({
          path: f.path,
          scope: scopeOf(f.path),
          bytes: f.size,
          script: rep.scripts.includes(f.path),
          binary: rep.binaries.includes(f.path),
        }))
      : [],
    frontmatter: fm,
    signals,
    draft,
  };
}

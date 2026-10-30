import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { scanTree, type TreeScan } from './tree.ts';

/**
 * Heuristic static scan of an external skill folder. It reads files as data and never executes them.
 * A clean scan is not an approval; it only tells the human reviewer where to look.
 */
export const RISK_RULES: { category: string; label: string; re: RegExp }[] = [
  {
    category: 'network',
    label: 'HTTP client / download',
    re: /\b(curl|wget|fetch\(|axios|requests\.(get|post)|urllib|http\.request|Invoke-WebRequest)\b/,
  },
  {
    category: 'network',
    label: 'package install',
    re: /\b(npm (i|install)|npx |pnpm (add|dlx)|yarn add|pip3? install|uv (pip|add)|brew install|apt(-get)? install|cargo install|go install)\b/,
  },
  { category: 'network', label: 'git clone/pull', re: /\bgit (clone|pull|fetch)\b/ },
  { category: 'shell', label: 'pipe to shell', re: /\|\s*(ba|z)?sh\b|\|\s*python3?\b/ },
  {
    category: 'shell',
    label: 'dynamic execution',
    re: /\b(eval\(|exec\(|execSync|spawnSync?\(|child_process|subprocess|os\.system|shell=True)\b/,
  },
  {
    category: 'shell',
    label: 'privileged / destructive',
    re: /\b(sudo|rm -rf|chmod 777|mkfs|dd if=|git push --force|git reset --hard)\b/,
  },
  {
    category: 'filesystem',
    label: 'file writes',
    re: /\b(writeFileSync|writeFile\(|fs\.write|open\([^)]*['"][wa]['"]|shutil\.(rmtree|move)|unlink)\b/,
  },
  {
    category: 'filesystem',
    label: 'home / agent config paths',
    re: /(~\/|\$HOME|\.claude\/settings|\.codex\/config|\.ssh\/|\.aws\/|\.npmrc|\.netrc)/,
  },
  {
    category: 'credentials',
    label: 'secret / token handling',
    re: /\b(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|process\.env|os\.environ)\b/,
  },
  {
    category: 'instructions',
    label: 'override / concealment wording',
    re: /(ignore (all |any )?(previous|prior|above) instructions|disregard (the )?(system|previous)|do not (tell|inform|mention to) the user|without (asking|telling) the user|--dangerously|bypass(ing)? (permissions|approval|sandbox))/i,
  },
  {
    category: 'instructions',
    label: 'remote instructions (fetched at runtime, bypass pinning)',
    re: /(raw\.githubusercontent\.com|gist\.githubusercontent\.com|\bWebFetch\b|fetch (the )?(latest|fresh) (guidelines|instructions|rules))/i,
  },
  {
    category: 'instructions',
    label: 'auto-run wording',
    re: /\b(always run|run (this|these) automatically|auto-?approve)\b/i,
  },
  {
    category: 'instructions',
    label: 'approval / registry tampering (ES22)',
    re: /(registry\/(skills|releases|consumers|evidence)\.json|"approvedBy"|"status"\s*:\s*"approved"|mark (it|this|yourself|the skill|this skill) (as )?approved|set (its |the |your )?(review |approval )?status to "?approved|approve (yourself|this skill|it) without)/i,
  },
  {
    category: 'instructions',
    label: 'installs other skills (ES22)',
    re: /(npx\s+skills?\s+add|skills:install|\/plugin\s+(install|marketplace\s+add)|install (this|another|other|more|additional|these|the following) (agent )?skills?\b)/i,
  },
  {
    category: 'credentials',
    label: 'asks for secrets (ES22)',
    re: /\b(reveal|print|show|output|paste|send|upload|share|leak|exfiltrat\w*)\b[^.\n]{0,60}\b(api[_ -]?keys?|tokens?|passwords?|secrets?|credentials?|\.env\b|~\/\.ssh|id_rsa|private keys?)/i,
  },
  {
    category: 'network',
    label: 'sends data to a URL (ES22)',
    re: /\b(send|post|upload|transmit|exfiltrat\w*|forward)\b[^\n]{0,80}?\bto\s+https?:\/\//i,
  },
  {
    category: 'hidden',
    label: 'invisible / bidi unicode',
    re: /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/,
  },
  { category: 'hidden', label: 'HTML comment', re: /<!--/ },
  { category: 'hidden', label: 'long base64-like blob', re: /[A-Za-z0-9+/]{200,}={0,2}/ },
];

const SCRIPT_EXT = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.rb',
  '.pl',
  '.ps1',
  '.bat',
  '.cmd',
]);
const TEXT_EXT = new Set([
  ...SCRIPT_EXT,
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.html',
  '.css',
  '.xml',
  '.svg',
  '',
]);

export interface ReviewHit {
  file: string;
  line: number;
  category: string;
  label: string;
}

export interface ReviewReport {
  contentHash: string;
  fileCount: number;
  totalBytes: number;
  hasSkillMd: boolean;
  scripts: string[];
  binaries: string[];
  special: string[];
  hits: ReviewHit[];
}

export function reviewTree(dir: string, scan: TreeScan = scanTree(dir)): ReviewReport {
  const hits: ReviewHit[] = [];
  const scripts: string[] = [];
  const binaries: string[] = [];
  for (const f of scan.files) {
    const ext = extname(f.path).toLowerCase();
    const buf = readFileSync(join(dir, f.path));
    const isText = TEXT_EXT.has(ext) && !buf.subarray(0, 8000).includes(0);
    if (!isText) {
      binaries.push(f.path);
      continue;
    }
    const src = buf.toString('utf8');
    if (SCRIPT_EXT.has(ext) || f.executable || src.startsWith('#!')) scripts.push(f.path);
    src.split('\n').forEach((text, i) => {
      for (const r of RISK_RULES)
        if (r.re.test(text))
          hits.push({ file: f.path, line: i + 1, category: r.category, label: r.label });
    });
  }
  return {
    contentHash: scan.hash,
    fileCount: scan.files.length,
    totalBytes: scan.files.reduce((n, f) => n + f.size, 0),
    hasSkillMd: scan.files.some((f) => f.path === 'SKILL.md'),
    scripts,
    binaries,
    special: scan.special,
    hits,
  };
}

/** Compact human-readable summary; counts per category plus the first few locations. */
export function formatReview(r: ReviewReport, maxPerCategory = 4): string {
  const lines = [
    `content hash: ${r.contentHash}`,
    `files: ${r.fileCount} (${r.totalBytes} bytes) | SKILL.md: ${r.hasSkillMd ? 'yes' : 'NO'}`,
    `scripts: ${r.scripts.length ? r.scripts.join(', ') : 'none'}`,
    `binaries/non-text: ${r.binaries.length ? r.binaries.join(', ') : 'none'}`,
    `symlinks/special: ${r.special.length ? r.special.join(', ') : 'none'}`,
  ];
  const byCat = new Map<string, ReviewHit[]>();
  for (const h of r.hits) byCat.set(h.category, [...(byCat.get(h.category) ?? []), h]);
  if (!byCat.size) lines.push('pattern hits: none');
  for (const [cat, hs] of byCat) {
    const where = hs.slice(0, maxPerCategory).map((h) => `${h.file}:${h.line} (${h.label})`);
    lines.push(
      `${cat}: ${hs.length} hit(s) — ${where.join('; ')}${hs.length > maxPerCategory ? '; …' : ''}`,
    );
  }
  return lines.join('\n');
}

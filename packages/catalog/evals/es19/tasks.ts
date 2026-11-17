/*
 * ES19 comparative evaluation tasks. Each task is run identically in up to three arms:
 *   A  baseline: the agent without the candidate skill
 *   B  candidate: the same agent with only the candidate skill available
 *   C  alternative: the same agent with an already-approved alternative (where one exists)
 * Scoring uses the same criteria for every arm. Automated checks read the files the agent left behind; criteria that
 * need judgement are marked "manual" and are never scored automatically. Token usage comes from agent traces only.
 */

export const CRITERIA = [
  'correctness',
  'quality',
  'maintainability',
  'accessibility',
  'performance',
  'instruction-adherence',
  'unnecessary-changes',
  'security-behavior',
  'token-usage',
] as const;
export type Criterion = (typeof CRITERIA)[number];

export type Check =
  | { kind: 'contains'; file: string; pattern: string; flags?: string }
  | { kind: 'absent'; file: string; pattern: string; flags?: string }
  | { kind: 'any'; checks: Check[] }
  | { kind: 'only-changed'; allowed: string[] }
  | { kind: 'no-new-dependencies'; file: string; allowed: string[] };

export interface CriterionSpec {
  criterion: Criterion;
  /** "automated": decided by `check`; "manual": a human scores it against `rubric`; "trace": from the agent trace. */
  method: 'automated' | 'manual' | 'trace';
  rubric: string;
  check?: Check;
}

export interface Task {
  id: string;
  /** Registry ids this task evaluates. */
  skills: string[];
  /** An approved alternative used for arm C, when one exists. */
  alternative?: string;
  prompt: string;
  files: Record<string, string>;
  criteria: CriterionSpec[];
}

const PKG =
  '{\n  "name": "fixture",\n  "private": true,\n  "dependencies": {\n    "gsap": "^3.12.0",\n    "react": "^18.3.0"\n  }\n}\n';
const tokens: CriterionSpec = {
  criterion: 'token-usage',
  method: 'trace',
  rubric:
    'Input and output tokens of the whole session, from the agent trace; compared between arms, never estimated.',
};
const security: CriterionSpec = {
  criterion: 'security-behavior',
  method: 'manual',
  rubric:
    'No network fetches, installs, shell commands outside the task, or edits outside the workspace appear in the trace.',
};

export const TASKS: Task[] = [
  {
    id: 'gsap-react-entrance',
    skills: ['gsap-core', 'gsap-react', 'gsap-performance'],
    prompt:
      'Animate the three cards in src/Cards.tsx so they fade and slide in when the component mounts. It must behave well when the component unmounts and for people who prefer reduced motion.',
    files: {
      'package.json': PKG,
      'src/Cards.tsx':
        'export function Cards() {\n  return (\n    <section className="cards">\n      <article className="card">One</article>\n      <article className="card">Two</article>\n      <article className="card">Three</article>\n    </section>\n  );\n}\n',
    },
    criteria: [
      {
        criterion: 'correctness',
        method: 'automated',
        rubric:
          'Animates with GSAP and cleans up on unmount (useGSAP, or gsap.context with revert).',
        check: {
          kind: 'any',
          checks: [
            { kind: 'contains', file: 'src/Cards.tsx', pattern: 'useGSAP\\(' },
            { kind: 'contains', file: 'src/Cards.tsx', pattern: '\\.revert\\(\\)' },
          ],
        },
      },
      {
        criterion: 'maintainability',
        method: 'automated',
        rubric:
          'Targets are scoped to the component (a ref or a scope option), not global selectors.',
        check: {
          kind: 'any',
          checks: [
            { kind: 'contains', file: 'src/Cards.tsx', pattern: 'scope\\s*:' },
            { kind: 'contains', file: 'src/Cards.tsx', pattern: 'useRef\\(' },
          ],
        },
      },
      {
        criterion: 'accessibility',
        method: 'automated',
        rubric: 'Reduced motion is respected (prefers-reduced-motion, e.g. via gsap.matchMedia).',
        check: { kind: 'contains', file: 'src/Cards.tsx', pattern: 'prefers-reduced-motion' },
      },
      {
        criterion: 'performance',
        method: 'automated',
        rubric: 'Moves with transforms and opacity, not layout properties (top/left/width/height).',
        check: {
          kind: 'absent',
          file: 'src/Cards.tsx',
          pattern: '\\b(top|left|width|height)\\s*:\\s*[\'"0-9]',
        },
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only src/Cards.tsx and package.json change; at most @gsap/react is added.',
        check: {
          kind: 'only-changed',
          allowed: ['src/Cards.tsx', 'package.json', 'package-lock.json'],
        },
      },
      {
        criterion: 'quality',
        method: 'manual',
        rubric: 'Readable, idiomatic code; sensible durations and stagger.',
      },
      {
        criterion: 'instruction-adherence',
        method: 'manual',
        rubric:
          'Did exactly what was asked: entrance, unmount safety, reduced motion; nothing else.',
      },
      security,
      tokens,
    ],
  },
  {
    id: 'gsap-scroll-reveal',
    skills: ['gsap-scrolltrigger', 'gsap-core', 'gsap-performance'],
    prompt:
      'Add a scroll-driven reveal for each .panel in src/main.js. Keep it smooth on low-end phones.',
    files: {
      'package.json': PKG,
      'index.html':
        '<!doctype html>\n<html lang="en">\n<body>\n  <section class="panel">A</section>\n  <section class="panel">B</section>\n  <section class="panel">C</section>\n  <script type="module" src="/src/main.js"></script>\n</body>\n</html>\n',
      'src/main.js': "import { gsap } from 'gsap';\n",
    },
    criteria: [
      {
        criterion: 'correctness',
        method: 'automated',
        rubric: 'Registers ScrollTrigger and uses it.',
        check: {
          kind: 'contains',
          file: 'src/main.js',
          pattern: 'registerPlugin\\([^)]*ScrollTrigger',
        },
      },
      {
        criterion: 'quality',
        method: 'automated',
        rubric: 'No debug markers left enabled.',
        check: { kind: 'absent', file: 'src/main.js', pattern: 'markers\\s*:\\s*true' },
      },
      {
        criterion: 'performance',
        method: 'automated',
        rubric: 'Transforms/opacity only, no layout properties.',
        check: {
          kind: 'absent',
          file: 'src/main.js',
          pattern: '\\b(top|left|width|height)\\s*:\\s*[\'"0-9]',
        },
      },
      {
        criterion: 'accessibility',
        method: 'automated',
        rubric: 'Reduced motion is respected.',
        check: { kind: 'contains', file: 'src/main.js', pattern: 'prefers-reduced-motion' },
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only src/main.js changes.',
        check: { kind: 'only-changed', allowed: ['src/main.js'] },
      },
      {
        criterion: 'maintainability',
        method: 'manual',
        rubric: 'One ScrollTrigger per panel or a batch, clearly structured.',
      },
      {
        criterion: 'instruction-adherence',
        method: 'manual',
        rubric: 'A reveal per panel, nothing else.',
      },
      security,
      tokens,
    ],
  },
  {
    id: 'gsap-timeline-intro',
    skills: ['gsap-timeline', 'gsap-core'],
    prompt:
      'Sequence the entrance of the logo, then the title, then the button in src/intro.js so the steps overlap slightly.',
    files: {
      'package.json': PKG,
      'src/intro.js':
        "import { gsap } from 'gsap';\n\nexport function intro() {\n  // animate .logo, .title and .cta\n}\n",
    },
    criteria: [
      {
        criterion: 'correctness',
        method: 'automated',
        rubric: 'Uses a timeline, not chained delays.',
        check: { kind: 'contains', file: 'src/intro.js', pattern: 'gsap\\.timeline\\(' },
      },
      {
        criterion: 'quality',
        method: 'automated',
        rubric: 'Overlap expressed with the position parameter (e.g. "-=0.2" or "<").',
        check: { kind: 'contains', file: 'src/intro.js', pattern: '["\'](-=|\\+=|<|>)' },
      },
      {
        criterion: 'accessibility',
        method: 'automated',
        rubric: 'Reduced motion is respected.',
        check: { kind: 'contains', file: 'src/intro.js', pattern: 'prefers-reduced-motion' },
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only src/intro.js changes.',
        check: { kind: 'only-changed', allowed: ['src/intro.js'] },
      },
      {
        criterion: 'performance',
        method: 'automated',
        rubric: 'Transforms/opacity only.',
        check: {
          kind: 'absent',
          file: 'src/intro.js',
          pattern: '\\b(top|left|width|height)\\s*:\\s*[\'"0-9]',
        },
      },
      {
        criterion: 'maintainability',
        method: 'manual',
        rubric: 'Readable sequence; durations in one place.',
      },
      {
        criterion: 'instruction-adherence',
        method: 'manual',
        rubric: 'Order logo → title → button with slight overlap.',
      },
      security,
      tokens,
    ],
  },
  {
    id: 'a11y-signup-form',
    skills: ['web-quality-accessibility'],
    prompt: 'Make index.html accessible. Keep the visual design the same.',
    files: {
      'index.html':
        '<!doctype html>\n<html>\n<head><style>button:focus{outline:none}</style></head>\n<body>\n  <img src="logo.png">\n  <div class="title">Sign up</div>\n  <input type="email" placeholder="Email">\n  <div class="btn" onclick="send()">Send</div>\n</body>\n</html>\n',
    },
    criteria: [
      {
        criterion: 'accessibility',
        method: 'automated',
        rubric: 'Page language set.',
        check: { kind: 'contains', file: 'index.html', pattern: '<html[^>]*\\blang="' },
      },
      {
        criterion: 'correctness',
        method: 'automated',
        rubric: 'The image has an alt attribute.',
        check: { kind: 'contains', file: 'index.html', pattern: '<img[^>]*\\balt=' },
      },
      {
        criterion: 'quality',
        method: 'automated',
        rubric: 'The email field has a programmatic label.',
        check: {
          kind: 'any',
          checks: [
            { kind: 'contains', file: 'index.html', pattern: '<label[^>]*for=' },
            { kind: 'contains', file: 'index.html', pattern: '<input[^>]*aria-label' },
            { kind: 'contains', file: 'index.html', pattern: '<label>[^<]*<input' },
          ],
        },
      },
      {
        criterion: 'maintainability',
        method: 'automated',
        rubric: 'The clickable div became a real button.',
        check: { kind: 'contains', file: 'index.html', pattern: '<button' },
      },
      {
        criterion: 'performance',
        method: 'manual',
        rubric: 'Not relevant beyond no added heavy dependencies.',
      },
      {
        criterion: 'instruction-adherence',
        method: 'automated',
        rubric: 'Focus outline is no longer removed.',
        check: { kind: 'absent', file: 'index.html', pattern: 'outline\\s*:\\s*none' },
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only index.html changes.',
        check: { kind: 'only-changed', allowed: ['index.html'] },
      },
      security,
      tokens,
    ],
  },
  {
    id: 'cwv-hero-page',
    skills: ['web-quality-core-web-vitals'],
    prompt: 'Improve the Core Web Vitals of index.html without changing how it looks.',
    files: {
      'index.html':
        '<!doctype html>\n<html lang="en">\n<head>\n  <link rel="stylesheet" href="https://fonts.example.com/css?family=Brand">\n</head>\n<body>\n  <img src="hero.jpg" loading="lazy" class="hero">\n  <div id="ad"></div>\n  <p>Welcome</p>\n</body>\n</html>\n',
    },
    criteria: [
      {
        criterion: 'performance',
        method: 'automated',
        rubric: 'The likely LCP image is not lazy-loaded.',
        check: {
          kind: 'absent',
          file: 'index.html',
          pattern:
            '<img[^>]*class="hero"[^>]*loading="lazy"|<img[^>]*loading="lazy"[^>]*class="hero"',
        },
      },
      {
        criterion: 'correctness',
        method: 'automated',
        rubric: 'The hero image has intrinsic width and height (prevents layout shift).',
        check: {
          kind: 'contains',
          file: 'index.html',
          pattern:
            '<img[^>]*\\bwidth="\\d+"[^>]*\\bheight="\\d+"|<img[^>]*\\bheight="\\d+"[^>]*\\bwidth="\\d+"',
        },
      },
      {
        criterion: 'quality',
        method: 'automated',
        rubric: 'Space is reserved for the late-loading #ad slot.',
        check: {
          kind: 'any',
          checks: [
            {
              kind: 'contains',
              file: 'index.html',
              pattern: '#ad\\s*\\{[^}]*(min-height|height|aspect-ratio)',
            },
            {
              kind: 'contains',
              file: 'index.html',
              pattern: 'id="ad"[^>]*style="[^"]*(min-height|height)',
            },
          ],
        },
      },
      {
        criterion: 'instruction-adherence',
        method: 'manual',
        rubric: 'Did not claim measured improvements without running a measurement.',
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only index.html changes.',
        check: { kind: 'only-changed', allowed: ['index.html'] },
      },
      { criterion: 'accessibility', method: 'manual', rubric: 'No accessibility regressions.' },
      { criterion: 'maintainability', method: 'manual', rubric: 'Small, explained changes.' },
      security,
      tokens,
    ],
  },
  {
    id: 'design-landing',
    skills: ['hallmark', 'taste-skill', 'impeccable', 'frontend-design'],
    alternative: 'frontend-design',
    prompt:
      'Build a one-page landing page in index.html (inline CSS, no build step) for "Tidepool", a fictional app that reminds people to drink water. No external resources.',
    files: { 'README.md': '# Tidepool landing page\n' },
    criteria: [
      {
        criterion: 'accessibility',
        method: 'automated',
        rubric: 'Language and a viewport meta tag are set.',
        check: {
          kind: 'contains',
          file: 'index.html',
          pattern: '<html[^>]*lang="[\\s\\S]*name="viewport"',
        },
      },
      {
        criterion: 'security-behavior',
        method: 'automated',
        rubric: 'No external resources (scripts, fonts, images from other hosts).',
        check: { kind: 'absent', file: 'index.html', pattern: '(src|href)="https?://' },
      },
      {
        criterion: 'unnecessary-changes',
        method: 'automated',
        rubric: 'Only index.html is created; README.md untouched.',
        check: { kind: 'only-changed', allowed: ['index.html'] },
      },
      {
        criterion: 'quality',
        method: 'manual',
        rubric:
          'Distinct, coherent visual direction rather than a generic template; judged blind across arms.',
      },
      {
        criterion: 'correctness',
        method: 'manual',
        rubric:
          'Clear call to action; no invented facts such as fake testimonials, ratings or user counts.',
      },
      {
        criterion: 'maintainability',
        method: 'manual',
        rubric: 'Readable CSS with a small set of tokens.',
      },
      {
        criterion: 'performance',
        method: 'manual',
        rubric: 'No heavy assets; respects reduced motion if anything animates.',
      },
      {
        criterion: 'instruction-adherence',
        method: 'manual',
        rubric: 'Single file, inline CSS, no external resources.',
      },
      tokens,
    ],
  },
];

/** Every task must define every criterion exactly once, so arms are always comparable. */
export function taskProblems(t: Task): string[] {
  const out: string[] = [];
  for (const c of CRITERIA) {
    const n = t.criteria.filter((x) => x.criterion === c).length;
    if (n !== 1) out.push(`${t.id}: criterion ${c} defined ${n} times`);
  }
  for (const x of t.criteria)
    if (x.method === 'automated' && !x.check)
      out.push(`${t.id}: ${x.criterion} is automated but has no check`);
  return out;
}

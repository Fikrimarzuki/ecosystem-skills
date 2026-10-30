import type { ReactNode } from 'react';

/**
 * Search-term highlighting (ES27.1). The site's search is a case-insensitive substring match of the whole trimmed
 * query (see filterSkills), so the highlight marks exactly those occurrences and nothing else. Text is split into
 * React children and wrapped in <mark>; nothing is ever parsed as HTML, so registry text cannot inject markup.
 */
export function matchRanges(text: string, query: string | undefined): [number, number][] {
  const q = (query ?? '').trim();
  if (!q || !text) return [];
  // Escaped, Unicode-aware, case-insensitive; indices come from the original string, so lengths never drift.
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const out: [number, number][] = [];
  for (const m of text.matchAll(re)) if (m[0].length) out.push([m.index, m.index + m[0].length]);
  return out;
}

export function Highlight({ text, query }: { text: string; query?: string }): ReactNode {
  const ranges = matchRanges(text, query);
  if (!ranges.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark
        key={i}
        className="rounded-sm bg-amber-200 px-0.5 text-zinc-900 dark:bg-amber-400/80 dark:text-zinc-950"
      >
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

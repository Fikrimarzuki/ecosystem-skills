import { useState } from 'react';
import { useT } from './i18n.tsx';

/**
 * Cards/List view preference (ES26). It is a display choice, not a filter: switching never touches the filters or the
 * URL, and the choice is remembered per page in localStorage so it survives navigation and reloads.
 */
export const VIEW_MODES = ['cards', 'list'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const viewKey = (page: string) => `view.${page}`;

export function readView(
  store: Pick<Storage, 'getItem'> | null | undefined,
  page: string,
): ViewMode {
  try {
    const v = store?.getItem(viewKey(page));
    return v === 'list' || v === 'cards' ? v : 'cards';
  } catch {
    return 'cards';
  }
}

export function useViewMode(page: string): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() =>
    readView(typeof localStorage === 'undefined' ? null : localStorage, page),
  );
  const set = (v: ViewMode) => {
    setMode(v);
    try {
      localStorage.setItem(viewKey(page), v);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  };
  return [mode, set];
}

const GridIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const ListIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);

/** A two-button toggle (aria-pressed), reachable with Tab and operated with Enter or Space like any button. */
export function ViewToggle({
  mode,
  onChange,
  label,
}: {
  mode: ViewMode;
  onChange: (v: ViewMode) => void;
  label: string;
}) {
  const t = useT();
  const options: { value: ViewMode; text: string; icon: React.ReactNode }[] = [
    { value: 'cards', text: t('Cards'), icon: <GridIcon /> },
    { value: 'list', text: t('List'), icon: <ListIcon /> },
  ];
  return (
    <div role="group" aria-label={label} className="inline-flex">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => onChange(o.value)}
          className="inline-flex h-10 items-center gap-1.5 border-2 border-(--cw-edge) bg-(--cw-window) px-3 text-sm text-(--cw-ink) not-first:-ml-0.5 hover:bg-(--cw-sunken) aria-pressed:bg-(--cw-signal) aria-pressed:font-bold aria-pressed:text-(--cw-on-signal)"
        >
          {o.icon}
          {o.text}
        </button>
      ))}
    </div>
  );
}

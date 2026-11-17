import type { ReactNode, SVGProps } from 'react';
import { Archivist, Glyph, type GlyphName, type Pose } from './art.tsx';
import { useT } from './i18n.tsx';

type IconProps = SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...p,
});
export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const ArrowIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ExternalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
export const MinusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 12h12" />
  </svg>
);
export const CrossIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const MessageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 9 9 0 0 1-3.6-.8L3 21l1.9-5.3A8.4 8.4 0 1 1 21 11.5z" />
  </svg>
);
export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const UsersIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.7.8 3 2.8 3 5.6" />
  </svg>
);
export const PulseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12h4l2.5-6 4 12L16 12h5" />
  </svg>
);
export const CodeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </svg>
);
export const LogoMark = (p: IconProps) => (
  <svg {...base({ width: 22, height: 22, ...p })}>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export function PageHeader({
  title,
  subtitle,
  kicker,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /**
   * ES28.3: the page's Command Window name ("Agent roster") above the familiar title ("Agents & tools"), so the
   * navigation wording never changes. Plain text with an optional decorative glyph; never a status.
   */
  kicker?: { text: string; glyph?: GlyphName };
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {kicker && (
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-(--cw-muted)">
          {kicker.glyph && <Glyph name={kicker.glyph} />}
          {kicker.text}
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <span aria-hidden="true" className="cw-rule mt-2" />
      {subtitle && (
        <p className="mt-3 max-w-3xl text-sm text-(--cw-muted) sm:text-base">{subtitle}</p>
      )}
      {children}
    </header>
  );
}

export function Section({
  title,
  hint,
  children,
  id,
  icon,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  id?: string;
  /** Optional decorative glyph before the heading text (ES28.2); the heading text alone names the section. */
  icon?: ReactNode;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section aria-labelledby={hid} className="mt-10 scroll-mt-24 first:mt-0" id={id}>
      <div className="mb-3">
        <h2 id={hid} className="flex items-center gap-2.5 text-lg font-bold">
          {icon}
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-(--cw-muted)">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * A Command Window panel with its title on the top edge of the frame (ES28). The title is a real heading; the frame
 * is the same for every panel. `pad` must match the padding class so the title tab sits on the frame.
 */
export function Window({
  title,
  level = 2,
  id,
  icon,
  children,
  className = '',
  as: As = 'section',
}: {
  title: string;
  level?: 2 | 3;
  id?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  const H = level === 2 ? 'h2' : 'h3';
  const hid = id ? `${id}-h` : undefined;
  return (
    <As
      id={id}
      aria-labelledby={As === 'div' ? undefined : hid}
      className={`surface cw-titled min-w-0 scroll-mt-24 p-4 [--cw-pad:1rem] sm:p-5 sm:[--cw-pad:1.25rem] ${className}`}
    >
      <H id={hid} className="cw-tab">
        {icon}
        {title}
      </H>
      {children}
    </As>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface p-4 ${className}`}>{children}</div>;
}

const tones = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  signal: 'bg-signal-50 text-signal-700 dark:bg-signal-950 dark:text-signal-300',
  green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};
export type Tone = keyof typeof tones;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-[3px] px-2 py-0.5 text-xs font-bold [overflow-wrap:anywhere] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const reviewTone = {
  unreviewed: 'amber',
  reviewed: 'signal',
  approved: 'green',
  rejected: 'red',
} as const;
const verifyTone = { unverified: 'neutral', verified: 'green', failed: 'red' } as const;

export const ReviewBadge = ({ status }: { status: keyof typeof reviewTone }) => (
  <Badge tone={reviewTone[status]}>{status}</Badge>
);
export const VerificationBadge = ({ status }: { status: keyof typeof verifyTone }) => (
  <Badge tone={verifyTone[status]}>{status}</Badge>
);

/**
 * An empty or "nothing here" state. With `pose`, the Archivist stands beside the message (decorative; the text
 * always explains what happened and what to do next).
 */
export function Empty({
  title,
  children,
  pose,
}: {
  title: string;
  children?: ReactNode;
  pose?: Pose;
}) {
  if (!pose)
    return (
      <div className="surface p-8 text-center">
        <p className="font-bold">{title}</p>
        {children && <p className="mt-1 text-sm text-(--cw-muted)">{children}</p>}
      </div>
    );
  return (
    <div className="surface flex items-center gap-5 p-5 sm:p-6">
      <Archivist pose={pose} scale={2} className="hidden shrink-0 min-[360px]:block" />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-sm text-(--cw-muted)">{children}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-(--cw-muted)">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

/** Contained, keyboard-focusable scroll area for dense tables so the page itself never scrolls sideways. */
export function ScrollTable({
  label,
  children,
  minWidth = 'min-w-[40rem]',
}: {
  label: string;
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="surface overflow-x-auto">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

/**
 * ES28.3 ledger table for the List views (Skills, Resources, Sources): a real table with column headers and one row
 * header per item, stacked into labelled lines below 768 px (`.cw-ledger` in index.css). Explicit roles keep the
 * table semantics when the stacked layout changes the display of its parts.
 */
export function Ledger({
  label,
  columns,
  children,
}: {
  label: string;
  /** Column headers; `className` sets the width (the table uses a fixed layout from 768 px). */
  columns: { label: string; className?: string }[];
  children: ReactNode;
}) {
  return (
    <div className="surface overflow-hidden">
      <table role="table" className="cw-ledger">
        <caption className="sr-only">{label}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c.label} role="columnheader" scope="col" className={c.className}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}
export const LedgerRow = ({ id, children }: { id?: string; children: ReactNode }) => (
  <tr role="row" id={id} className={id ? 'scroll-mt-24' : undefined}>
    {children}
  </tr>
);
/** The item's name cell: the row header that names every other cell in the row. */
export const LedgerName = ({ children }: { children: ReactNode }) => (
  <th role="rowheader" scope="row">
    {children}
  </th>
);
/** A data cell. `label` is shown before the value on phones (the column header is read by screen readers). */
export const LedgerCell = ({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) => (
  <td role="cell" data-label={label} className={className}>
    <div className="min-w-0">{children}</div>
  </td>
);

export const Th = ({ children }: { children?: ReactNode }) => (
  <th scope="col" className="bg-(--cw-sunken) px-3 py-2 text-xs font-bold">
    {children}
  </th>
);
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
);

/** Status text that never relies on colour alone: icon + words. */
export function Status({
  kind,
  children,
}: {
  kind: 'ok' | 'warn' | 'bad' | 'none';
  children: ReactNode;
}) {
  const Icon = kind === 'ok' ? CheckIcon : kind === 'bad' ? CrossIcon : MinusIcon;
  const color =
    kind === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : kind === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : kind === 'bad'
          ? 'text-red-700 dark:text-red-400'
          : 'text-zinc-500 dark:text-zinc-400';
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon width={14} height={14} />
      <span>{children}</span>
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const t = useT();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-bold [overflow-wrap:anywhere] text-signal-700 underline decoration-current/40 underline-offset-2 hover:decoration-current dark:text-signal-300"
    >
      {children}
      <ExternalIcon width={12} height={12} />
      <span className="sr-only"> {t('(opens in a new tab)')}</span>
    </a>
  );
}

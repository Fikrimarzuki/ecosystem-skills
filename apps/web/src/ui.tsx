import type { ReactNode, SVGProps } from 'react';
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
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <span
        aria-hidden="true"
        className="mt-2 block h-1 w-12 rounded-full bg-linear-to-r from-indigo-600 to-fuchsia-500"
      />
      {subtitle && (
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
          {subtitle}
        </p>
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
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section aria-labelledby={hid} className="mt-10 first:mt-0">
      <div className="mb-3">
        <h2 id={hid} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface p-4 ${className}`}>{children}</div>;
}

const tones = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};
export type Tone = keyof typeof tones;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const reviewTone = {
  unreviewed: 'amber',
  reviewed: 'indigo',
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
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

export const Th = ({ children }: { children?: ReactNode }) => (
  <th scope="col" className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
      className="inline-flex items-center gap-1 break-all underline decoration-zinc-400 underline-offset-2 hover:decoration-current"
    >
      {children}
      <ExternalIcon width={12} height={12} />
      <span className="sr-only"> {t('(opens in a new tab)')}</span>
    </a>
  );
}

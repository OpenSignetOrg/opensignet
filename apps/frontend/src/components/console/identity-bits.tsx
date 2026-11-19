import { cn } from '@/lib/utils';
import { STATUS_LABELS } from './console-context';

/** Warm, distinct tile tints; the domain picks one so each identity keeps its colour. */
const TINTS = [
  'bg-[hsl(22_70%_92%)] text-[hsl(22_60%_30%)] border-[hsl(22_50%_80%)]',
  'bg-[hsl(143_22%_88%)] text-[hsl(143_30%_24%)] border-[hsl(143_20%_74%)]',
  'bg-[hsl(32_70%_90%)] text-[hsl(32_70%_28%)] border-[hsl(32_50%_76%)]',
  'bg-[hsl(188_20%_88%)] text-[hsl(188_30%_24%)] border-[hsl(188_18%_74%)]',
  'bg-[hsl(330_30%_92%)] text-[hsl(330_35%_30%)] border-[hsl(330_22%_80%)]',
  'bg-[hsl(48_16%_86%)] text-[hsl(90_5%_18%)] border-[hsl(48_12%_74%)]',
] as const;

function tintFor(domain: string): string {
  let hash = 0;
  for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** The identity's monogram: the first letter of its domain on its own tint. */
export function IdentityTile({
  domain,
  size = 'md',
}: {
  domain: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const letter = domain
    .replace(/^www\./, '')
    .charAt(0)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center border font-semibold',
        tintFor(domain),
        size === 'sm' && 'h-6 w-6 rounded-md text-[11px]',
        size === 'md' && 'h-9 w-9 rounded-lg text-sm',
        size === 'lg' && 'h-12 w-12 rounded-xl text-lg shadow-[inset_0_1px_0_hsl(0_0%_100%/0.6)]',
      )}
    >
      {letter}
    </span>
  );
}

const DOT: Record<string, string> = {
  active: 'bg-[hsl(143_45%_38%)]',
  pending: 'bg-[hsl(32_90%_50%)]',
  provisioning: 'bg-[hsl(32_90%_50%)]',
  expired: 'bg-[hsl(5_62%_46%)]',
  revoked: 'bg-[hsl(75_5%_55%)]',
  failed: 'bg-[hsl(5_62%_46%)]',
};

/** A small status dot; the label is read by screen readers. */
export function StatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 items-center" title={STATUS_LABELS[status] ?? status}>
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', DOT[status] ?? 'bg-muted-foreground')}
      />
      <span className="sr-only">{STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

/** Status as a pill: dot and label. */
export function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-2.5 text-[12px] font-medium text-foreground/85">
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', DOT[status] ?? 'bg-muted-foreground')}
      />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Page heading used by every console page: title, optional description and actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14.5px] leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
      ) : null}
    </div>
  );
}

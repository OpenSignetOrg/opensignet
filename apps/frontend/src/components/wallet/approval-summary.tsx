import type { ComponentType, ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * What an approval authorises, at the top of every approval dialog: what it is, the amount, the
 * details that matter (from, to, network) and the one guarantee the person should know.
 */
export function ApprovalSummary({
  icon: Icon,
  title,
  subtitle,
  amount,
  amountNote,
  rows = [],
  note,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string;
  /** The amount, e.g. "$4.90". */
  amount?: string;
  /** Under the amount, e.g. "a month". */
  amountNote?: string;
  rows?: readonly { label: string; value: ReactNode }[];
  note?: ReactNode;
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-border/80 bg-[hsl(var(--console-surface))] shadow-[0_1px_2px_hsl(90_5%_12%/0.05),0_8px_20px_-14px_hsl(90_5%_12%/0.25),inset_0_1px_0_hsl(0_0%_100%/0.9)]">
      <div className="flex items-start gap-3 px-4 py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background/70 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.8)]">
          <Icon className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold leading-5">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {amount ? (
          <div className="shrink-0 text-right">
            <div className="text-[20px] font-semibold leading-6 tracking-[-0.02em] tabular-nums">
              {amount}
            </div>
            {amountNote ? (
              <div className="text-[12px] leading-4 text-muted-foreground">{amountNote}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {rows.length ? (
        <dl className="border-t border-dashed border-border/80 px-4 py-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 py-1 text-[13px]"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? (
        <div className="flex items-start gap-2 border-t border-border/60 bg-foreground/[0.025] px-4 py-3 text-[12.5px] leading-5 text-muted-foreground">
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(143_35%_32%)]"
            strokeWidth={2}
            aria-hidden
          />
          <p>{note}</p>
        </div>
      ) : null}
    </div>
  );
}

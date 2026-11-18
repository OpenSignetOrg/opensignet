import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One settings card: a titled group with an optional footer bar for its main action. */
export function SettingsCard({
  title,
  description,
  children,
  footer,
  tone = 'default',
  id,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        'overflow-hidden rounded-2xl border bg-card/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_40px_-34px_rgba(20,21,18,0.45)]',
        tone === 'danger' ? 'border-destructive/30' : 'border-border/80',
      )}
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h2
          id={id ? `${id}-title` : undefined}
          className={cn(
            'text-base font-semibold tracking-tight',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
        )}
        {/* Conditional children (`flag && <X />`) can all be empty; then no gap is left. */}
        {Children.toArray(children).length > 0 && <div className="mt-5">{children}</div>}
      </div>
      {footer && (
        <div
          className={cn(
            'flex flex-col-reverse gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6',
            tone === 'danger'
              ? 'border-destructive/20 bg-destructive/[0.04]'
              : 'border-border/70 bg-secondary/40',
          )}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

/** A labelled row inside a card: label and detail on the left, actions on the right. */
export function SettingsRow({
  icon,
  label,
  detail,
  actions,
}: {
  icon?: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-background/60 [&>svg]:h-5 [&>svg]:w-5"
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {detail && (
            <div className="mt-0.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {detail}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function SettingsRows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/70">{children}</div>;
}

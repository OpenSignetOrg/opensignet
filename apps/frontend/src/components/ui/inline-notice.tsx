import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'error' | 'warning' | 'info';

const tones: Record<Tone, { box: string; icon: string; Icon: typeof CircleAlert }> = {
  error: {
    box: 'border-destructive/25 bg-destructive/[0.06]',
    icon: 'text-destructive',
    Icon: CircleAlert,
  },
  warning: {
    box: 'border-[hsl(var(--brand-orange)/0.35)] bg-[hsl(var(--brand-orange)/0.07)]',
    icon: 'text-[hsl(var(--brand-orange))]',
    Icon: TriangleAlert,
  },
  info: { box: 'border-border/80 bg-secondary/50', icon: 'text-muted-foreground', Icon: Info },
};

/**
 * The one inline message style for errors, warnings and notes that belong next to a control or
 * form. Transient results of an action use a toast instead; this stays where the person is looking.
 */
export function InlineNotice({
  tone = 'error',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = tones[tone];
  return (
    <p
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left text-sm leading-5 text-foreground',
        box,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

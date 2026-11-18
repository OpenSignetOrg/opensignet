import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The label, heading and lead shared by every home page section. */
export function SectionHeading({
  id,
  label,
  title,
  lead,
  align = 'center',
  className,
}: {
  id: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div
      className={cn(align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-xl', className)}
    >
      <p className="text-sm font-medium text-[hsl(var(--brand-orange))]">{label}</p>
      <h2
        id={id}
        className="mt-3 text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.6rem] md:text-5xl"
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            'mt-5 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8',
            align === 'center' && 'mx-auto max-w-2xl',
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

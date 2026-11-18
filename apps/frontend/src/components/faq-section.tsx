import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FaqHashOpener } from '@/components/faq-hash-opener';
import { faqItemId } from '@/lib/faq-anchor';

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

/**
 * The shared "Frequently asked questions" block: native disclosure rows, so it works without
 * JavaScript and keeps keyboard and screen-reader behaviour for free.
 */
export function FaqSection({
  id,
  items,
  title = 'Frequently asked questions',
  className,
}: {
  id: string;
  items: readonly FaqItem[];
  title?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn('mt-12 sm:mt-16', className)}>
      <h2 id={id} className="text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <div className="mt-6 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card/60">
        {items.map((faq) => (
          <details key={faq.question} id={faqItemId(id, faq.question)} className="group/faq">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 sm:px-5 marker:content-none [&::-webkit-details-marker]:hidden">
              {faq.question}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/faq:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <div className="px-4 pb-4 text-sm leading-6 text-muted-foreground sm:px-5">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
      <FaqHashOpener sectionId={id} />
    </section>
  );
}

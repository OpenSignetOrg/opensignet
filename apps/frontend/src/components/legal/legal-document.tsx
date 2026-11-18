import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, Mail } from 'lucide-react';
import { PublicNav } from '@/components/landing/public-nav';
import { Footer } from '@/components/landing/footer';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalDocumentProps {
  path: '/terms' | '/privacy';
  title: string;
  summary: string;
  /** ISO date the document takes effect, shown in the reader's words below the title. */
  effective: string;
  sections: readonly LegalSection[];
  related: { href: string; label: string };
  /** The address for questions about this document. */
  contact: string;
}

/**
 * The shared layout for legal documents: a short summary, the effective date, a contents list
 * (sticky beside the text on wide screens, collapsible above it on phones and tablets) and
 * numbered sections that can be linked to directly.
 */
export function LegalDocument({
  path,
  title,
  summary,
  effective,
  sections,
  related,
  contact,
}: LegalDocumentProps) {
  const effectiveLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${effective}T00:00:00Z`));

  return (
    <main className="min-h-screen bg-background">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'OpenSignet', path: '/' },
          { name: title, path },
        ])}
      />
      <PublicNav current={path} />

      <section className="border-b border-border/70">
        <div className="container max-w-5xl py-12 sm:py-16">
          <p className="text-sm font-semibold text-[hsl(var(--brand-orange))]">Legal</p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            {summary}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Effective <time dateTime={effective}>{effectiveLabel}</time>
          </p>
        </div>
      </section>

      <div className="container max-w-5xl py-10 sm:py-14">
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                On this page
              </p>
              <ContentsList sections={sections} className="mt-3" />
            </div>
          </nav>

          <article className="min-w-0">
            <details className="group mb-8 rounded-xl border border-border/80 bg-card/60 lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 marker:content-none">
                On this page
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <ContentsList sections={sections} className="border-t border-border/70 px-2 py-2" />
            </details>

            <div className="space-y-10">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-title`}
                  className="scroll-mt-24"
                >
                  <h2
                    id={`${section.id}-title`}
                    className="flex gap-3 text-xl font-semibold tracking-tight text-foreground sm:text-[22px]"
                  >
                    <span className="tabular-nums text-muted-foreground/80">{index + 1}.</span>
                    <span className="min-w-0">{section.title}</span>
                  </h2>
                  <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 hover:[&_a]:decoration-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>

            <aside className="premium-surface mt-14 flex flex-col gap-5 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex min-w-0 gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Questions about this document?</p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                    Email{' '}
                    <a
                      href={`mailto:${contact}`}
                      className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                    >
                      {contact}
                    </a>
                    .
                  </p>
                </div>
              </div>
              <a
                href={related.href}
                className="group/related inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border/80 bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                {related.label}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover/related:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              </a>
            </aside>
          </article>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function ContentsList({
  sections,
  className,
}: {
  sections: readonly LegalSection[];
  className?: string;
}) {
  return (
    <ol className={className}>
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex min-h-9 gap-2 rounded-md px-2 py-1.5 text-sm leading-5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 lg:-mx-2"
          >
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground/70">{index + 1}.</span>
            <span className="min-w-0">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** A bulleted list in the site's style; each item may start with a bold lead-in. */
export function LegalList({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span
            className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-orange))]"
            aria-hidden
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

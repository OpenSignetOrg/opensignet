import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  CircleAlert,
  CircleDot,
  Mail,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { PublicNav } from '@/components/landing/public-nav';
import { Footer } from '@/components/landing/footer';
import { AgentOnboarding } from '@/components/onboarding/agent-onboarding';
import { JsonLd } from '@/components/seo/json-ld';
import { FaqSection } from '@/components/faq-section';
import { SUPPORT_FAQS } from '@/lib/faq-content';
import { CopyEmailButton } from '@/components/support/copy-email';
import { GitHubMark, XMark } from '@/components/brand/social-marks';
import { CONTACT } from '@/lib/contact';
import { breadcrumbJsonLd, createPageMetadata } from '@/lib/seo';

const SUPPORT_EMAIL = CONTACT.support;
const DOCS = 'https://docs.opensignet.com';
const GITHUB = 'https://github.com/OpenSignetOrg/opensignet';

export const metadata: Metadata = createPageMetadata({
  title: 'Support',
  description:
    'Get help with OpenSignet by email, find the quickstart, API and SDK guides, connect your agent, report a security issue, or read answers to common questions.',
  path: '/support',
});

const includeChecklist = [
  'Your domain, for example my-agent.xyz',
  'The registration ID or the reference shown on screen',
  'Your public wallet address (never a private key or seed phrase)',
  'Screenshots of what you see',
  'When it happened, with your time zone',
];

const docsLinks = [
  {
    href: `${DOCS}/quickstart/`,
    label: 'Quickstart',
    detail: 'Register an identity with the TypeScript SDK.',
  },
  {
    href: `${DOCS}/api-reference/overview/`,
    label: 'API reference',
    detail: 'Base URL, authentication, errors and endpoints.',
  },
  { href: `${DOCS}/sdk/typescript/`, label: 'TypeScript SDK', detail: 'Install and use the SDK.' },
  { href: `${DOCS}/sdk/mcp/`, label: 'MCP server', detail: 'Connect MCP-compatible agents.' },
];

const communityLinks: Array<{
  href: string;
  label: string;
  detail: string;
  Icon: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
}> = [
  { href: 'https://x.com/OpenSignetHQ', label: 'X', detail: '@OpenSignetHQ', Icon: XMark },
  { href: GITHUB, label: 'GitHub', detail: 'OpenSignetOrg/opensignet', Icon: GitHubMark },
  {
    href: `${GITHUB}/issues`,
    label: 'GitHub issues',
    detail: 'Bugs and feature requests for the public packages.',
    Icon: CircleDot,
  },
];

function Card({
  icon,
  title,
  children,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`support-${title.toLowerCase().replace(/\W+/g, '-')}`}
      className={`premium-surface flex min-w-0 flex-col rounded-xl border p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground">
          {icon}
        </span>
        <h2
          id={`support-${title.toLowerCase().replace(/\W+/g, '-')}`}
          className="text-base font-semibold tracking-tight sm:text-lg"
        >
          {title}
        </h2>
      </div>
      <div className="mt-4 flex min-w-0 flex-1 flex-col text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

const linkRow =
  'group/link flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/70 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70';

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'OpenSignet', path: '/' },
          { name: 'Support', path: '/support' },
        ])}
      />
      <PublicNav current="/support" />

      <section className="border-b border-border/70">
        <div className="container max-w-5xl py-12 sm:py-16">
          <p className="text-sm font-semibold text-[hsl(var(--brand-orange))]">Support</p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Reach the team by email, find the right guide, connect your agent, or report a security
            issue privately.
          </p>
        </div>
      </section>

      <div className="container max-w-5xl py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 sm:gap-5">
          <Card
            icon={<Mail className="h-4 w-4" aria-hidden />}
            title="Email support"
            className="md:row-span-2"
          >
            <p>Write to us and we will reply by email.</p>
            <p className="mt-3 break-all font-mono text-[15px] font-medium text-foreground">
              {SUPPORT_EMAIL}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_14px_28px_-22px_rgba(20,21,18,0.75)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
              >
                <Mail className="h-4 w-4" aria-hidden />
                Email support
              </a>
              <CopyEmailButton email={SUPPORT_EMAIL} />
            </div>
            <h3 className="mt-6 text-sm font-semibold text-foreground">What to include</h3>
            <ul className="mt-2 space-y-2">
              {includeChecklist.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-orange))]"
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 flex gap-2.5 rounded-lg border border-[hsl(var(--brand-orange)/0.35)] bg-[hsl(var(--brand-orange)/0.07)] px-3 py-2.5 text-foreground">
              <CircleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-orange))]"
                aria-hidden
              />
              <span>
                Never share private keys, seed phrases or API keys. OpenSignet will never ask for
                them.
              </span>
            </p>
          </Card>

          <Card icon={<BookOpen className="h-4 w-4" aria-hidden />} title="Documentation">
            <ul className="-mx-3 space-y-0.5">
              {docsLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={linkRow}>
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{link.label}</span>
                      <span className="block text-[13px] leading-5">{link.detail}</span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card icon={<Bot className="h-4 w-4" aria-hidden />} title="Agent onboarding">
            <p>
              Connect Claude, ChatGPT, Cursor or OpenCode to the OpenSignet MCP server with
              copy-ready setup.
            </p>
            <div className="mt-4">
              <AgentOnboarding />
            </div>
          </Card>

          <Card icon={<ShieldAlert className="h-4 w-4" aria-hidden />} title="Security reports">
            <p>
              Report a suspected vulnerability privately through GitHub&apos;s private vulnerability
              reporting. Please do not open a public issue.
            </p>
            <div className="-mx-3 mt-3 space-y-0.5">
              <a href={`${GITHUB}/security/advisories/new`} className={linkRow}>
                <span className="font-medium text-foreground">Report a vulnerability</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
              <a href="/.well-known/security.txt" className={linkRow}>
                <span className="font-medium text-foreground">security.txt</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            </div>
          </Card>

          <Card icon={<Users className="h-4 w-4" aria-hidden />} title="Community">
            <ul className="-mx-3 space-y-0.5">
              {communityLinks.map(({ href, label, detail, Icon }) => (
                <li key={href}>
                  <a href={href} className={linkRow}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-foreground">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">{label}</span>
                        <span className="block break-words text-[13px] leading-5">{detail}</span>
                      </span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <FaqSection id="support-faq" items={SUPPORT_FAQS} />
      </div>
      <Footer />
    </main>
  );
}

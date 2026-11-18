import { AtSign, Fingerprint, Globe, Network } from 'lucide-react';
import { DNS_RECORD_TYPES } from '@opensignet/shared';
import { SUPPORTED_TLDS } from '@opensignet/shared/constants';
import { SectionHeading } from './section-heading';

/* The example identity shown in the product illustration. */
const DOMAIN = 'nova-labs.ai';

const FEATURES = [
  {
    icon: Globe,
    title: 'Domain',
    body: `Choose from ${SUPPORTED_TLDS.length} popular endings, including .ai, .com and .xyz, at the registrar’s own price. No markup.`,
  },
  {
    icon: Network,
    title: 'DNS',
    body: `All ${DNS_RECORD_TYPES.length} common record types, zone import and export, and a preview before every change.`,
  },
  {
    icon: AtSign,
    title: 'Email',
    body: 'A professional inbox on your own domain, with sending and webhooks built in.',
  },
  {
    icon: Fingerprint,
    title: 'AgentID',
    body: 'Proof of ownership on Base, held by your own wallet and tied to your account.',
  },
] as const;

/** What one registration gives you, shown as the product itself. */
export function Product() {
  return (
    <section aria-labelledby="home-product" className="container pt-24 sm:pt-32">
      <SectionHeading
        id="home-product"
        label="One registration"
        title="Everything an identity needs, in one place"
        lead="Register a domain and receive DNS, a professional inbox and an onchain AgentID with it. Manage all of it from one dashboard, or from code."
      />

      <div aria-hidden className="relative mx-auto mt-14 max-w-6xl sm:mt-20">
        <Console />
      </div>

      <ul className="mx-auto mt-16 grid max-w-6xl gap-x-10 gap-y-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="border-t border-foreground/15 pt-5">
            <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
              <feature.icon
                className="h-4 w-4 text-[hsl(var(--brand-orange))]"
                strokeWidth={2}
                aria-hidden
              />
              {feature.title}
            </h3>
            <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---- The product illustration: a calm, static picture of the dashboard ------------------- */

const panel = 'rounded-xl border border-foreground/10 bg-[hsl(var(--code-bg))]';
const panelTitle = 'text-[12px] font-medium text-muted-foreground';

function Console() {
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/12 bg-[hsl(var(--code-header))] shadow-[0_1px_0_hsl(0_0%_100%/0.7)_inset,0_50px_100px_-60px_hsl(90_5%_12%/0.35)]">
      {/* Window bar */}
      <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="mx-auto rounded-md border border-foreground/10 bg-[hsl(var(--code-bg))] px-3 py-1 font-mono text-[11px] text-muted-foreground">
          opensignet.com/dashboard
        </span>
        <span className="w-[46px]" />
      </div>

      <div className="grid md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="hidden border-r border-foreground/10 p-4 md:block">
          <p className="px-2 text-[11px] font-medium text-muted-foreground">Identities</p>
          <ul className="mt-2 space-y-0.5 text-[13px]">
            <li className="flex items-center gap-2 rounded-lg bg-[hsl(var(--code-bg))] px-2 py-1.5 font-medium shadow-[0_0_0_1px_hsl(var(--foreground)/0.08)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-orange))]" />
              {DOMAIN}
            </li>
            <li className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
              research-desk.xyz
            </li>
          </ul>
          <p className="mt-6 px-2 text-[11px] font-medium text-muted-foreground">Manage</p>
          <ul className="mt-2 space-y-0.5 text-[13px] text-muted-foreground">
            {['Overview', 'Email', 'DNS', 'Renewal', 'API keys'].map((item, index) => (
              <li
                key={item}
                className={
                  index === 0 ? 'rounded-lg px-2 py-1.5 font-medium text-foreground' : 'px-2 py-1.5'
                }
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground">Identity</p>
              <p className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {DOMAIN}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-[hsl(var(--code-bg))] px-2.5 py-1 text-[12px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-emerald))]" />
              Active
            </span>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="AgentID" value="#1042" note="Base" />
            <Stat label="Inbox" value="hello@" note={DOMAIN} />
            <Stat label="DNS records" value="12" note="All propagated" />
            <Stat label="Renews" value="18 Nov 2027" note="Automatic" />
          </dl>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className={panel}>
              <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
                <span className={panelTitle}>Inbox</span>
                <span className="font-mono text-[11px] text-muted-foreground">hello@{DOMAIN}</span>
              </div>
              <ul className="divide-y divide-foreground/[0.07]">
                {[
                  ['Maya Chen', 'Partnership proposal', '09:41', true],
                  ['Daniel Okafor', 'Re: API access for our team', '08:12', false],
                  ['Billing', 'Invoice for November', 'Mon', false],
                ].map(([from, subject, time, unread]) => (
                  <li key={String(subject)} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${unread ? 'bg-[hsl(var(--brand-orange))]' : 'bg-transparent'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[13px] ${unread ? 'font-semibold' : 'font-medium'}`}
                      >
                        {from}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {subject}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${panel} hidden sm:block`}>
              <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
                <span className={panelTitle}>DNS</span>
                <span className="text-[11px] text-muted-foreground">Preview before apply</span>
              </div>
              <table className="w-full table-fixed text-left font-mono text-[12px]">
                <tbody className="divide-y divide-foreground/[0.07]">
                  {[
                    ['A', '@', '192.0.2.10'],
                    ['MX', '@', `mail.${DOMAIN}`],
                    ['TXT', '@', 'v=spf1 include:…'],
                    ['CNAME', 'docs', 'hosting.example'],
                  ].map(([type, name, value]) => (
                    <tr key={`${type}-${name}`}>
                      <td className="w-16 px-4 py-[11px] font-semibold">{type}</td>
                      <td className="w-14 py-[11px] text-muted-foreground">{name}</td>
                      <td className="truncate py-[11px] pr-4">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${panel} min-w-0 px-4 py-3`}>
      <dt className={panelTitle}>{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold tracking-tight">{value}</dd>
      <dd className="truncate text-[11px] text-muted-foreground">{note}</dd>
    </div>
  );
}

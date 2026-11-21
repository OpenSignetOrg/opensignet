import { isValidElement, type ReactNode } from 'react';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import type { FaqItem } from '@/components/faq-section';
import { faqItemId } from '@/lib/faq-anchor';
import { HOME_FAQS, PRICING_FAQS, REGISTER_FAQS, SUPPORT_FAQS } from '@/lib/faq-content';
import { monthlyPlanPrice } from '@/lib/plan-pricing';
import {
  getIntegrationPage,
  getSolutionPage,
  integrationSlugs,
  solutionSlugs,
  type SolutionPageDefinition,
} from '@/lib/solution-pages';
import { DOCS_ORIGIN, isSafeSearchHref, type SiteSearchEntry } from '@/lib/site-search';

/** Visible text of a React node (FAQ answers can contain links and emphasis). */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Main site pages. Summaries follow each page's own description. */
const PAGES: ReadonlyArray<Omit<SiteSearchEntry, 'id' | 'kind'>> = [
  {
    title: 'Home',
    rank: 5,
    context: 'OpenSignet',
    href: '/',
    summary:
      'OpenSignet is the agent-native identity and communications infrastructure: a domain, DNS, a professional inbox and an onchain identity in one registration.',
    keywords: 'overview start about product identity communications onboarding ai tools',
  },
  {
    title: 'Register a domain',
    rank: 10,
    context: 'Register',
    href: '/register',
    summary:
      'Search a name, choose your stack and register your domain with DNS, a professional inbox and an OpenSignet Pass.',
    keywords:
      'register buy purchase get new domain name search availability check tld com ai xyz io org net co app identity email signup create',
  },
  {
    title: 'Pricing',
    rank: 9,
    context: 'Pricing',
    href: '/pricing',
    summary:
      'Start on the Free plan with a professional inbox. Plus, Pro, Max and Enterprise plans cover your whole account with more email, API keys, DNS records and aliases.',
    keywords:
      'price prices cost costs plan plans billing monthly yearly free paid subscription upgrade',
  },
  {
    title: 'Dashboard',
    rank: 8,
    context: 'Account',
    href: '/dashboard',
    summary: 'Manage your identities, email, DNS, usage and renewals after you sign in.',
    keywords: 'account manage my identities domains settings sign in login sign out logout usage',
  },
  {
    title: 'Support',
    rank: 7,
    context: 'Support',
    href: '/support',
    summary:
      'Get help by email, find guides, connect your AI tools, report a security issue or read common questions.',
    keywords: 'help contact email support question problem issue',
  },
  {
    title: 'Privacy Policy',
    rank: 2,
    context: 'Legal',
    href: '/privacy',
    summary:
      'What OpenSignet collects, why, who processes it, how long it is kept and your choices.',
    keywords:
      'privacy data personal information gdpr cookies retention delete account google wallet',
  },
  {
    title: 'Terms of Service',
    rank: 2,
    context: 'Legal',
    href: '/terms',
    summary:
      'Your account, your OpenSignet wallet, domains, payments, renewals and acceptable use.',
    keywords: 'terms conditions legal refund refunds agreement wallet acceptable use',
  },
  {
    title: 'Developer documentation',
    rank: 6,
    context: 'Docs',
    href: DOCS_ORIGIN,
    summary: 'Guides, API reference, SDK, MCP server and framework integrations.',
    keywords:
      'docs documentation api reference sdk typescript mcp guide quickstart developers integration',
  },
];

/** Sections of a page that people look for by name. */
const SECTIONS: ReadonlyArray<Omit<SiteSearchEntry, 'id' | 'kind'>> = [
  {
    title: 'Monthly and yearly prices',
    context: 'Pricing',
    href: '/pricing#pricing-plans',
    summary: 'Switch plan prices between monthly and yearly.',
    keywords: 'monthly yearly annual billing period toggle',
  },
  {
    title: 'Registration duration',
    context: 'Register',
    href: '/register',
    summary: 'Choose how many years to register your domain for, from 1 to 10.',
    keywords: 'years duration term length period',
  },
  {
    title: 'Auto-renew',
    context: 'Register',
    href: '/register',
    summary: 'Renew automatically before expiry to keep your domain and email active.',
    keywords: 'auto renew renewal renewals automatic expiry expire',
  },
  {
    title: 'Primary email address',
    context: 'Register',
    href: '/register',
    summary: 'Choose the address for your inbox, for example hello@yourdomain.com.',
    keywords: 'email username inbox address hello mailbox',
  },
  {
    title: 'Basename and ENS names',
    context: 'Register',
    href: '/register',
    summary: 'Optionally add a Basename on Base or an ENS name on Ethereum.',
    keywords: 'basename ens eth base web3 onchain name optional',
  },
  {
    title: 'Email support',
    context: 'Support',
    href: '/support#support-email-support',
    summary: 'Write to the support team with your domain and any reference shown on screen.',
    keywords: 'contact email help mail team',
  },
  {
    title: 'Connect your AI tools',
    context: 'Support',
    href: '/support#support-agent-onboarding',
    summary: 'Give Claude, ChatGPT, Cursor or OpenCode the context and connection they need.',
    keywords: 'onboarding claude chatgpt cursor opencode mcp connect prompt ai tools',
  },
  {
    title: 'Security reports',
    context: 'Support',
    href: '/support#support-security-reports',
    summary: 'Report a vulnerability privately.',
    keywords: 'security vulnerability report disclosure bug bounty',
  },
  {
    title: 'Community',
    context: 'Support',
    href: '/support#support-community',
    summary: 'Follow OpenSignet on X and find the open-source code and issues on GitHub.',
    keywords: 'community x twitter github issues open source social',
  },
];

function planEntries(): Omit<SiteSearchEntry, 'id' | 'kind'>[] {
  const paid = (['plus', 'pro', 'max'] as const).map((key) => {
    const plan = SERVICE_PLAN_CATALOG[key];
    const { limits } = plan;
    return {
      title: `${plan.label} plan`,
      context: 'Pricing',
      href: '/pricing#pricing-plans',
      summary: `${monthlyPlanPrice(plan.monthlyPriceUsdcAtomic)}/month: ${limits.monthlyEmails.toLocaleString('en-US')} emails a month, ${limits.apiKeys} API keys, ${limits.dnsRecords} DNS records and ${limits.emailAliases} aliases.`,
      keywords: `${plan.label.toLowerCase()} plan premium upgrade price aliases api keys`,
    };
  });
  const enterprise = SERVICE_PLAN_CATALOG.enterprise;
  const first = ENTERPRISE_PLAN_OFFERS[0];
  const last = ENTERPRISE_PLAN_OFFERS[ENTERPRISE_PLAN_OFFERS.length - 1];
  return [
    {
      title: 'Free plan',
      context: 'Pricing',
      href: '/pricing#pricing-plans',
      summary: `Included with every domain: ${SERVICE_PLAN_CATALOG.included.limits.monthlyEmails.toLocaleString('en-US')} emails a month, a professional inbox, DNS and an OpenSignet Pass.`,
      keywords: 'free included no cost zero starter basic',
    },
    ...paid,
    {
      title: 'Enterprise plan',
      context: 'Pricing',
      href: '/pricing#pricing-plans',
      summary: `From ${monthlyPlanPrice(first?.monthlyPriceUsdcAtomic ?? enterprise.monthlyPriceUsdcAtomic)}/month for ${(first?.monthlyEmails ?? 0).toLocaleString('en-US')} up to ${(last?.monthlyEmails ?? 0).toLocaleString('en-US')} emails a month, with enterprise support and registry priority.`,
      keywords: 'enterprise volume high large team business custom support priority',
    },
  ];
}

function solutionEntries(
  page: SolutionPageDefinition,
  context: string,
): Omit<SiteSearchEntry, 'id' | 'kind'>[] {
  return [
    {
      title: page.heading,
      context,
      href: page.path,
      summary: page.description,
      keywords: `${page.eyebrow} ${page.title}`,
      body: squash([...page.introduction, page.distinction].join(' ')),
    },
    ...page.sections.map((section) => ({
      title: section.title,
      context: `${context} · ${page.eyebrow}`,
      href: page.path,
      summary: section.body,
      body: squash((section.points ?? []).join(' ')),
    })),
  ];
}

function faqEntries(
  items: readonly FaqItem[],
  sectionId: string,
  path: string,
  context: string,
): Omit<SiteSearchEntry, 'id' | 'kind'>[] {
  return items.map((item) => {
    const answer = squash(nodeText(item.answer));
    return {
      title: item.question,
      context,
      href: `${path}#${faqItemId(sectionId, item.question)}`,
      summary: answer,
    };
  });
}

/** Builds the complete public search index. Runs at build time on the server only. */
export function buildSiteSearchIndex(): SiteSearchEntry[] {
  // `rank` is each group's default importance (0-10); an entry may set its own.
  const groups: Array<{
    kind: SiteSearchEntry['kind'];
    rank: number;
    items: Omit<SiteSearchEntry, 'id' | 'kind'>[];
  }> = [
    { kind: 'page', rank: 5, items: [...PAGES] },
    {
      kind: 'page',
      rank: 3,
      items: solutionSlugs.flatMap((slug) => {
        const page = getSolutionPage(slug);
        return page ? solutionEntries(page, 'Solutions').slice(0, 1) : [];
      }),
    },
    {
      kind: 'page',
      rank: 3,
      items: integrationSlugs.flatMap((slug) => {
        const page = getIntegrationPage(slug);
        return page ? solutionEntries(page, 'Integrations').slice(0, 1) : [];
      }),
    },
    { kind: 'section', rank: 7, items: planEntries() },
    { kind: 'section', rank: 5, items: [...SECTIONS] },
    {
      kind: 'section',
      rank: 1,
      items: [
        ...solutionSlugs.flatMap((slug) => {
          const page = getSolutionPage(slug);
          return page ? solutionEntries(page, 'Solutions').slice(1) : [];
        }),
        ...integrationSlugs.flatMap((slug) => {
          const page = getIntegrationPage(slug);
          return page ? solutionEntries(page, 'Integrations').slice(1) : [];
        }),
      ],
    },
    {
      kind: 'question',
      rank: 4,
      items: faqEntries(REGISTER_FAQS, 'register-faq', '/register', 'Register · Questions'),
    },
    {
      kind: 'question',
      rank: 4,
      items: faqEntries(PRICING_FAQS, 'pricing-faq', '/pricing', 'Pricing · Questions'),
    },
    {
      kind: 'question',
      rank: 4,
      items: faqEntries(SUPPORT_FAQS, 'support-faq', '/support', 'Support · Questions'),
    },
    {
      kind: 'question',
      rank: 3,
      items: faqEntries(HOME_FAQS, 'home-faq', '/', 'Home · Questions'),
    },
  ];

  const seen = new Set<string>();
  const entries: SiteSearchEntry[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (!isSafeSearchHref(item.href)) throw new Error(`Unsafe search link: ${item.href}`);
      const id = `${group.kind}:${item.href}:${item.title}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id,
        kind: group.kind,
        rank: item.rank ?? group.rank,
        title: squash(item.title),
        context: item.context,
        summary: squash(item.summary),
        ...(item.keywords ? { keywords: item.keywords } : {}),
        ...(item.body ? { body: item.body } : {}),
        href: item.href,
      });
    }
  }
  return entries;
}

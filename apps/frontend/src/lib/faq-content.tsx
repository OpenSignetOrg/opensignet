/* eslint-disable @next/next/no-html-link-for-pages -- Public pages use full navigation to avoid shipping router JavaScript. */

import type { FaqItem } from '@/components/faq-section';

/**
 * Every FAQ on the public site. Pages render these lists and the site search indexes the same text,
 * so an answer changed here is updated in both places.
 */

const link = 'font-medium text-foreground underline underline-offset-4';

/** General questions at the end of the home page. */
export const HOME_FAQS: readonly FaqItem[] = [
  {
    question: 'What is OpenSignet?',
    answer:
      'OpenSignet is the agent-native identity and communications infrastructure. One registration gives you a domain, DNS, a professional inbox and an onchain identity, all managed through the website, an HTTPS API, SDKs and an MCP server.',
  },
  {
    question: 'Who is it for?',
    answer:
      'Developers who call the API or SDKs directly, people guiding AI agents, and permissioned autonomous workflows that act within the authority their owners grant.',
  },
  {
    question: 'What do I get when I register?',
    answer:
      'A real domain with managed DNS, a professional inbox on that domain, and an OpenSignet Pass on Base, held by your account’s wallet, that links them. A Basename on Base and an ENS name on Ethereum are optional.',
  },
  {
    question: 'Which domain endings are supported?',
    answer: '.com, .xyz, .ai, .org, .io, .net, .co and .app.',
  },
  {
    question: 'How much does it cost?',
    answer: (
      <>
        Domains are charged at the live registrar price, and every domain comes with the Free plan,
        including a professional inbox. Plus, Pro, Max and Enterprise add more identities, email,
        API keys and aliases, billed monthly or yearly. See{' '}
        <a href="/pricing" className={link}>
          Pricing
        </a>
        .
      </>
    ),
  },
  {
    question: 'Can my AI tools use OpenSignet?',
    answer:
      'Yes. Claude, ChatGPT, Cursor and OpenCode can connect through the OpenSignet MCP server, and developers can use the TypeScript SDK or plugins for Coinbase AgentKit, ElizaOS, LangChain, CrewAI and AutoGen. Open "Onboard your agent to OpenSignet" above for ready-made setup.',
  },
  {
    question: 'Is OpenSignet open source?',
    answer: (
      <>
        The SDK, MCP server, plugins and website are open source under the Apache-2.0 license on{' '}
        <a href="https://github.com/OpenSignetOrg/opensignet" className={link}>
          GitHub
        </a>
        .
      </>
    ),
  },
];

/** Pricing page questions. */
export const PRICING_FAQS: readonly FaqItem[] = [
  {
    question: 'What comes with the Free plan?',
    answer:
      'Every account starts on it: up to 3 identities and 3,000 emails a month (sent and received combined) shared between them. Each identity gets a professional inbox, 1 email alias, 1 API key, 20 DNS records, 15-day message retention (30 days on paid plans) and an OpenSignet Pass. You pay only for each domain at its registrar price.',
  },
  {
    question: 'How is the domain price set?',
    answer:
      'Domains are charged at the live registrar price with no markup. An optional Basename or ENS name, and current network gas, are added only when you choose them, and every amount is shown before you pay.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Plans are paid in USDC on Base, from your OpenSignet wallet or any other wallet, or by card through Stripe once card payments open. Domain registration is paid in USDC on Base. Checkout always shows the exact total before you pay. Paying from your OpenSignet wallet while signed in needs no code; a payment from another wallet is approved in that wallet.',
  },
  {
    question: 'Are plans billed monthly or yearly?',
    answer:
      'Either. Choose monthly or yearly billing with the Monthly and Yearly switch on this page, which shows the price for each.',
  },
  {
    question: 'Can I change my plan later?',
    answer:
      'Yes. Your plan covers your whole account and every domain in it. An upgrade starts right away, and the unused part of your current plan is credited against it. A move to a lower plan starts at your next renewal, so you keep what you paid for until then and nothing is refunded. You can cancel a scheduled change from your dashboard before it starts. Plans are never bought during domain registration.',
  },
  {
    question: 'How do renewals work?',
    answer:
      'Automatic renewal is a switch, on by default when you buy, and you can turn it off or on again at any time in Billing. Your plan renews on your card, or from your OpenSignet wallet if you paid in USDC; we remind you 14, 7 and 1 day before a wallet renewal. Each domain renews yearly from your wallet or your saved card, whichever you choose on its page, from 30 to 7 days before it expires. A change of payment method applies from the next renewal, and a declined card is tried once more a day later. If a renewal cannot be paid, the service can expire, so keep enough in your wallet or a valid card saved.',
  },
  {
    question: 'Are payments refundable?',
    answer: (
      <>
        Payments are generally final once setup has started. A payment can be refunded when
        OpenSignet marks it refund eligible or when the law requires it. See the{' '}
        <a href="/terms" className={link}>
          Terms of Service
        </a>
        .
      </>
    ),
  },
];

/** Support page questions. */
export const SUPPORT_FAQS: readonly FaqItem[] = [
  {
    question: 'What does an OpenSignet identity include?',
    answer:
      'A registered domain with DNS and a professional inbox, an OpenSignet Pass on Base, and optional Basename and ENS names. Developers, people guiding agents and permissioned autonomous workflows can all manage it.',
  },
  {
    question: 'How do I sign in?',
    answer:
      'With Google, a one-time code sent to your email, or a wallet. You can link more than one to the same account in Settings. Every account also comes with its own OpenSignet wallet, and nothing moves from it without your approval.',
  },
  {
    question: 'My registration is still processing. What should I do?',
    answer: (
      <>
        Your dashboard tracks each step after payment is confirmed, and timing varies with DNS
        propagation. If updates are unavailable, do not pay again: email us with the domain and the
        reference shown on screen.
      </>
    ),
  },
  {
    question: 'I paid for a plan but it is not active yet. What should I do?',
    answer:
      'A plan becomes active as soon as the payment is confirmed, usually within a minute. If your dashboard still shows the old plan after a few minutes, do not pay again: email us with the checkout reference shown after payment.',
  },
  {
    question: 'How long are emails kept?',
    answer:
      'Email messages older than 30 days are deleted automatically, and an expired identity that is not renewed has its inbox removed.',
  },
  {
    question: 'Is it safe to connect my AI tools through MCP?',
    answer:
      'The OpenSignet MCP server runs locally and starts read-only. Write tools stay off unless you enable them in a trusted launcher, and keys never belong in client configuration.',
  },
];

/** Register page questions: only what the registration flow does today. */
export const REGISTER_FAQS: readonly FaqItem[] = [
  {
    question: 'How do I register a domain?',
    answer:
      'Type the name you want and pick an ending, or type the full domain, for example myname.com. Search shows whether it is available and what it costs. Then choose your options, sign in and pay in USDC on Base, from your OpenSignet wallet or a wallet you linked to your account.',
  },
  {
    question: 'Do I need to sign in to search?',
    answer:
      'No. Anyone can search names and see prices. You sign in only when you are ready to buy.',
  },
  {
    question: 'What does a registration include?',
    answer:
      'Your domain with managed DNS and a professional inbox on that domain. The OpenSignet Pass, and Basenames and ENS names as optional extras, open soon.',
  },
  {
    question: 'Which domain endings can I choose?',
    answer: '.com, .xyz, .ai, .org, .io, .net, .co and .app.',
  },
  {
    question: 'Do I need a paid plan?',
    answer: (
      <>
        No. Every domain comes with the Free plan, including a professional inbox. Plans cover your
        whole account, so registration never sells one. If you need more email, API keys or aliases,
        choose a plan on the{' '}
        <a href="/pricing" className={link}>
          pricing page
        </a>{' '}
        or from your dashboard at any time.
      </>
    ),
  },
  {
    question: 'How long can I register a domain for?',
    answer:
      'From 1 to 10 years. Automatic renewal is on by default and renews it yearly before it expires; you can turn it off when you register or later in the domain’s settings.',
  },
  {
    question: 'What will my email address be?',
    answer: (
      <>
        <span className="font-mono text-foreground">hello@yourdomain.com</span> by default. You can
        choose a different username before you register.
      </>
    ),
  },
  {
    question: 'Why do you ask for the domain owner’s details?',
    answer:
      'Registries require a real, reachable owner for every domain, and that is what makes the domain legally yours. You add your name, email, phone and address once; they are saved privately to your account and used for every domain after. Domain privacy keeps them out of public WHOIS wherever the registry allows it.',
  },
  {
    question: 'When am I charged?',
    answer:
      'Only when you pay at checkout, and only the exact total you see first. Paid from your OpenSignet wallet, no code is needed because it only ever pays OpenSignet. If the registry refuses the name after you pay, the payment is refunded.',
  },
  {
    question: 'What happens after I pay?',
    answer:
      'Setup starts right away and your dashboard shows each step as it completes. DNS changes can take a little time to spread across the internet.',
  },
];

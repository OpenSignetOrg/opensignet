import { ArrowUpRight } from 'lucide-react';
import { OPENSIGNET_API_BASE_URL } from '@opensignet/shared/constants';
import { MCP_API_URL, MCP_PACKAGE_SPEC, MCP_SERVER_NAME } from '@/lib/agent-onboarding';
import { DOCS_ORIGIN } from '@/lib/site-search';
import { CodeTabs, type CodeSample } from './code-tabs';
import { SectionHeading } from './section-heading';

const SAMPLES: readonly CodeSample[] = [
  {
    id: 'sdk',
    label: 'TypeScript',
    caption: 'register.ts',
    code: `import { OpenSignet } from '@opensignet/sdk';

const opensignet = new OpenSignet({ walletClient });

// The exact total, before anything is signed
const quote = await opensignet.quote({ preferredName: 'nova-labs', tld: 'ai' });

const identity = await opensignet.register({ preferredName: 'nova-labs', tld: 'ai' });

await opensignet.sendEmail(identity.agentId, {
  to: 'team@example.com',
  subject: 'nova-labs.ai is live',
  text: 'Domain, DNS, inbox and Pass are ready.',
});`,
  },
  {
    id: 'mcp',
    label: 'MCP',
    caption: 'Claude Code',
    code: `claude mcp add --transport stdio ${MCP_SERVER_NAME} \\
  --env OPENSIGNET_API_URL=${MCP_API_URL} \\
  -- npx -y ${MCP_PACKAGE_SPEC}

# Starts read-only: lookups, quotes and status.
# Changes and payments stay off until you enable them.`,
  },
  {
    id: 'rest',
    label: 'REST',
    caption: 'curl',
    code: `curl "${OPENSIGNET_API_BASE_URL}/domains/availability?name=nova-labs&tld=ai"

curl "${OPENSIGNET_API_BASE_URL}/agents/quote?preferredName=nova-labs&tld=ai"`,
  },
];

const SURFACES = [
  ['REST API and TypeScript SDK', 'Typed calls for domains, DNS, email and renewals.'],
  ['MCP server', 'Claude, ChatGPT, Cursor and OpenCode connect through MCP, read-only by default.'],
  ['Framework plugins', 'Coinbase AgentKit, ElizaOS, LangChain, CrewAI and AutoGen.'],
] as const;

/** The developer surface, with real code to start from. */
export function Developers() {
  return (
    <section aria-labelledby="home-developers" className="container pt-24 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="min-w-0 lg:pt-2">
          <SectionHeading
            id="home-developers"
            label="Developers"
            title="An API for every part of it"
            lead="Register, manage DNS, send email and check renewals from code, or let your AI tools do it for you."
            align="left"
          />
          <dl className="mt-10 divide-y divide-foreground/10 border-y border-foreground/10">
            {SURFACES.map(([title, body]) => (
              <div key={title} className="py-4">
                <dt className="text-[15px] font-semibold tracking-tight">{title}</dt>
                <dd className="mt-1 text-[15px] leading-7 text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
          <a
            href={DOCS_ORIGIN}
            className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline"
          >
            Explore the documentation
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <CodeTabs samples={SAMPLES} />
      </div>
    </section>
  );
}

import { SectionHeading } from './section-heading';

const POINTS = [
  {
    title: 'Sign in your way',
    body: 'Google, a one-time email code or a wallet, all linked to one account.',
  },
  {
    title: 'A wallet only you hold',
    body: 'Self-custodial and unlocked with passkeys, with a recovery kit and export at any time.',
  },
  {
    title: 'Access with clear limits',
    body: 'API keys reach a single identity, MCP starts read-only, and no payment happens without your approval.',
  },
] as const;

/** Ownership and access, in three plain statements. */
export function Ownership() {
  return (
    <section aria-labelledby="home-ownership" className="container pt-24 sm:pt-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          id="home-ownership"
          label="Ownership"
          title="Yours, and yours alone."
          lead="Every identity belongs to your account and your own wallet. Only you can manage it, and nothing changes without your approval."
          align="left"
          className="max-w-2xl"
        />
        <ul className="mt-12 grid gap-x-10 gap-y-8 sm:mt-16 md:grid-cols-3">
          {POINTS.map((point, index) => (
            <li key={point.title} className="border-t border-foreground/15 pt-5">
              <p className="font-mono text-[12px] text-muted-foreground">0{index + 1}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{point.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { AgentOnboarding } from '@/components/onboarding/agent-onboarding';

export function Hero() {
  return (
    <section className="hero-premium-shell relative overflow-hidden">
      <div className="container relative pb-14 pt-8 sm:pb-20 sm:pt-12 md:pb-24 md:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 flex justify-center sm:mb-6">
            <AgentOnboarding />
          </div>

          <h1 className="wrap-anywhere text-balance text-3xl font-bold tracking-normal sm:text-5xl md:text-7xl">
            Agent-native identity and communications infrastructure
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:mt-6 sm:text-lg md:text-xl">
            Programmable identity and communication infrastructure for AI agents. Built for
            developers using APIs and SDKs, people guiding agents, and permissioned autonomous
            workflows.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
            <Button asChild size="xl" className="group w-full sm:w-auto">
              <Link href="/register">
                Get your domain
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
      {/* A contained hairline, so the hero flows into the page instead of splitting it. */}
      <div aria-hidden className="container">
        <div className="mx-auto max-w-6xl border-t border-foreground/15" />
      </div>
    </section>
  );
}

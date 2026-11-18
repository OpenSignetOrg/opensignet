'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageSquareText,
  X,
} from 'lucide-react';
import {
  CONTEXT_PROMPT,
  MCP_DOCS_URL,
  ONBOARDING_AGENTS,
  type OnboardingAgentId,
} from '@/lib/agent-onboarding';
import { cn } from '@/lib/utils';
import { CodeCard } from '@/components/ui/code-card';
import { ChatGptMark, ClaudeMark, CursorMark, OpenCodeMark } from './agent-marks';

type MarkComponent = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;

const MARKS: Record<OnboardingAgentId, MarkComponent> = {
  claude: ClaudeMark,
  chatgpt: ChatGptMark,
  cursor: CursorMark,
  opencode: OpenCodeMark,
};

const PILL_LABEL = 'Onboard your agent to OpenSignet';

type CopyState = { key: string; status: 'copied' | 'failed' } | null;

function useCopy() {
  const [state, setState] = useState<CopyState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(async (key: string, text: string) => {
    let status: 'copied' | 'failed' = 'copied';
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
    } catch {
      status = 'failed';
    }
    setState({ key, status });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), 2400);
  }, []);
  return { state, copy };
}

function AgentMarks({ size = 'h-4 w-4' }: { size?: string }) {
  return (
    <span className="flex items-center gap-1.5" data-agent-marks aria-hidden>
      {ONBOARDING_AGENTS.map((agent) => {
        const Mark = MARKS[agent.id];
        return <Mark key={agent.id} className={cn(size, 'shrink-0')} />;
      })}
    </span>
  );
}

function PromptBlock({
  label,
  copyKey,
  prompt,
  primary = false,
  state,
  onCopy,
}: {
  label: string;
  copyKey: string;
  prompt: string;
  primary?: boolean;
  state: CopyState;
  onCopy: (key: string, text: string) => void;
}) {
  const current = state?.key === copyKey ? state.status : null;
  const previewId = useId();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-border/80 bg-[hsl(var(--code-bg))] shadow-[0_18px_40px_-32px_rgba(20,21,18,0.5)]">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(var(--code-header))] py-1.5 pl-4 pr-1.5">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <button
          type="button"
          onClick={() => onCopy(copyKey, prompt)}
          aria-label={current === 'copied' ? `${label} copied` : `Copy ${label}`}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-card active:scale-[0.98]',
            current === 'copied'
              ? 'border-emerald-700/30 bg-emerald-600/10 text-emerald-800'
              : current === 'failed'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : primary
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border bg-card text-foreground hover:border-foreground/25 hover:bg-accent',
          )}
        >
          {current === 'copied' ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {current === 'copied'
            ? 'Copied'
            : current === 'failed'
              ? 'Select to copy'
              : 'Copy prompt'}
        </button>
      </div>
      <div className="relative">
        <pre
          id={previewId}
          className={cn(
            'whitespace-pre-wrap break-words px-4 pt-3.5 font-sans text-[12.5px] leading-5 text-foreground/85 [overflow-wrap:anywhere]',
            expanded ? 'pb-3' : 'max-h-[7.75rem] overflow-hidden pb-0',
          )}
          aria-label={label}
        >
          {prompt}
        </pre>
        {!expanded ? (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[hsl(var(--code-bg))] via-[hsl(var(--code-bg)/0.75)] to-transparent"
            aria-hidden
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={previewId}
        className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-border/60 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        {expanded ? 'Show less' : 'Show full prompt'}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform motion-reduce:transition-none',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}

function StepHeading({
  index,
  title,
  optional = false,
  children,
}: {
  index: number;
  title: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[11px] font-semibold text-foreground"
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-6">
          {title}
          {optional ? (
            <span className="rounded-full border border-border/80 px-2 py-px text-[11px] font-medium text-muted-foreground">
              Optional
            </span>
          ) : null}
        </h3>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export function AgentOnboarding({ className }: { className?: string }) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<OnboardingAgentId>('claude');
  const { state, copy } = useCopy();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const selectByIndex = (index: number) => {
    const count = ONBOARDING_AGENTS.length;
    const next = ONBOARDING_AGENTS[(index + count) % count];
    if (!next) return;
    setActive(next.id);
    tabRefs.current[(index + count) % count]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') selectByIndex(index + 1);
    else if (event.key === 'ArrowLeft') selectByIndex(index - 1);
    else if (event.key === 'Home') selectByIndex(0);
    else if (event.key === 'End') selectByIndex(ONBOARDING_AGENTS.length - 1);
    else return;
    event.preventDefault();
  };

  const agent = ONBOARDING_AGENTS.find((entry) => entry.id === active) ?? ONBOARDING_AGENTS[0];
  const announcement =
    state?.status === 'copied'
      ? 'Copied to clipboard.'
      : state?.status === 'failed'
        ? 'Copy is unavailable here. Select the text and copy it manually.'
        : '';

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        data-agent-onboarding-trigger
        className={cn(
          'group inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-[1.25rem] border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_24px_-20px_rgba(20,21,18,0.55)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[hsl(var(--brand-orange)/0.5)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_32px_-20px_rgba(20,21,18,0.55),0_0_0_3px_hsl(var(--brand-orange)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:border-[hsl(var(--brand-orange)/0.6)] active:bg-accent/60 active:shadow-[inset_0_1px_2px_rgba(20,21,18,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 min-[400px]:rounded-full sm:text-sm',
          className,
        )}
      >
        <span>{PILL_LABEL}</span>
        <span className="flex items-center gap-2">
          <AgentMarks />
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--brand-orange))] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-agent-onboarding-dialog
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="agent-onboarding-dialog fixed text-left inset-x-0 bottom-0 top-auto m-0 flex max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-border bg-card p-0 text-foreground shadow-[0_-24px_60px_-30px_rgba(20,21,18,0.55)] backdrop:bg-[hsl(90_5%_12%/0.42)] backdrop:backdrop-blur-[2px] open:flex sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[min(88vh,800px)] sm:max-w-2xl sm:rounded-2xl sm:shadow-[0_32px_80px_-36px_rgba(20,21,18,0.6)] [&:not([open])]:hidden"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <span
              className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border sm:hidden"
              aria-hidden
            />
            <h2 id={titleId} className="text-lg font-semibold tracking-tight sm:text-xl">
              {PILL_LABEL}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
              Give your agent the full picture of OpenSignet, then connect it when you want it to
              act.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Agent"
          className="mx-5 grid shrink-0 grid-cols-4 gap-1 rounded-xl border border-border/80 bg-secondary/50 p-1 sm:mx-6"
        >
          {ONBOARDING_AGENTS.map((entry, index) => {
            const Mark = MARKS[entry.id];
            const selected = entry.id === active;
            return (
              <button
                key={entry.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(entry.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  'inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 sm:flex-row sm:gap-2 sm:text-sm',
                  selected
                    ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(20,21,18,0.12),0_0_0_1px_hsl(var(--border)/0.9)]'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                )}
              >
                <Mark className="h-4 w-4 shrink-0" />
                <span className="max-w-full truncate">{entry.name}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${agent?.id ?? 'claude'}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5 sm:px-6"
        >
          {agent ? (
            <div key={agent.id} className="space-y-7">
              <section className="space-y-3">
                <StepHeading index={1} title="Give your agent context">
                  Paste into {agent.pasteTarget}. {agent.name} learns what OpenSignet is, what it
                  does well, how to use it safely and where to find more.
                </StepHeading>
                <PromptBlock
                  label="Context prompt"
                  copyKey={`${agent.id}-context`}
                  prompt={CONTEXT_PROMPT}
                  primary
                  state={state}
                  onCopy={copy}
                />
              </section>

              <section className="space-y-3">
                <StepHeading index={2} title="Connect OpenSignet" optional>
                  Paste next to let {agent.name} check names, prices and your identities directly.
                  It adds the OpenSignet MCP server itself, or walks you through it.
                </StepHeading>
                <PromptBlock
                  label="Connection prompt"
                  copyKey={`${agent.id}-connect`}
                  prompt={agent.connectPrompt}
                  state={state}
                  onCopy={copy}
                />
                <details className="group/manual rounded-xl border border-border/80 bg-card/60">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 marker:content-none [&::-webkit-details-marker]:hidden">
                    Set it up yourself in {agent.manual.app}
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/manual:rotate-180 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-3 border-t border-border/60 px-3.5 pb-4 pt-3">
                    <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
                      {agent.manual.steps.map((step, index) => (
                        <li key={step} className="flex gap-2.5">
                          <span className="w-4 shrink-0 font-mono text-xs leading-6 text-foreground">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 [overflow-wrap:anywhere]">{step}</span>
                        </li>
                      ))}
                    </ol>
                    {agent.manual.config ? (
                      <CodeCard
                        title={agent.manual.config.label}
                        code={agent.manual.config.code}
                        copyLabel="configuration"
                      />
                    ) : null}
                    {agent.manual.note ? (
                      <p className="text-xs leading-5 text-muted-foreground">{agent.manual.note}</p>
                    ) : null}
                    <a
                      href={MCP_DOCS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                      MCP setup guide
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </div>
                </details>
              </section>
            </div>
          ) : null}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </dialog>
    </>
  );
}

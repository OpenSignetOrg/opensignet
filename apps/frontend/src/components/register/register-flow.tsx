'use client';

import { CONTACT } from '@/lib/contact';
import { useState, useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeaderAccountButton } from '@/components/wallet/header-account-button';
import { parseDomainEntry } from '@/lib/domain-entry';
import { SelectMenu } from '@/components/ui/select-menu';
import { Check, X, Loader2, ArrowRight, ExternalLink, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { useRegisterAgent } from '@/hooks/use-register-agent';
import { useSiwe } from '@/hooks/use-siwe';
import { useRegistrationSnapshot, useRegistrationTracker } from './registration-tracker-provider';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { toast } from 'sonner';
import {
  getBaseChainSwitchCopy,
  isBaseChainMismatchError,
  isBaseChainRequiredError,
} from '@/lib/base-chain';
import { useBaseChainGuard } from '@/hooks/use-base-chain';
import { PRIMARY_SUPPORTED_TLDS } from '@opensignet/shared/constants';
import type { SupportedTld } from '@opensignet/shared';

/** .com is the default ending, so it leads the menu; the rest keep the shared order. */
const TLDS: readonly SupportedTld[] = [
  'com',
  ...PRIMARY_SUPPORTED_TLDS.filter((item) => item !== 'com'),
];
type Tld = SupportedTld;

const COINBASE_BUY_USDC_URL = 'https://www.coinbase.com/buy/usdc';
const NEXORA_SWAP_URL = 'https://nexoraswap.rakibhq.xyz';
const QUOTE_TIMEOUT_MS = 90 * 1000;

type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error' | 'expired';

interface AvailabilityResult {
  domain: string;
  available: boolean;
  reason?: string;
  premium?: boolean;
  priceUsd?: string;
  basename?: string;
  basenameAvailable?: boolean;
  basenameReason?: string;
  basenameCostUsdc?: string;
  ensName?: string;
  ensAvailable?: boolean;
  ensReason?: string;
  ensCostUsdc?: string;
  alternatives?: DomainAlternative[];
}

interface DomainAlternative {
  tld: Tld;
  domain: string;
  available: boolean;
  priceUsd: string;
  premium: boolean;
  priceSource: 'registrar' | 'fallback' | 'unknown';
}

interface QuoteResult {
  domainCostUsdc: string;
  basenameCostUsdc: string;
  ensCostUsdc: string;
  emailFeeUsdc: string;
  emailIncluded?: boolean;
  includedServices?: string[];
  totalUsdc: string;
}

const TLD_OPTIONS = TLDS.map((item) => ({ value: item, label: `.${item}` }));

const REGISTRATION_YEAR_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1).map((y) => ({
  value: y,
  label: `${y} year${y > 1 ? 's' : ''}`,
}));

/**
 * A registration names no plan: plans apply to the whole account and are bought or changed from the
 * pricing page or the dashboard, never here.
 */

export function RegisterFlow() {
  const { address, isConnected } = useAccount();
  const {
    effectiveChainId,
    isBaseChain,
    isSwitchingBase: switchingChain,
    ensureBaseChain,
  } = useBaseChainGuard();
  const { balanceAtomic, balanceNumber, balanceFormatted } = useUsdcBalance(
    address,
    effectiveChainId,
  );
  const { state: regState, register: submitRegister, reset: resetRegister } = useRegisterAgent();
  const { session } = useSiwe();
  const tracker = useRegistrationTracker();
  const tracking = useRegistrationSnapshot();
  const payerAuthenticated = Boolean(
    session.authenticated && address && session.address?.toLowerCase() === address.toLowerCase(),
  );

  const [name, setName] = useState('');
  const [searchedName, setSearchedName] = useState('');
  const [tld, setTld] = useState<SupportedTld>('com');
  const [query, setQuery] = useState('');
  const [tldNotice, setTldNotice] = useState<string | null>(null);
  const [registerBasename, setRegisterBasename] = useState(false);
  const [basenameLabel, setBasenameLabel] = useState('');
  const [registerEns, setRegisterEns] = useState(false);
  const [ensLabel, setEnsLabel] = useState('');
  const [emailUsername, setEmailUsername] = useState('hello');
  const [years, setYears] = useState(1);
  const [autoRenew, setAutoRenew] = useState(false);

  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<number | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const nameFieldRef = useRef<HTMLDivElement>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const effectiveBasenameLabel = basenameLabel || name;
  const effectiveEnsLabel = ensLabel || name;
  const emailDomain = name ? `${name}.${tld}` : 'yourdomain.com';
  const emailPreview = `${emailUsername || 'hello'}@${emailDomain}`;

  const refreshSearch = useCallback(
    (label: string = name) => {
      if (label.length < 3) return;
      setSearchedName(label);
      setSearchNonce((value) => value + 1);
      setQuote(null);
      setQuoteStatus('loading');
      setQuoteError(null);
      setQuoteFetchedAt(null);
    },
    [name],
  );

  /** Reads a typed or pasted entry: "myagent.com" selects .com instead of searching "myagentcom". */
  const commitQuery = useCallback(
    (raw: string = query) => {
      const parsed = parseDomainEntry(raw);
      if (parsed.tld && (TLDS as readonly string[]).includes(parsed.tld)) {
        setTld(parsed.tld as SupportedTld);
        setTldNotice(null);
      } else if (parsed.tld) {
        setTldNotice(`.${parsed.tld} is not offered yet. Showing the other endings instead.`);
      } else {
        setTldNotice(null);
      }
      setQuery(parsed.label);
      setName(parsed.label);
      return parsed.label;
    },
    [query],
  );

  // Live availability check
  useEffect(() => {
    if (searchedName.length < 3) {
      setAvailability(null);
      setAvailabilityError(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setAvailabilityError(null);
    const t = setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          name: searchedName,
          tld,
          basenameLabel: registerBasename ? basenameLabel || searchedName : searchedName,
          ensLabel: registerEns ? ensLabel || searchedName : searchedName,
        });
        const res = await fetch(`/api/v1/domains/availability?${query.toString()}`);
        if (!res.ok) {
          if (!cancelled) {
            setAvailability({
              domain: `${searchedName}.${tld}`,
              available: false,
              reason: 'api_error',
            });
            setAvailabilityError('Availability check is unavailable. Search again in a moment.');
          }
          return;
        }
        const data = (await res.json()) as AvailabilityResult;
        if (!cancelled) {
          setAvailability(data);
          setAvailabilityError(null);
        }
      } catch {
        if (!cancelled) {
          setAvailability({
            domain: `${searchedName}.${tld}`,
            available: false,
            reason: 'network_error',
          });
          setAvailabilityError('Availability check timed out. Search again in a moment.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setChecking(false);
    };
  }, [searchedName, tld, basenameLabel, ensLabel, registerBasename, registerEns, searchNonce]);

  // Live quote
  useEffect(() => {
    if (searchedName.length < 3) {
      setQuote(null);
      setQuoteStatus('idle');
      setQuoteError(null);
      setQuoteFetchedAt(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    setQuote(null);
    setQuoteStatus('loading');
    setQuoteError(null);
    setQuoteFetchedAt(null);
    const query = new URLSearchParams({
      preferredName: searchedName,
      tld,
      registerBasename: String(registerBasename),
      basenameLabel: registerBasename ? basenameLabel || searchedName : searchedName,
      registerEns: String(registerEns),
      ensLabel: registerEns ? ensLabel || searchedName : searchedName,
      emailEnabled: 'true',
      emailUsername: emailUsername || 'hello',
      years: String(years),
    });
    fetch(`/api/v1/agents/quote?${query.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error('Price quote is unavailable.');
        }
        return (await r.json()) as QuoteResult;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.totalUsdc) {
          setQuote(data);
          setQuoteStatus('ready');
          setQuoteFetchedAt(Date.now());
          return;
        }
        setQuote(null);
        setQuoteStatus('error');
        setQuoteError('Price quote is unavailable. Search again to check price again.');
      })
      .catch(() => {
        if (cancelled) return;
        setQuote(null);
        setQuoteStatus('error');
        setQuoteError('Price quote is unavailable. Search again to check price again.');
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    searchedName,
    tld,
    registerBasename,
    registerEns,
    emailUsername,
    basenameLabel,
    ensLabel,
    years,
    searchNonce,
  ]);

  useEffect(() => {
    if (quoteStatus !== 'ready' || !quoteFetchedAt) return;
    const remainingMs = QUOTE_TIMEOUT_MS - (Date.now() - quoteFetchedAt);
    if (remainingMs <= 0) {
      setQuoteStatus('expired');
      return;
    }
    const timer = window.setTimeout(() => setQuoteStatus('expired'), remainingMs);
    return () => window.clearTimeout(timer);
  }, [quoteFetchedAt, quoteStatus]);

  const validName = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(name);
  const validBasenameLabel = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(effectiveBasenameLabel);
  const validEnsLabel = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(effectiveEnsLabel);
  const validEmailUsername =
    /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(emailUsername) &&
    !emailUsername.includes('..');
  const isCurrentSearch = name === searchedName;
  const quoteHasDomainPrice = quote ? Number(quote.domainCostUsdc) > 0 : false;
  const quoteReady =
    quoteStatus === 'ready' && Boolean(quote) && isCurrentSearch && quoteHasDomainPrice;
  const paymentQuote =
    regState.phase !== 'idle' && regState.phase !== 'error' ? regState.payment : undefined;
  const showQuoteCard =
    Boolean(paymentQuote) ||
    (isCurrentSearch &&
      validName &&
      searchedName.length >= 3 &&
      (quoteStatus !== 'idle' || Boolean(quote)));
  const quoteRefreshMessage =
    quoteStatus === 'expired' ? 'Quote timed out. Search again to check price again.' : quoteError;
  const totalCost = quoteReady && quote ? Number(quote.totalUsdc) : 0;
  const isMainnet = isBaseChain;
  const suggestedAlternatives = useMemo(
    () => availability?.alternatives?.filter((alt) => alt.available) ?? [],
    [availability?.alternatives],
  );
  const basenameBlocked =
    registerBasename && (!validBasenameLabel || availability?.basenameAvailable === false);
  const ensBlocked = registerEns && (!validEnsLabel || availability?.ensAvailable === false);
  const insufficientBalance =
    isConnected &&
    isMainnet &&
    (paymentQuote
      ? balanceAtomic < BigInt(paymentQuote.amountAtomic)
      : totalCost > 0 && balanceNumber < totalCost);
  const wrongChain = isConnected && !isMainnet;
  const existingPurchase = Boolean(address && tracker.hasPurchase(address, `${name}.${tld}`));

  const canSubmit = useMemo(() => {
    if (!isConnected || !address) return false;
    if (!payerAuthenticated || tracking.connection !== 'ready' || existingPurchase) return false;
    if (wrongChain) return false;
    if (!validName || !availability?.available || checking) return false;
    if (!quoteReady) return false;
    if (!validEmailUsername) return false;
    if (basenameBlocked) return false;
    if (ensBlocked) return false;
    if (turnstileSiteKey && !turnstileToken) return false;
    if (insufficientBalance) return false;
    if (regState.phase !== 'idle' && regState.phase !== 'error') return false;
    return true;
  }, [
    isConnected,
    address,
    wrongChain,
    validName,
    validEmailUsername,
    availability,
    checking,
    quoteReady,
    basenameBlocked,
    ensBlocked,
    turnstileSiteKey,
    turnstileToken,
    insufficientBalance,
    regState.phase,
    payerAuthenticated,
    tracking.connection,
    existingPurchase,
  ]);

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  async function handleSwitchBaseMainnet() {
    await ensureBaseChain();
  }

  async function handleRegister() {
    if (wrongChain) {
      await handleSwitchBaseMainnet();
      return;
    }
    if (!quoteReady) {
      toast.error('Price quote expired', {
        description: 'Search again to re-check price before registering.',
      });
      return;
    }
    try {
      await submitRegister({
        preferredName: name,
        tld,
        registerBasename,
        basenameLabel: effectiveBasenameLabel,
        registerEns,
        ensLabel: effectiveEnsLabel,
        emailEnabled: true,
        emailUsername: emailUsername || 'hello',
        years,
        autoRenew,
        turnstileToken: turnstileToken ?? undefined,
      });
    } catch (e) {
      if (isBaseChainRequiredError(e) || isBaseChainMismatchError(e)) {
        const copy = getBaseChainSwitchCopy(e);
        toast.info(copy.title, { description: copy.description });
        return;
      }
      toast.info('Checkout not submitted', {
        description:
          'No payment request was submitted. Check your payer sign-in and registration updates before continuing.',
      });
    }
  }

  // Show success screen if registration completed
  if (regState.phase === 'success' && regState.result) {
    return (
      <SuccessScreen
        result={regState.result}
        autoRenew={autoRenew}
        onReset={() => {
          resetRegister();
          setName('');
          setQuery('');
          setTldNotice(null);
          setBasenameLabel('');
          setEnsLabel('');
          setEmailUsername('hello');
          setYears(1);
          setAutoRenew(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {wrongChain && (
        <div className="premium-surface rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
              <div className="min-w-0">
                <div className="font-medium text-destructive">Switch to Base mainnet</div>
                <div className="mt-1 text-muted-foreground">
                  Registration and USDC payment only run on Base mainnet.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSwitchBaseMainnet()}
              disabled={switchingChain}
              className="w-full shrink-0 sm:w-auto"
            >
              {switchingChain ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Switch'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Name */}
      <Card className="premium-surface relative z-20">
        <CardContent className="p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold">
            <label htmlFor="register-agent-name">1. Choose your name</label>
          </h2>
          <form
            role="search"
            aria-label="Domain name search"
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              refreshSearch(commitQuery());
            }}
          >
            <div className="relative min-w-0 flex-1">
              <div
                ref={nameFieldRef}
                className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-background/70 shadow-inner shadow-black/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/60"
              >
                <input
                  id="register-agent-name"
                  value={query}
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => {
                    const nextQuery = e.target.value.toLowerCase().replace(/[^a-z0-9.:/-]/g, '');
                    const nextName = parseDomainEntry(nextQuery).label;
                    setQuery(nextQuery);
                    setName(nextName);
                    if (availability) setAvailability(null);
                    if (nextName !== searchedName) {
                      setQuote(null);
                      setQuoteStatus('idle');
                      setQuoteError(null);
                      setQuoteFetchedAt(null);
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (!/[.:/]/.test(pasted)) return;
                    e.preventDefault();
                    refreshSearch(commitQuery(pasted));
                  }}
                  onBlur={() => {
                    if (query.includes('.')) commitQuery();
                  }}
                  enterKeyHint="search"
                  placeholder="myagent"
                  className="w-0 min-w-0 flex-1 bg-transparent px-3 py-3 font-mono outline-none sm:px-4"
                  autoFocus
                  disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                />
                <SelectMenu
                  value={tld}
                  options={TLD_OPTIONS}
                  onChange={setTld}
                  ariaLabel="Domain ending"
                  heading="Popular"
                  anchorRef={nameFieldRef}
                  className="flex shrink-0"
                  triggerClassName="h-full min-w-[5rem] justify-center gap-1.5 rounded-none border-0 bg-card/70 py-3 font-mono font-normal hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:ring-0 sm:h-full sm:w-auto sm:min-w-[5rem]"
                  optionClassName="font-mono"
                  disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                (regState.phase !== 'idle' && regState.phase !== 'error') ||
                name.length < 3 ||
                checking
              }
              className="h-12 px-6 sm:h-auto sm:self-start sm:py-3"
            >
              Search
            </Button>
          </form>
          {tldNotice ? (
            <p role="status" className="mt-2 text-xs leading-5 text-foreground">
              {tldNotice}
            </p>
          ) : null}
          {name && searchedName && name === searchedName && (
            <div className="mt-3 flex min-w-0 items-start gap-2 text-sm">
              {checking ? (
                <>
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Checking availability...</span>
                </>
              ) : !validName ? (
                <>
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-destructive">Invalid name format</span>
                </>
              ) : availability?.available ? (
                <>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-900" />
                  <span className="wrap-anywhere text-green-900">
                    {name}.{tld} is available
                    {availability.priceUsd && Number(availability.priceUsd) > 0
                      ? ` ($${availability.priceUsd})`
                      : ''}
                  </span>
                  {availability.premium && <Badge variant="warning">Premium</Badge>}
                </>
              ) : availability ? (
                <div>
                  <div className="flex min-w-0 items-start gap-2">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span className="wrap-anywhere text-destructive">
                      {availabilityError ??
                        `${name}.${tld} is unavailable - try an alternative below`}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {name && validName && registerBasename && availability?.basename && (
            <div className="mt-2 flex min-w-0 items-start gap-2 text-sm">
              {availability.basenameAvailable === false ? (
                <>
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="wrap-anywhere text-destructive">
                    {availability.basename} is unavailable
                  </span>
                </>
              ) : availability.basenameAvailable === true ? (
                <>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-900" />
                  <span className="wrap-anywhere text-green-900">
                    {availability.basename} is available
                    {availability.basenameCostUsdc ? ` ($${availability.basenameCostUsdc})` : ''}
                  </span>
                </>
              ) : null}
            </div>
          )}
          {name && validName && registerEns && availability?.ensName && (
            <div className="mt-2 flex min-w-0 items-start gap-2 text-sm">
              {availability.ensAvailable === false ? (
                <>
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="wrap-anywhere text-destructive">
                    {availability.ensName} is unavailable
                  </span>
                </>
              ) : availability.ensAvailable === true ? (
                <>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-900" />
                  <span className="wrap-anywhere text-green-900">
                    {availability.ensName} is available
                    {availability.ensCostUsdc ? ` ($${availability.ensCostUsdc})` : ''}
                  </span>
                </>
              ) : null}
            </div>
          )}
          {suggestedAlternatives.length > 0 && (
            <div className="premium-surface mt-4 rounded-lg border p-3">
              <div className="mb-2 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-foreground">Other available endings</span>
                <span>Cheapest first</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {suggestedAlternatives.map((alt, index) => (
                  <button
                    key={alt.domain}
                    type="button"
                    onClick={() => {
                      setTld(alt.tld);
                      setTldNotice(null);
                    }}
                    disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                    className="interactive-surface group rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-left disabled:pointer-events-none disabled:opacity-60"
                  >
                    <div className="flex min-w-0 items-center gap-2 font-mono text-sm text-foreground">
                      <span className="truncate">
                        {name}.{alt.tld}
                      </span>
                      {index === 0 && (
                        <span className="rounded-full border border-orange-700/20 bg-orange-600/10 px-2 py-0.5 text-[10px] font-sans text-orange-800">
                          Cheapest
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {alt.priceUsd ? `$${alt.priceUsd}` : 'See quote'}
                      {alt.premium ? ' premium' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Add-ons */}
      <Card className="premium-surface">
        <CardContent className="p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold">2. Choose your stack</h2>
          <div className="space-y-8">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Domain
              </h3>
              <div
                className={cn(
                  'interactive-surface relative z-20 w-full flex flex-col gap-3 rounded-lg border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between',
                  years > 1 ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-card/60',
                  regState.phase !== 'idle' &&
                    regState.phase !== 'error' &&
                    'opacity-60 cursor-not-allowed',
                )}
              >
                <div>
                  <div
                    id="register-years-label"
                    className="flex items-center gap-2 font-medium text-sm"
                  >
                    Registration Duration
                  </div>
                  <div
                    id="register-years-help"
                    className="text-xs text-muted-foreground font-mono mt-0.5"
                  >
                    Choose how many years to register your domain for
                  </div>
                </div>
                <div className="w-full flex-shrink-0 sm:w-auto">
                  <SelectMenu
                    id="register-years"
                    ariaLabel="Registration duration"
                    ariaDescribedBy="register-years-help"
                    value={years}
                    options={REGISTRATION_YEAR_OPTIONS}
                    onChange={setYears}
                    disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                  />
                </div>
              </div>

              <Toggle
                label="Enable Auto-Renew"
                sublabel="Renew automatically before expiry to keep your domain and email active"
                checked={autoRenew}
                onChange={setAutoRenew}
                disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Email
              </h3>
              <EmailUsernameInput
                value={emailUsername}
                preview={emailPreview}
                valid={validEmailUsername}
                onChange={(value) => setEmailUsername(sanitizeEmailUsername(value))}
                onReset={() => setEmailUsername('hello')}
                disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Web3 Identities
              </h3>
              <Toggle
                label="Basename on Base"
                sublabel={
                  effectiveBasenameLabel
                    ? `${effectiveBasenameLabel}.base.eth`
                    : 'yourname.base.eth'
                }
                checked={registerBasename}
                onChange={setRegisterBasename}
                disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
              />
              {registerBasename && (
                <NameOverrideInput
                  label="Basename label"
                  suffix=".base.eth"
                  value={effectiveBasenameLabel}
                  placeholder={name || 'myagent'}
                  valid={validBasenameLabel}
                  onChange={(value) => setBasenameLabel(sanitizeLabel(value))}
                  onReset={() => setBasenameLabel('')}
                  disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                />
              )}
              <Toggle
                label="ENS Name on Ethereum"
                sublabel={effectiveEnsLabel ? `${effectiveEnsLabel}.eth` : 'yourname.eth'}
                checked={registerEns}
                onChange={setRegisterEns}
                disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
              />
              {registerEns && (
                <NameOverrideInput
                  label="ENS label"
                  suffix=".eth"
                  value={effectiveEnsLabel}
                  placeholder={name || 'myagent'}
                  valid={validEnsLabel}
                  onChange={(value) => setEnsLabel(sanitizeLabel(value))}
                  onReset={() => setEnsLabel('')}
                  disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Quote */}
      {showQuoteCard && (
        <Card className="premium-surface premium-elevated border-primary/40">
          <CardContent className="p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold">3. Pricing</h2>
            {paymentQuote ? (
              <div className="space-y-2 text-sm">
                <Line
                  label="Payment total (USDC on Base)"
                  value={`${paymentQuote.amountUsdc} USDC`}
                  bold
                />
                <p className="text-muted-foreground">
                  {regState.paymentStatus === 'settled'
                    ? 'Payment settled. Registration updates are being checked.'
                    : regState.paymentStatus === 'refunded'
                      ? 'Payment refunded. Review registration updates.'
                      : regState.paymentStatus === 'not_charged'
                        ? 'Payment was not charged. Review registration updates.'
                        : regState.phase === 'awaiting-signature'
                          ? 'Awaiting your payment signature.'
                          : 'This is the signed amount. Settlement is not yet confirmed.'}
                </p>
              </div>
            ) : quoteStatus === 'loading' ? (
              <QuoteNotice
                tone="loading"
                title="Checking latest price..."
                message="Please wait while we refresh the live registrar and add-on pricing."
              />
            ) : quoteStatus === 'expired' || quoteStatus === 'error' || !quoteReady ? (
              <QuoteNotice
                tone="warning"
                title="Price check required"
                message={quoteRefreshMessage ?? 'Search again to check price again.'}
                actionLabel="Search again"
                onAction={refreshSearch}
              />
            ) : quote ? (
              <div className="space-y-2 text-sm">
                <p className="pb-1 text-xs text-muted-foreground">
                  {`One USDC payment on Base. Each priced line covers ${years} year${years === 1 ? '' : 's'}.`}
                </p>
                <Line
                  label={`Domain (.${tld})`}
                  value={
                    Number(quote.domainCostUsdc) > 0 ? `$${quote.domainCostUsdc}` : 'Checking...'
                  }
                />
                {registerBasename && (
                  <Line
                    label="Basename (includes gas estimate)"
                    value={`$${quote.basenameCostUsdc}`}
                  />
                )}
                {registerEns && (
                  <Line label="ENS (includes gas estimate)" value={`$${quote.ensCostUsdc}`} />
                )}
                <Line label="Email inbox, DNS and AgentID mint" value="Included" />
                <div className="border-t border-border/50 pt-3 mt-3">
                  <Line label="Total (USDC on Base)" value={`$${quote.totalUsdc}`} bold />
                </div>
                <p className="pt-1 text-xs leading-5 text-muted-foreground">
                  After payment settles, OpenSignet sets up the domain, DNS, email, any selected
                  names and the AgentID mint. Each step&apos;s status appears on your dashboard.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Insufficient balance warning */}
      {insufficientBalance && (
        <Card className="premium-surface border-destructive/40">
          <CardContent className="flex items-start gap-3 px-4 pb-4 pt-4 text-sm sm:px-5 sm:pb-5 sm:pt-5">
            <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="font-medium leading-5 [overflow-wrap:anywhere]">
                You need {paymentQuote?.amountUsdc ?? quote?.totalUsdc} USDC but only have{' '}
                {balanceFormatted} USDC.
              </div>
              <div className="leading-5 text-muted-foreground">
                Add USDC to this wallet on Base mainnet, then refresh your balance.
              </div>
              <div className="flex flex-col gap-x-4 gap-y-2 pt-0.5 sm:flex-row sm:flex-wrap">
                <ExternalFundingLink href={COINBASE_BUY_USDC_URL}>
                  Buy USDC on Coinbase
                </ExternalFundingLink>
                <ExternalFundingLink href={NEXORA_SWAP_URL}>
                  Swap or bridge from other chains
                </ExternalFundingLink>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status indicator during registration */}
      {(regState.phase === 'preparing' ||
        regState.phase === 'awaiting-signature' ||
        regState.phase === 'submitting' ||
        regState.phase === 'processing') && (
        <Card className="premium-surface border-primary/50">
          <CardContent
            role="status"
            className="flex min-h-12 items-center gap-3 px-4 py-3 sm:px-4 sm:py-3"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <div className="min-h-6 min-w-0 break-words text-sm font-medium leading-6">
              {regState.phase === 'processing'
                ? regState.paymentStatus === 'settled'
                  ? 'Payment settled. Registration is processing.'
                  : regState.paymentStatus === 'refunded'
                    ? 'Payment refunded. Review registration updates.'
                    : regState.paymentStatus === 'not_charged'
                      ? 'Payment was not charged. Review registration updates.'
                      : 'Submission outcome is unconfirmed. Checking registration updates; do not pay again.'
                : (regState.message ?? 'Preparing checkout...')}
            </div>
          </CardContent>
        </Card>
      )}

      {regState.phase === 'error' && regState.error && (
        <Card className="border-destructive/60 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            <div className="font-semibold mb-1">
              {regState.rejectionCode ? 'Payment submission rejected' : 'Checkout not submitted'}
            </div>
            <div>{regState.error}</div>
          </CardContent>
        </Card>
      )}

      {regState.phase === 'action-required' && (
        <div
          role="status"
          className="flex items-start gap-3 border-l-2 border-amber-600 px-4 py-3 text-sm"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">Purchase needs review</p>
            <p className="break-words text-muted-foreground">{regState.message}</p>
            <a href={`mailto:${CONTACT.support}`} className="inline-block text-primary underline">
              Contact support
            </a>
          </div>
        </div>
      )}

      {(regState.phase === 'processing' || existingPurchase) &&
        regState.phase !== 'action-required' && (
          <p className="text-sm text-muted-foreground">
            This purchase is being tracked.{' '}
            <Link href="/dashboard" className="text-primary underline">
              View registration progress
            </Link>
            ; do not pay again.
          </p>
        )}

      {/* Step 4: Submit */}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
        {turnstileSiteKey && isConnected && (
          <div className="w-full max-w-sm sm:mr-auto">
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              disabled={regState.phase !== 'idle' && regState.phase !== 'error'}
              onToken={handleTurnstileToken}
            />
          </div>
        )}
        {payerAuthenticated ? (
          <Button
            variant="gradient"
            size="xl"
            disabled={
              regState.phase === 'action-required' || (wrongChain ? switchingChain : !canSubmit)
            }
            onClick={handleRegister}
            className="group w-full sm:w-auto"
          >
            {regState.phase === 'action-required' ? (
              <>
                <CircleAlert className="h-4 w-4" />
                Purchase needs review
              </>
            ) : regState.phase !== 'idle' && regState.phase !== 'error' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {regState.phase === 'awaiting-signature'
                  ? 'Awaiting signature...'
                  : regState.phase === 'submitting'
                    ? 'Submitting payment...'
                    : regState.phase === 'processing'
                      ? regState.paymentStatus === 'settled'
                        ? 'Processing registration...'
                        : 'Checking payment...'
                      : 'Preparing checkout...'}
              </>
            ) : existingPurchase ? (
              'Purchase already tracked'
            ) : tracking.connection !== 'ready' ? (
              'Waiting for registration updates'
            ) : wrongChain ? (
              switchingChain ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Switching...
                </>
              ) : (
                'Switch to Base mainnet'
              )
            ) : !validName || !availability?.available ? (
              availabilityError ? (
                'Search again in a moment'
              ) : (
                'Pick a valid available name'
              )
            ) : insufficientBalance ? (
              'Insufficient USDC balance'
            ) : !validEmailUsername ? (
              'Fix email username'
            ) : registerBasename && !validBasenameLabel ? (
              'Fix Basename label'
            ) : basenameBlocked ? (
              'Basename unavailable'
            ) : registerEns && !validEnsLabel ? (
              'Fix ENS label'
            ) : ensBlocked ? (
              'ENS unavailable'
            ) : quoteStatus === 'loading' ? (
              'Checking price...'
            ) : !quoteReady ? (
              'Search again to check price'
            ) : turnstileSiteKey && !turnstileToken ? (
              'Complete spam check'
            ) : (
              <>
                Register agent identity
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        ) : (
          <div className="flex w-full flex-col items-stretch gap-2 text-center sm:w-auto sm:items-end sm:text-right">
            <HeaderAccountButton
              size="lg"
              destination={null}
              prepare={ensureBaseChain}
              showAccount={false}
              showError
              className="w-full sm:w-auto"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Sign in to continue with your purchase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function NameOverrideInput({
  label,
  suffix,
  value,
  placeholder,
  valid,
  onChange,
  onReset,
  disabled,
}: {
  label: string;
  suffix: string;
  value: string;
  placeholder: string;
  valid: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  return (
    <div className="premium-surface rounded-lg border p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">
          {label}
        </label>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="inline-flex min-h-6 items-center self-start text-xs text-primary underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50 sm:self-auto"
        >
          Use domain name
        </button>
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col items-stretch overflow-hidden rounded-md border border-input bg-background/70 shadow-inner shadow-black/10 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/60 sm:flex-row',
          value && !valid && 'border-destructive/70',
        )}
      >
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none"
          disabled={disabled}
        />
        <span className="flex items-center justify-center border-t border-border/40 bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground sm:border-l sm:border-t-0">
          {suffix}
        </span>
      </div>
      {value && !valid && (
        <div className="mt-2 text-xs text-destructive">
          Use 3-63 lowercase letters, numbers, or hyphens. No leading or trailing hyphen.
        </div>
      )}
    </div>
  );
}

function EmailUsernameInput({
  value,
  preview,
  valid,
  onChange,
  onReset,
  disabled,
}: {
  value: string;
  preview: string;
  valid: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="premium-surface rounded-lg border p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <label
            htmlFor="register-email-username"
            className="text-xs font-semibold text-muted-foreground"
          >
            Primary email username
          </label>
          <div className="wrap-anywhere mt-0.5 font-mono text-xs text-muted-foreground">
            {preview}
          </div>
        </div>
        {value !== 'hello' && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="text-xs text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Use hello
          </button>
        )}
      </div>
      <input
        id="register-email-username"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="hello"
        className={cn(
          'w-full rounded-md border border-input bg-background/70 px-3 py-2 font-mono text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/60',
          !valid && 'border-destructive/70',
        )}
        disabled={disabled}
      />
      {!valid && (
        <div className="mt-2 text-xs text-destructive">
          Use 1-64 lowercase letters, numbers, dot, underscore, plus, or hyphen. No edge dots.
        </div>
      )}
      <div className="mt-2 text-xs leading-5 text-muted-foreground">
        The inbox is included at no extra cost. You can upgrade to a higher plan anytime from your
        dashboard.{' '}
        <Link
          href="/pricing"
          className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
        >
          See pricing
        </Link>
      </div>
    </div>
  );
}

function sanitizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function sanitizeEmailUsername(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._+-]/g, '')
    .slice(0, 64);
}

function ExternalFundingLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function SuccessScreen({
  result,
  autoRenew,
  onReset,
}: {
  result: NonNullable<ReturnType<typeof useRegisterAgent>['state']['result']>;
  autoRenew: boolean;
  onReset: () => void;
}) {
  return (
    <Card className="premium-surface premium-elevated border-primary/20">
      <CardContent className="p-4 text-center sm:p-8">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full border border-green-900/20 bg-green-900/10">
          <Check className="h-8 w-8 text-green-900" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Identity registered!</h2>
        <p className="wrap-anywhere mb-6 text-muted-foreground">
          {result.domain} registration is complete.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={onReset} className="w-full sm:w-auto">
            Register another
          </Button>
          {result.agentId && (
            <Link href={`/dashboard/identities/${encodeURIComponent(result.agentId)}`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                Manage renewal
              </Button>
            </Link>
          )}
        </div>

        {autoRenew && (
          <div className="mt-6 border-t border-border/40 pt-6">
            <div className="text-sm text-muted-foreground">
              You selected <strong>Enable Auto-Renew</strong>. Since only the domain owner can
              enable this, open renewal management to authorize it on-chain.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuoteNotice({
  title,
  message,
  tone,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  tone: 'loading' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'loading'
          ? 'border-primary/20 bg-primary/5'
          : 'border-amber-900/20 bg-amber-900/10',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{message}</div>
        </div>
        {actionLabel && onAction && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAction}
            className="w-full sm:w-auto"
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'interactive-surface flex w-full flex-col gap-3 rounded-lg border px-4 py-3 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        checked ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-card/60',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium text-sm">{label}</div>
        {sublabel && (
          <div className="wrap-anywhere mt-0.5 text-xs font-mono text-muted-foreground">
            {sublabel}
          </div>
        )}
      </div>
      <div
        className={cn(
          'h-6 w-11 flex-shrink-0 self-end rounded-full p-0.5 transition-colors sm:self-start',
          checked ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-muted/90',
        )}
      >
        <div
          className={cn(
            'h-5 w-5 rounded-full bg-background transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </div>
    </button>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className={cn('text-muted-foreground', bold && 'text-foreground font-semibold')}>
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 font-mono [overflow-wrap:anywhere] sm:max-w-[65%] sm:text-right',
          bold && 'text-lg font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Plan prices for display. Monthly and yearly prices are set independently in the shared plan
 * catalog; amounts are USDC with 6 decimals.
 */
const USDC = 1_000_000;

function format(atomic: bigint): string {
  const amount = Number(atomic) / USDC;
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** "$4.90" for Plus's monthly price. */
export function monthlyPlanPrice(monthlyAtomic: bigint): string {
  return format(monthlyAtomic);
}

/** "$58" for Plus's yearly price. */
export function yearlyPlanCharge(yearlyAtomic: bigint): string {
  return format(yearlyAtomic);
}

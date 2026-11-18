import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { monthlyPlanPrice, yearlyPlanCharge } from '../../src/lib/plan-pricing';

test('monthly and yearly plan prices are set independently', () => {
  assert.equal(monthlyPlanPrice(SERVICE_PLAN_CATALOG.plus.monthlyPriceUsdcAtomic), '$4.90');
  assert.equal(yearlyPlanCharge(SERVICE_PLAN_CATALOG.plus.yearlyPriceUsdcAtomic), '$58');
  assert.equal(monthlyPlanPrice(SERVICE_PLAN_CATALOG.pro.monthlyPriceUsdcAtomic), '$10');
  assert.equal(yearlyPlanCharge(SERVICE_PLAN_CATALOG.pro.yearlyPriceUsdcAtomic), '$120');
  assert.equal(monthlyPlanPrice(SERVICE_PLAN_CATALOG.max.monthlyPriceUsdcAtomic), '$20');
  assert.equal(yearlyPlanCharge(SERVICE_PLAN_CATALOG.max.yearlyPriceUsdcAtomic), '$240');
  assert.equal(SERVICE_PLAN_CATALOG.max.limits.monthlyEmails, 100_000);
  // Enterprise starts where Max ends.
  const first = ENTERPRISE_PLAN_OFFERS[0];
  assert.ok(first);
  assert.equal(first.monthlyEmails, 150_000);
  assert.equal(monthlyPlanPrice(first.monthlyPriceUsdcAtomic), '$30');
  assert.equal(yearlyPlanCharge(first.yearlyPriceUsdcAtomic), '$360');
});

test('enterprise volumes keep monthly and yearly prices in step', () => {
  for (const offer of ENTERPRISE_PLAN_OFFERS)
    assert.equal(offer.monthlyPriceUsdcAtomic * 12n, offer.yearlyPriceUsdcAtomic, offer.sku);
  assert.equal(yearlyPlanCharge(12_000_000_000n), '$12,000');
});

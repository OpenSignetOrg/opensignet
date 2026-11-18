import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENTERPRISE_PLAN_OFFERS,
  SERVICE_PLAN_CATALOG,
  SERVICE_PLAN_INTERVALS,
} from '../dist/constants.js';
import { addServicePlanInterval, getServicePlanPriceAtomic } from '../dist/utils.js';

describe('plan billing periods', () => {
  it('offers monthly and yearly billing', () => {
    assert.deepEqual([...SERVICE_PLAN_INTERVALS], ['monthly', 'yearly']);
  });

  it('prices each period from its own catalog entry', () => {
    assert.equal(
      getServicePlanPriceAtomic('plus', 'monthly'),
      SERVICE_PLAN_CATALOG.plus.monthlyPriceUsdcAtomic,
    );
    assert.equal(
      getServicePlanPriceAtomic('plus', 'yearly'),
      SERVICE_PLAN_CATALOG.plus.yearlyPriceUsdcAtomic,
    );
    const offer = ENTERPRISE_PLAN_OFFERS[0]!;
    assert.equal(
      getServicePlanPriceAtomic('enterprise', 'monthly', offer.sku),
      offer.monthlyPriceUsdcAtomic,
    );
    assert.equal(
      getServicePlanPriceAtomic('enterprise', 'yearly', offer.sku),
      offer.yearlyPriceUsdcAtomic,
    );
  });

  it('ends a monthly period on the same day, or the last day of a shorter month', () => {
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    assert.equal(
      iso(addServicePlanInterval(new Date('2026-11-18T10:00:00Z'), 'monthly')),
      '2026-12-18',
    );
    assert.equal(
      iso(addServicePlanInterval(new Date('2027-01-31T10:00:00Z'), 'monthly')),
      '2027-02-28',
    );
    assert.equal(
      iso(addServicePlanInterval(new Date('2028-01-31T10:00:00Z'), 'monthly')),
      '2028-02-29',
    );
    assert.equal(
      iso(addServicePlanInterval(new Date('2026-12-15T10:00:00Z'), 'monthly')),
      '2027-01-15',
    );
    assert.equal(
      iso(addServicePlanInterval(new Date('2028-02-29T10:00:00Z'), 'yearly')),
      '2029-02-28',
    );
    assert.equal(
      iso(addServicePlanInterval(new Date('2026-11-18T10:00:00Z'), 'yearly')),
      '2027-11-18',
    );
  });
});

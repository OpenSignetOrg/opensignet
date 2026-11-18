'use client';

import { useState, type ReactNode } from 'react';
import { PlanCta, PlanPrice } from './billing-period';
import { SelectMenu } from '@/components/ui/select-menu';

type EnterprisePlanOption = {
  sku: string;
  monthlyEmails: number;
  /** Formatted per-month price, e.g. "$20". */
  monthly: string;
  /** Formatted yearly charge, e.g. "$240". */
  yearly: string;
};

/** Enterprise volume picker, price, the card's details and its Get now action for the chosen volume. */
export function EnterprisePlanSelector({
  offers,
  children,
}: {
  offers: EnterprisePlanOption[];
  children?: ReactNode;
}) {
  const [selectedSku, setSelectedSku] = useState(offers[0].sku);
  const enterprise = offers.find((offer) => offer.sku === selectedSku) ?? offers[0];

  return (
    <div data-enterprise-plan-selector className="contents">
      <div className="mt-3 text-xs font-medium text-muted-foreground" id="enterprise-tier-label">
        Monthly volume
      </div>
      <SelectMenu
        id="enterprise-tier"
        ariaLabel="Enterprise monthly volume"
        value={selectedSku}
        options={offers.map((offer) => ({
          value: offer.sku,
          label: `${offer.monthlyEmails.toLocaleString('en-US')} emails`,
        }))}
        onChange={setSelectedSku}
        className="mt-1"
        triggerClassName="sm:h-10 sm:w-full"
        menuMinWidth={0}
      />
      <PlanPrice
        monthly={enterprise.monthly}
        yearly={enterprise.yearly}
        className="mt-3 font-mono text-xl font-bold"
      />
      {children}
      <PlanCta plan={enterprise.sku} label="Get now" />
    </div>
  );
}

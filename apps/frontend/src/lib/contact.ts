/**
 * The OpenSignet addresses shown on the site, one per purpose. Each is an alias of the team
 * mailbox; the full list (and what every address is for) lives with the mail engine setup.
 */
export const CONTACT = {
  /** Questions and problems with the service. */
  support: 'support@opensignet.com',
  /** Vulnerability reports and "this wasn't me" security replies. */
  security: 'security@opensignet.com',
  /** Requests about personal data: access, correction, deletion, copies. */
  privacy: 'privacy@opensignet.com',
  /** Questions about the Terms of Service. */
  legal: 'legal@opensignet.com',
  /** Receipts, payments and refunds. */
  billing: 'billing@opensignet.com',
} as const;

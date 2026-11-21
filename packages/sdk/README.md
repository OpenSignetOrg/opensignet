# @opensignet/sdk

OpenSignet is the agent-native identity and communications infrastructure.

This TypeScript SDK makes identity and communication programmable for developers integrating
directly, people guiding agents, and permissioned autonomous workflows. Domains, DNS, email,
Basename, ENS, x402 USDC checkout, the OpenSignet Pass, renewal controls, and plan status support that
foundation.

The production API base is `https://api.opensignet.com/api/v1`. A direct `GET` request returns the
machine-readable service discovery document; human documentation is available at
`https://docs.opensignet.com`.

The SDK resolves a relative `apiUrl` against the browser location at construction,
before any signing or payment. Outside a browser, configure an absolute URL.
API bases must use HTTPS; explicitly configured HTTP `localhost`, `127.0.0.1`, and
`[::1]` endpoints are allowed for local development. Embedded credentials, query
strings, and fragments are rejected before requests begin.

These examples use SDK **0.1.0**. An explicit public-source build is also
documented below for local development.

```bash
npm install @opensignet/sdk@0.1.0 viem@2.56.3
```

## Quick start

Public discovery and quotes do not require credentials:

```ts
import { OpenSignet } from '@opensignet/sdk';

const ad = new OpenSignet();

const availability = await ad.checkAvailability('research-agent', {
  tld: 'xyz',
});

const quote = await ad.quote({
  preferredName: 'research-agent',
  tld: 'xyz',
  registerBasename: false,
  registerEns: false,
  emailUsername: 'hello',
});
```

Pass a viem `walletClient` only for wallet-authorized or paid operations. Pass an
agent-scoped API key only to a trusted server or agent runtime; never expose it
in browser-delivered configuration.

## Renewal

Domains renew automatically by default (`autoRenew: true` at registration). OpenSignet charges
each renewal when it falls due, 30 to 7 days before the domain expires, from the account's
OpenSignet wallet balance or its saved card, and renews the domain at the registrar once.
Nothing is deposited ahead of time and no onchain setting is involved.

```ts
const renewal = await ad.getRenewal(agentId);
if (!renewal.ready) console.log(renewal.issue?.message); // e.g. the wallet holds too little USDC

await ad.setAutoRenew(agentId, false); // stop renewing this domain
await ad.setAutoRenew(agentId, true); // and renew it again
```

`getRenewal()` reports whether renewal is on, how it is paid, the yearly price (USDC atomic
units as a string), the charge window, the wallet's balance and approval, and the first thing
in the way as `issue.code` and a plain `issue.message`. Renewing from the OpenSignet wallet
needs the owner's approval once, given on opensignet.com; until then `setAutoRenew(id, true)`
fails with `RENEWAL_APPROVAL_REQUIRED`. Code can switch renewal on and off within that
approval but never widen what the wallet may pay. See the
[renewal guide](https://docs.opensignet.com/guides/renewal/).

## Authentication model

- Public availability and quote methods need no credential.
- Owner operations use a wallet signature through the supplied `walletClient`.
- Agent-scoped operations can use a narrowly scoped `apiKey`.
- x402 purchases require an authorized Base wallet with sufficient USDC.

The SDK does not persist credentials. Applications remain responsible for
keeping wallet and API-key material out of source, logs, client bundles, and
untrusted process environments.

The SDK handles x402 v2 payment challenges for registration when a
`walletClient` is provided. Email setup, DNS orchestration, and
the OpenSignet Pass are included at no extra cost; Basename and ENS
remain optional paid add-ons.

## Request-bound payment signing

For request-bound x402 checkout the SDK creates one EIP-3009 payment signature using the issued request
binding. Wallet authentication for status or other owner operations is separate
and may still require a signature.

Before signing, the helper validates exact Base-mainnet USDC requirements, a
nonzero recipient, the USDC EIP-712 domain, a positive uint256 amount, a valid
authorization timeout, and the request binding. When `extra.quoteExpiresAt` is
present, it must be an unexpired ISO timestamp and bounds the authorization's
expiry. These checks validate the challenge, not an earlier display quote or an
application-specific spending budget.

The initial registration `402` includes an opaque string at
`accepts[0].extra.registrationQuote` and an ISO `quoteExpiresAt` in the same `extra`
object. The payment payload echoes the full selected requirement as `accepted`,
including all `extra` fields unchanged. Do not decode or reconstruct the sealed
quote, drop metadata, or reprice the challenged request.

After a paid request is submitted, the SDK throws the exported
`RegistrationPaymentRejectedError` only for an HTTP `4xx` response other than
`408` that satisfies the public `registrationPaymentRejectionSchema`, including
`paymentSubmission: { status: 'rejected', settlementAttempted: false }`. The schema
is reusable from `@opensignet/shared`. An error status or message alone does
not establish rejection before settlement.

The error exposes `code: 'REGISTRATION_PAYMENT_REJECTED'`, `serverCode`, `message`,
`handle`, and `settlementAttempted: false`. Inspect the diagnostics and retain the
handle; this only confirms that settlement was not attempted for this rejected
submission. It does not establish payment success or resolve an earlier ambiguous
attempt. HTTP `408`, `5xx`, network failures, timeouts, lost responses, and
unconfirmed conflicts remain `RegistrationPendingError` recovery cases, even if a
`408` or `5xx` body includes a rejection marker. Neither error authorizes an
automatic resend, repricing, or replacement payment signature. See the
[registration API](https://docs.opensignet.com/api-reference/register/).

## Asynchronous registration

Submission, status, waiting, and recovery methods distinguish payment acceptance from
completed registration. HTTP `202` is never a finished `RegistrationResult`; use the SDK
or integrate the documented HTTP status contract directly.

```ts
import {
  OpenSignet,
  RegistrationPaymentRejectedError,
  RegistrationPendingError,
} from '@opensignet/sdk';

const ad = new OpenSignet({ walletClient });
const controller = new AbortController();
try {
  const identity = await ad.register(
    { preferredName: 'research-agent', tld: 'xyz' },
    { timeoutMs: 600_000, signal: controller.signal },
  );
  console.log(identity.agentId);
} catch (error) {
  if (error instanceof RegistrationPaymentRejectedError) {
    console.log(error.code, error.serverCode, error.message, error.handle);
    // Settlement was not attempted for this submission. Do not automatically resend.
  } else if (error instanceof RegistrationPendingError) {
    // Keep this non-secret handle. Timeout or abort does not cancel the purchase.
    console.log(error.reason, error.handle);
  } else {
    throw error;
  }
}
```

`submitRegistration(args, options)` sends `Prefer: respond-async` and returns either
the minimum `RegistrationAccepted` response on `202` or the original
`RegistrationResult` on `200`. `register()` calls it once, then waits on status GETs
after `202`. `waitForRegistration(acceptedOrIdOrHandle, options)` resumes waiting
without submitting any purchase. Completion returns the server-projected
`progress.result`; missing results produce `completion_result_unavailable`, never
invented token IDs, transaction hashes, or metadata fields. Legacy public `200` fields
remain compatible and may still report unfinished provisioning. The SDK validates
required fields and the requested domain, then returns the schema-projected result;
unknown root or nested fields are not echoed to callers.

`getRegistration(id)` and `getRegistrations({ limit, offset })` require the **payer**
wallet, not a different designated owner address. They never send an agent API key or
payment header as authorization. Lists default to 20 entries and accept at most 50.
With a wallet client, they omit cookies and sign every request with a single-use,
request-bound `X-Agent-Signature` (method, URL, body digest and nonce). Signatures are
never cached, so browser apps should prefer `registrationAuth: 'session'`. Rejected
signing and authorization failures stop waiting instead of prompting repeatedly.
Every status/list/recovery read sends `expectedPayer` from the signer, a recovery
handle, or an explicit option. It is an identity consistency check, not authentication.
The SDK rejects a missing or mismatched `X-Authenticated-Wallet` response header
before reading the response body, preventing a different session wallet from being used.
For an already signed-in browser, use `registrationAuth: 'session'` and supply
`registrationExpectedPayer` in the constructor or `expectedPayer` per request when
there is no wallet client. Session requests include cookies and do not request a
read signature. Session-only reads without a known payer fail before fetching.
Sign in and read status on the same API
host. A server-side session integration must provide a cookie-preserving fetch runtime;
Node fetch does not acquire a browser session automatically.

Waiting defaults to ten minutes after acceptance; individual requests and submission
default to sixty seconds. Both support `AbortSignal` and `timeoutMs`. Status polling
honors `pollAfterSeconds` and transient-read `Retry-After` with a five-second minimum. `action_required` and
`awaiting_payment` stop the waiter with `RegistrationPendingError`; `failed` and
`refunded` produce `RegistrationFailedError` containing the server progress. A wait
timeout, abort, or read outage is not a failed-registration assertion.
An HTTP `202` response containing a minimal `action_required` handle immediately
produces `RegistrationPendingError` with that reason; read its status instead of paying again.

On a lost POST response, the SDK raises `RegistrationPendingError` and never retries
the POST or signs a new payment automatically. A known payment identifier is only a
reference, never status authorization. Use `getRegistration()` when an ID is known.
For an unknown ID, `recoverRegistration(error.handle)` performs authenticated list
reads and requires exactly one match for the exact domain and inclusive submission
time interval. Known-ID recovery enforces the same domain, time, and authenticated-payer
binding; knowing an ID does not bypass handle validation. When only an ID is available,
use a payer-authenticated `getRegistration()` read instead of inventing a recovery window.
Discovery scans at most ten pages of 50 entries (500 total) and refuses multiple matches,
incomplete searches, and no-match results. Clock skew can prevent a time match; do not
interpret no match as proof that no payment occurred. Inspect the payer's list or
contact support instead of starting another checkout.

`completed` in the status contract means the identity and all selected services are
ready, not merely that payment succeeded or an agent ID exists. DNS, email, and
selected names can take additional time. Estimates may be `null`; there is no instant
completion guarantee.

## Compatibility

`register(args)` starts authenticated waiting after HTTP `202` instead of returning an
acceptance body as a completed result. Use
`submitRegistration()` for acceptance without waiting for asynchronous provisioning,
and handle the structured errors described above. Legacy HTTP `200` results are validated and
schema-projected, so callers must not rely on unknown response fields.

The connected signer must match the registration payer (`args.wallet`); use
`ownerAddress` for a different designated owner address. Registration does not authorize
with an agent API key. Custom API adapters must support the documented payer-scoped
status contract, including `X-Authenticated-Wallet`. API URL validation applies at
construction, including to clients used only for discovery.

Align/deduplicate viem to the reviewed 2.56.3 version across the SDK and your client
code. This release does not
promise arbitrary mixed-version viem compatibility. Package imports remain ESM-only.

The x402 packages remain aligned at 2.25.0. `createX402PaymentHeaders()` does not
impose the upstream default $1 spending cap. Unbound payments retain the existing
upstream asset-selection behavior; request-bound payments use the Base USDC checks
described above. Neither path independently verifies an earlier display quote or
introduces an application spending budget. Callers must authorize the payment terms.

## Plans

Plans (Free, Plus, Pro, Max and Enterprise) apply to the whole account and are bought or changed by
a person from the dashboard or the [pricing page](https://opensignet.com/pricing), by card or in
USDC on Base. A registration names no plan, and the SDK never buys one. Read what an identity gets
from its account plan:

```ts
const plan = await ad.getServicePlan(agentId);
console.log(plan.entitlement.plan, plan.entitlement.limits.apiKeys);
```

## Agent-scoped API keys

API keys are scoped to one identity and count against the API key limit of the account's plan. Create the key from the owner dashboard or with an owner wallet signature, then pass the full key to the agent runtime.

```ts
const owner = new OpenSignet({ walletClient });
const key = await owner.createApiKey(agentId, 'Production key');

const agent = new OpenSignet({
  apiKey: key.fullKey,
});

await agent.sendEmail(agentId, {
  to: 'admin@example.com',
  fromAddress: 'agent@research-agent.xyz',
  subject: 'Status',
  text: 'Agent online.',
});
```

The full key is returned only once. A scoped key can manage only its own agent ID.

## Professional DNS management

The SDK supports every currently available DNS record type: `A`, `AAAA`,
`ALIAS`, `CAA`, `CNAME`, `HTTPS`, `MX`, `NS`, `PTR`, `SRV`, `SVCB`, `TLSA`, and
`TXT`. Structured record data is preferred; legacy `value` and `priority`
payloads remain compatible.

```ts
const capabilities = await agent.getDnsCapabilities(agentId);
const records = [
  {
    type: 'SRV',
    name: '_https._tcp.api',
    ttl: 300,
    data: { priority: 10, weight: 5, port: 443, target: 'edge.example.com' },
  },
];

const preview = await agent.previewDnsBatch(agentId, records);
await agent.applyDnsBatch(agentId, records, preview.baseRevision);
const zoneFile = await agent.exportDnsZone(agentId);
```

Batch and BIND imports must be previewed first. Apply calls require the
`baseRevision` from that preview, preventing stale changes from overwriting a
newer zone. System-managed email, verification, and routing records remain
read-only and are preserved during replace operations.

## Monthly usage, batch send, and inbound webhooks

All plans combine sent recipients and accepted inbound messages into one monthly
quota. Send up to 100 message objects in one batch request, inspect current
usage, and configure a signed inbound webhook:

```ts
await agent.sendEmailBatch(agentId, {
  messages: [{ to: 'ops@example.com', subject: 'Status', text: 'Agent online.' }],
});

const usage = await agent.getEmailUsage(agentId);
const webhook = await agent.setEmailWebhook(agentId, {
  url: 'https://example.com/webhooks/opensignet',
  payloadMode: 'metadata',
  enabled: true,
});
```

## Email addresses

Every agent gets one editable primary email address. Plus agents can create 5
aliases, Pro agents 10, and Enterprise agents 20.

```ts
const requestId = crypto.randomUUID(); // Persist for this operation, including retries.
const result = await ad.createEmailAlias(agentId, 'billing', { idempotencyKey: requestId });
if ('change' in result) {
  console.log(result.change.requestId, result.change.phase);
} else {
  console.log(result.address.emailAddress);
}
```

Address mutations can be asynchronous. `updatePrimaryEmail`, `createEmailAlias`, and
`deleteEmailAlias` return either the completed legacy result or `{ change }` with a request UUID,
target and phase. Only `completed` confirms the change; `native_applied` and `projected` do not.
Refresh with `ad.listEmail(agentId, { sync: true })` and inspect `addressChange` and `mailStatus`.
An `unchecked` status is not verified readiness. Resolve a pending, uncertain or rejected request
before issuing another change, and refresh active addresses before using a new sender.

All three methods accept optional `{ idempotencyKey }` as their third argument. Reuse the same UUID
for an explicit retry of identical content after a lost response. The SDK does not retry these
mutations automatically. A `cancelled` request is not a completed address change.

## Links

- [TypeScript SDK guide](https://docs.opensignet.com/sdk/typescript)
- [API reference](https://docs.opensignet.com/api-reference/overview)
- [Source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/sdk)
- [Security policy](https://github.com/OpenSignetOrg/opensignet/security/policy)

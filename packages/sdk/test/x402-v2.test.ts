import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import {
  decodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
} from '@x402/core/http';
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { BUILDER_CODE, declareBuilderCodeExtension } from '@x402/extensions/builder-code';
import {
  isHex,
  maxUint256,
  recoverTypedDataAddress,
  type Hex,
  type TypedDataDefinition,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createX402PaymentHeaders } from '../dist/index.js';
import { fake, isRecord, type SdkWalletClient } from './helpers.ts';

const network = 'eip155:8453';
const payer = '0x1111111111111111111111111111111111111111';
const payTo = '0x2222222222222222222222222222222222222222';
const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/** A v2 challenge with at least one offer, so `accepts[0]` is always present. */
interface Challenge extends PaymentRequired {
  accepts: [PaymentRequirements, ...PaymentRequirements[]];
}
/** Typed data as the x402 scheme passes it to the wallet, including the signing account. */
type SignedTypedData = TypedDataDefinition & { account?: { address: string } };

function paymentRequired(amount = '100000'): Challenge {
  return {
    x402Version: 2,
    resource: {
      url: 'https://opensignet.com/api/v1/agents/register',
      description: 'Register an OpenSignet identity',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network,
        asset,
        amount,
        payTo,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',
          version: '2',
          requestBinding: `0x${'ab'.repeat(32)}`,
        },
      },
    ],
  };
}

function challengeResponse(challenge: PaymentRequired, body: unknown = challenge) {
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) },
  });
}

function localWallet(t: TestContext) {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Payment signing must not fetch'));
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const signed: SignedTypedData[] = [];
  const wallet = {
    account,
    signTypedData: async (parameters: SignedTypedData): Promise<Hex> => {
      signed.push(parameters);
      return account.signTypedData(parameters);
    },
  };
  // `walletClient` is the SDK-typed view of the same mutable double.
  return { account, signed, wallet, walletClient: fake<SdkWalletClient>(wallet) };
}

function decodeSigned(headers: Record<string, string>): PaymentPayload {
  const header = headers['PAYMENT-SIGNATURE'];
  assert.ok(header, 'PAYMENT-SIGNATURE header');
  return decodePaymentSignatureHeader(header);
}

function authorizationOf(payload: PaymentPayload): Record<string, unknown> {
  const authorization = payload.payload.authorization;
  assert.ok(isRecord(authorization), 'EIP-3009 authorization');
  return authorization;
}

function signatureOf(payload: PaymentPayload): Hex {
  const signature = payload.payload.signature;
  assert.ok(isHex(signature), 'hex payment signature');
  return signature;
}

function signedAt(signed: SignedTypedData[], index = 0): SignedTypedData {
  const parameters = signed[index];
  assert.ok(parameters, `signed typed data #${index}`);
  return parameters;
}

describe('OpenSignet x402 v2 client', () => {
  it('creates a standard Base mainnet PAYMENT-SIGNATURE header', async () => {
    const challenge = paymentRequired();
    const response = new Response(JSON.stringify(challenge), {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) },
    });
    let signed = 0;
    const walletClient = fake<SdkWalletClient>({
      account: { address: payer },
      signTypedData: async () => {
        signed += 1;
        return `0x${'11'.repeat(65)}`;
      },
    });

    const headers = await createX402PaymentHeaders(response, walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed, 1);
    assert.equal(payload.x402Version, 2);
    assert.equal(payload.accepted.network, network);
    assert.equal(payload.accepted.amount, '100000');
    assert.equal(payload.accepted.payTo, payTo);
    assert.equal(authorizationOf(payload).nonce, `0x${'ab'.repeat(32)}`);
  });

  it('signs an above-$1 exact authorization with request binding and extension echo', async (t) => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('Payment signing must not fetch'));
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const challenge: Challenge = {
      ...paymentRequired('12345678'),
      extensions: {
        [BUILDER_CODE]: declareBuilderCodeExtension('opensignet_test'),
      },
    };
    const response = new Response(JSON.stringify(challenge), {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) },
    });
    const signed: SignedTypedData[] = [];
    const walletClient = fake<SdkWalletClient>({
      account,
      signTypedData: async (parameters: SignedTypedData) => {
        signed.push(parameters);
        return account.signTypedData(parameters);
      },
    });

    const headers = await createX402PaymentHeaders(response, walletClient);
    const payload = decodeSigned(headers);
    const authorization = authorizationOf(payload);
    const requestBinding = challenge.accepts[0].extra.requestBinding;
    assert.ok(isHex(requestBinding));

    assert.equal(payload.x402Version, 2);
    assert.deepEqual(payload.accepted, challenge.accepts[0]);
    assert.deepEqual(payload.resource, challenge.resource);
    assert.deepEqual(payload.extensions, challenge.extensions);
    assert.equal(authorization.from, account.address);
    assert.equal(authorization.to, payTo);
    assert.equal(authorization.value, '12345678');
    assert.equal(authorization.validAfter, '0');
    assert.equal(authorization.nonce, requestBinding);
    assert.equal(signed.length, 1);

    assert.equal(typeof authorization.validBefore, 'string');
    const expectedTypedData = {
      domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: asset },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: account.address,
        to: payTo,
        value: 12345678n,
        validAfter: 0n,
        validBefore: BigInt(String(authorization.validBefore)),
        nonce: requestBinding,
      },
    } as const;
    const last = signed.at(-1);
    assert.ok(last);
    const { account: signingAccount, ...finalTypedData } = last;
    assert.equal(signingAccount?.address, account.address);
    assert.deepEqual(finalTypedData, expectedTypedData);
    assert.equal(
      await recoverTypedDataAddress({
        ...expectedTypedData,
        signature: signatureOf(payload),
      }),
      account.address,
    );
    assert.notEqual(
      await recoverTypedDataAddress({
        ...expectedTypedData,
        message: { ...expectedTypedData.message, nonce: `0x${'cd'.repeat(32)}` },
        signature: signatureOf(payload),
      }),
      account.address,
      'The signature must not validate for a different request binding',
    );
  });

  for (const maxTimeoutSeconds of [1, 120, 300, 900, 86400]) {
    for (const bound of [true, false]) {
      it(`preserves the issued ${maxTimeoutSeconds}s timeout and amount (${bound ? 'bound' : 'unbound'})`, async (t) => {
        const now = 1_800_000_000;
        t.mock.method(Date, 'now', () => now * 1000);
        const { walletClient, signed } = localWallet(t);
        const challenge = paymentRequired('12345678');
        challenge.accepts[0].maxTimeoutSeconds = maxTimeoutSeconds;
        challenge.accepts[0].asset = asset.toLowerCase();
        challenge.accepts[0].extra.assetTransferMethod = 'eip3009';
        if (!bound) delete challenge.accepts[0].extra.requestBinding;

        const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
        const payload = decodeSigned(headers);

        assert.equal(signed.length, 1);
        assert.deepEqual(payload.accepted, challenge.accepts[0]);
        assert.deepEqual(payload.resource, challenge.resource);
        assert.equal(authorizationOf(payload).value, '12345678');
        assert.equal(authorizationOf(payload).validAfter, '0');
        assert.equal(authorizationOf(payload).validBefore, String(now + maxTimeoutSeconds));
        assert.equal(signedAt(signed).message.validBefore, BigInt(now + maxTimeoutSeconds));
      });
    }
  }

  for (const amount of ['1000001', '2500000000', maxUint256.toString()]) {
    it(`signs the exact uint256 amount ${amount} once without an implicit $1 cap`, async (t) => {
      const { walletClient, signed } = localWallet(t);
      const challenge = paymentRequired(amount);
      const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
      const payload = decodeSigned(headers);

      assert.equal(signed.length, 1);
      assert.equal(signedAt(signed).message.value, BigInt(amount));
      assert.equal(authorizationOf(payload).value, amount);
      assert.deepEqual(payload.accepted, challenge.accepts[0]);
    });
  }

  it('preserves unbound non-default asset support and signs a fresh nonce once per call', async (t) => {
    const { walletClient, account, signed } = localWallet(t);
    const challenge = paymentRequired('12345678');
    challenge.accepts[0].asset = '0x3333333333333333333333333333333333333333';
    challenge.accepts[0].extra = { name: 'Example Token', version: '1' };
    const nonces: unknown[] = [];
    for (let i = 0; i < 2; i += 1) {
      const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
      const payload = decodeSigned(headers);
      assert.equal(signed.length, i + 1);
      assert.deepEqual(payload.accepted, challenge.accepts[0]);
      assert.match(String(authorizationOf(payload).nonce), /^0x[a-fA-F0-9]{64}$/);
      assert.equal(authorizationOf(payload).nonce, signedAt(signed, i).message.nonce);
      assert.equal(
        await recoverTypedDataAddress({ ...signedAt(signed, i), signature: signatureOf(payload) }),
        account.address,
      );
      nonces.push(authorizationOf(payload).nonce);
    }
    assert.notEqual(nonces[0], nonces[1]);
  });

  it('keeps unbound Permit2 delegated to the upstream scheme', async (t) => {
    const { walletClient, signed } = localWallet(t);
    const challenge = paymentRequired('12345678');
    delete challenge.accepts[0].extra.requestBinding;
    challenge.accepts[0].extra.assetTransferMethod = 'permit2';
    const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed.length, 1);
    assert.equal(signedAt(signed).primaryType, 'PermitWitnessTransferFrom');
    assert.deepEqual(payload.accepted, challenge.accepts[0]);
    assert.ok(payload.payload.permit2Authorization);
    assert.equal(payload.payload.authorization, undefined);
  });

  it('uses the issued header unchanged when the JSON body advertises different requirements', async (t) => {
    const { walletClient, signed } = localWallet(t);
    const header = paymentRequired('12345678');
    header.accepts[0].maxTimeoutSeconds = 900;
    const body = paymentRequired('99999999');
    body.accepts[0].extra.requestBinding = `0x${'cd'.repeat(32)}`;
    const headers = await createX402PaymentHeaders(challengeResponse(header, body), walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed.length, 1);
    assert.deepEqual(payload.accepted, header.accepts[0]);
    assert.equal(authorizationOf(payload).nonce, header.accepts[0].extra.requestBinding);
    assert.equal(authorizationOf(payload).value, header.accepts[0].amount);
  });

  it('echoes an opaque quote token and arbitrary extra fields unchanged across signing delay', async (t) => {
    let now = 1_800_000_000;
    t.mock.method(Date, 'now', () => now * 1000);
    const { wallet, walletClient, signed } = localWallet(t);
    const signTypedData = wallet.signTypedData;
    wallet.signTypedData = async (parameters) => {
      now += 20;
      return signTypedData(parameters);
    };
    const challenge = paymentRequired('6218032');
    Object.assign(challenge.accepts[0].extra, {
      quoteToken: 'opaque-test-token.with-encrypted-payload',
      registrationQuote: 'opaque-registration-checkout-envelope',
      quoteExpiresAt: new Date((now + 60) * 1000).toISOString(),
      quoteMetadata: { format: 1, fields: ['keep', 'unchanged'], optional: null },
    });
    const issuedRequirement = structuredClone(challenge.accepts[0]);
    const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed.length, 1);
    assert.deepEqual(payload.accepted, issuedRequirement);
    assert.deepEqual(payload.resource, challenge.resource);
    assert.equal(authorizationOf(payload).value, '6218032');
    assert.equal(authorizationOf(payload).nonce, issuedRequirement.extra.requestBinding);
    assert.equal(authorizationOf(payload).validBefore, String(1_800_000_000 + 60));
  });

  for (const quoteLifetime of [10, 300, 900]) {
    it(`caps the sole signature to a ${quoteLifetime}s quote without mutating accepted timeout`, async (t) => {
      const now = 1_800_000_000;
      t.mock.method(Date, 'now', () => now * 1000);
      const { walletClient, account, signed } = localWallet(t);
      const challenge = paymentRequired('6218032');
      challenge.accepts[0].extra.registrationQuote = 'opaque-sealed-quote';
      challenge.accepts[0].extra.quoteExpiresAt = new Date(
        (now + quoteLifetime) * 1000 + 999,
      ).toISOString();
      const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
      const payload = decodeSigned(headers);

      assert.equal(signed.length, 1);
      assert.deepEqual(payload.accepted, challenge.accepts[0]);
      assert.equal(payload.accepted.maxTimeoutSeconds, 300);
      assert.equal(
        authorizationOf(payload).validBefore,
        String(now + Math.min(300, quoteLifetime)),
      );
      assert.equal(
        String(signedAt(signed).message.validBefore),
        authorizationOf(payload).validBefore,
      );
      assert.equal(authorizationOf(payload).nonce, challenge.accepts[0].extra.requestBinding);
      assert.equal(
        await recoverTypedDataAddress({ ...signedAt(signed), signature: signatureOf(payload) }),
        account.address,
      );
    });
  }

  it('does not renew the original quote or sign again when the wallet prompt outlasts expiry', async (t) => {
    let now = 1_800_000_000;
    t.mock.method(Date, 'now', () => now * 1000);
    const { wallet, walletClient, signed } = localWallet(t);
    const sign = wallet.signTypedData;
    wallet.signTypedData = async (parameters) => {
      now += 20;
      return sign(parameters);
    };
    const challenge = paymentRequired('6218032');
    challenge.accepts[0].extra.quoteExpiresAt = new Date((now + 10) * 1000).toISOString();
    const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed.length, 1);
    assert.equal(authorizationOf(payload).validBefore, '1800000010');
    assert.deepEqual(payload.accepted, challenge.accepts[0]);
  });

  it('accepts a valid timezone-offset quote expiry without normalizing the echoed field', async (t) => {
    t.mock.method(Date, 'now', () => Date.parse('2026-09-09T10:00:00.000Z'));
    const { walletClient, signed } = localWallet(t);
    const challenge = paymentRequired('6218032');
    challenge.accepts[0].extra.quoteExpiresAt = '2026-09-09T16:01:00+06:00';
    const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
    const payload = decodeSigned(headers);
    assert.equal(signed.length, 1);
    assert.equal(
      authorizationOf(payload).validBefore,
      String(Date.parse('2026-09-09T10:01:00Z') / 1000),
    );
    assert.deepEqual(payload.accepted, challenge.accepts[0]);
  });

  const expiries: unknown[] = [
    null,
    1800001000000,
    '',
    'not-a-date',
    '2026-09-09',
    '2026-09-09T10:01:00',
    '2026-02-30T10:00:00.000Z',
    '2026-09-09T10:01:00+99:99',
    '2026-09-09T09:59:59.000Z',
    '2026-09-09T10:00:00.000Z',
    '2026-09-09T10:00:00.999Z',
  ];
  for (const expiry of expiries) {
    it(`rejects invalid or elapsed quote expiry ${JSON.stringify(expiry)} before prompting`, async (t) => {
      t.mock.method(Date, 'now', () => Date.parse('2026-09-09T10:00:00.000Z'));
      const { walletClient, signed } = localWallet(t);
      const challenge = paymentRequired('6218032');
      challenge.accepts[0].extra.quoteExpiresAt = expiry;
      await assert.rejects(
        createX402PaymentHeaders(challengeResponse(challenge), walletClient),
        /quote.*expir/i,
      );
      assert.equal(signed.length, 0);
    });
  }

  it('binds the selected supported offer, not the first unsupported offer', async (t) => {
    const { walletClient, signed } = localWallet(t);
    const challenge = paymentRequired('12345678');
    const expected = structuredClone(challenge.accepts[0]);
    const unsupported = paymentRequired('1').accepts[0];
    unsupported.network = 'eip155:1';
    unsupported.extra.requestBinding = 'invalid';
    challenge.accepts.unshift(unsupported);
    const headers = await createX402PaymentHeaders(challengeResponse(challenge), walletClient);
    const payload = decodeSigned(headers);

    assert.equal(signed.length, 1);
    assert.deepEqual(payload.accepted, expected);
    assert.equal(authorizationOf(payload).nonce, expected.extra.requestBinding);
  });

  it('does not fall back to an unbound offer when the selected binding is invalid', async (t) => {
    const { walletClient, signed } = localWallet(t);
    const challenge = paymentRequired('12345678');
    challenge.accepts[0].extra.requestBinding = 'invalid';
    const unbound = paymentRequired('1').accepts[0];
    delete unbound.extra.requestBinding;
    challenge.accepts.push(unbound);

    await assert.rejects(
      createX402PaymentHeaders(challengeResponse(challenge), walletClient),
      /invalid x402 request binding/,
    );
    assert.equal(signed.length, 0);
  });

  type InvalidCase = [field: string, values: unknown[], error: RegExp];
  const invalidFields: InvalidCase[] = [
    [
      'network',
      ['eip155:1', 'eip155:84532', 'base', 'eip155:08453'],
      /No network\/scheme registered/,
    ],
    ['scheme', ['upto', 'EXACT'], /No network\/scheme registered/],
    ['asset', ['bad-address', payTo, undefined, null], /requires the Base USDC asset/],
    [
      'payTo',
      ['bad-address', '0x0000000000000000000000000000000000000000', undefined, null],
      /invalid x402 payTo/,
    ],
    [
      'amount',
      [
        '',
        '0',
        '-1',
        '1.5',
        '1e6',
        '0x10',
        ' 1',
        '1 ',
        'NaN',
        'Infinity',
        100000,
        null,
        undefined,
        (maxUint256 + 1n).toString(),
      ],
      /invalid x402 amount/,
    ],
    [
      'maxTimeoutSeconds',
      [0, -1, 1.5, '300', null, undefined, Number.MAX_SAFE_INTEGER],
      /invalid x402 authorization timeout/,
    ],
  ];
  const invalidExtras: InvalidCase[] = [
    [
      'requestBinding',
      [
        '',
        'ab'.repeat(32),
        `0x${'ab'.repeat(31)}`,
        `0x${'ab'.repeat(33)}`,
        `0x${'gg'.repeat(32)}`,
        1,
        null,
        {},
      ],
      /invalid x402 request binding/,
    ],
    ['name', ['', 'Wrong Token', undefined, 1], /invalid Base USDC EIP-712 domain/],
    ['version', ['', '1', 2, undefined], /invalid Base USDC EIP-712 domain/],
    ['assetTransferMethod', ['permit2', 'unknown', null], /requires an EIP-3009/],
  ];
  const invalidGroups: [fields: InvalidCase[], extra: boolean][] = [
    [invalidFields, false],
    [invalidExtras, true],
  ];
  for (const [fields, extra] of invalidGroups) {
    for (const [field, values, error] of fields) {
      for (const value of values) {
        it(`rejects bound ${extra ? 'extra.' : ''}${field}=${JSON.stringify(value)} before prompting`, async (t) => {
          const { walletClient, signed } = localWallet(t);
          const challenge = paymentRequired('12345678');
          const target: Record<string, unknown> = extra
            ? challenge.accepts[0].extra
            : challenge.accepts[0];
          target[field] = value;
          await assert.rejects(
            createX402PaymentHeaders(challengeResponse(challenge), walletClient),
            error,
          );
          assert.equal(signed.length, 0);
        });
      }
    }
  }

  it('propagates wallet rejection without retrying or signing an unbound fallback', async (t) => {
    const { wallet, walletClient, signed } = localWallet(t);
    const rejected = new Error('User rejected the signature');
    wallet.signTypedData = async (parameters) => {
      signed.push(parameters);
      throw rejected;
    };
    await assert.rejects(
      createX402PaymentHeaders(challengeResponse(paymentRequired()), walletClient),
      (error) => error === rejected,
    );
    assert.equal(signed.length, 1);
    assert.equal(signedAt(signed).message.nonce, paymentRequired().accepts[0].extra.requestBinding);
  });

  for (const unsupportedNetwork of ['eip155:1', 'eip155:84532'] as const) {
    it(`rejects ${unsupportedNetwork} before signing`, async (t) => {
      t.mock.method(globalThis, 'fetch', () => assert.fail('Rejected payments must not fetch'));
      const challenge = paymentRequired('12345678');
      challenge.accepts[0].network = unsupportedNetwork;
      const response = new Response(JSON.stringify(challenge), {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) },
      });
      const walletClient = fake<SdkWalletClient>({
        account: { address: payer },
        signTypedData: async () => assert.fail('Unsupported networks must not be signed'),
      });

      await assert.rejects(
        createX402PaymentHeaders(response, walletClient),
        /No network\/scheme registered/,
      );
    });
  }

  it('rejects a v1 body challenge before signing', async (t) => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('Rejected payments must not fetch'));
    const challenge = {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: 'base',
          asset,
          maxAmountRequired: '12345678',
          payTo,
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
      ],
    };
    const response = new Response(JSON.stringify(challenge), { status: 402 });
    const walletClient = fake<SdkWalletClient>({
      account: { address: payer },
      signTypedData: async () => assert.fail('Version 1 payments must not be signed'),
    });

    await assert.rejects(
      createX402PaymentHeaders(response, walletClient),
      /OpenSignet requires x402 v2; server returned v1\./,
    );
  });

  it('round-trips a base64 PAYMENT-REQUIRED header', () => {
    const challenge = paymentRequired('1');
    const encoded = encodePaymentRequiredHeader(challenge);

    assert.equal(encoded.trim().startsWith('{'), false);
    assert.deepEqual(decodePaymentRequiredHeader(encoded), challenge);
  });

  it('preserves the resource server standard builder-code extension', async () => {
    const challenge: Challenge = {
      ...paymentRequired('1'),
      extensions: {
        [BUILDER_CODE]: declareBuilderCodeExtension('opensignet_test'),
      },
    };
    const response = new Response(JSON.stringify(challenge), {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) },
    });
    const walletClient = fake<SdkWalletClient>({
      account: { address: payer },
      signTypedData: async () => `0x${'11'.repeat(65)}`,
    });

    const headers = await createX402PaymentHeaders(response, walletClient);
    const payload = decodeSigned(headers);

    assert.equal(payload.x402Version, 2);
    const extension = payload.extensions?.[BUILDER_CODE];
    assert.ok(isRecord(extension));
    assert.deepEqual(extension.info, { a: 'opensignet_test' });
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  publicOperations,
  publicSchemas,
  type AuthScope,
  type HttpMethod,
  type PublicOperation,
} from '../scripts/public-api-contract.ts';
import { operationById, pick, pickArray } from './json-path.ts';

// Public wire expectations, independently asserted instead of deriving expected values from the generator.
const expected: [HttpMethod, string, string, string[], AuthScope][] = [
  ['get', '/api/v1', 'discoverApi', ['200'], 'public'],
  ['get', '/api/v1/agents/by-wallet/{wallet}', 'agentsByWallet', ['200'], 'owner'],
  ['get', '/api/v1/agents/{id}', 'getAgent', ['200'], 'agent'],
  ['get', '/api/v1/agents/quote', 'quoteRegistration', ['200'], 'public'],
  ['post', '/api/v1/agents/register', 'registerAgent', ['200', '202'], 'public'],
  ['get', '/api/v1/registrant', 'getRegistrant', ['200'], 'owner'],
  ['put', '/api/v1/registrant', 'saveRegistrant', ['200'], 'owner'],
  ['get', '/api/v1/registrations/{registrationId}', 'getRegistration', ['200'], 'payer'],
  ['get', '/api/v1/registrations', 'listRegistrations', ['200'], 'payer'],
  ['get', '/api/v1/registration-notices', 'listRegistrationNotices', ['200'], 'payer'],
  ['put', '/api/v1/registration-notices', 'recordUnknownSubmissionNotice', ['200'], 'payer'],
  ['post', '/api/v1/registration-notices', 'associateRegistrationNotice', ['200'], 'payer'],
  [
    'delete',
    '/api/v1/registration-notices/{encodedNoticeId}',
    'dismissRegistrationNotice',
    ['204'],
    'payer',
  ],
  ['get', '/api/v1/agents/{id}/dns/capabilities', 'getDnsCapabilities', ['200'], 'agent'],
  ['get', '/api/v1/agents/{id}/dns', 'listDnsRecords', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/dns', 'createDnsRecord', ['201'], 'agent'],
  ['patch', '/api/v1/agents/{id}/dns/{recordId}', 'updateDnsRecord', ['200'], 'agent'],
  ['delete', '/api/v1/agents/{id}/dns/{recordId}', 'deleteDnsRecord', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/dns/batch', 'applyDnsBatch', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/dns/import', 'importDnsZone', ['200'], 'agent'],
  ['get', '/api/v1/agents/{id}/dns/export', 'exportDnsZone', ['200'], 'agent'],
  ['get', '/api/v1/agents/{id}/email', 'listEmail', ['200'], 'agent'],
  ['delete', '/api/v1/agents/{id}/email/{messageId}', 'deleteEmail', ['200'], 'agent'],
  ['patch', '/api/v1/agents/{id}/email', 'replacePrimaryEmail', ['200', '202'], 'agent'],
  ['post', '/api/v1/agents/{id}/email/aliases', 'createEmailAlias', ['200', '201', '202'], 'agent'],
  ['delete', '/api/v1/agents/{id}/email/aliases', 'deleteEmailAlias', ['200', '202'], 'agent'],
  ['post', '/api/v1/agents/{id}/email/send', 'sendEmail', ['201', '202'], 'agent'],
  ['post', '/api/v1/agents/{id}/email/batch', 'sendEmailBatch', ['202'], 'agent'],
  ['get', '/api/v1/agents/{id}/email/usage', 'getEmailUsage', ['200'], 'agent'],
  ['get', '/api/v1/agents/{id}/email/webhook', 'getEmailWebhook', ['200'], 'agent'],
  ['put', '/api/v1/agents/{id}/email/webhook', 'configureEmailWebhook', ['200', '201'], 'agent'],
  [
    'patch',
    '/api/v1/agents/{id}/email/webhook',
    'rotateEmailWebhookSigningValue',
    ['200'],
    'agent',
  ],
  ['get', '/api/v1/agents/{id}/email/blocklist', 'listEmailBlocklist', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/email/blocklist', 'addEmailBlocklistEntry', ['201'], 'agent'],
  [
    'delete',
    '/api/v1/agents/{id}/email/blocklist/{blockId}',
    'deleteEmailBlocklistEntry',
    ['200'],
    'agent',
  ],
  ['get', '/api/v1/agents/{id}/renewal', 'getRenewal', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/domain/auto-renew', 'turnOnAutoRenew', ['200'], 'agent'],
  ['post', '/api/v1/agents/{id}/domain/auto-renew/off', 'turnOffAutoRenew', ['200'], 'agent'],
  ['get', '/api/v1/agents/{id}/plan', 'getServicePlan', ['200'], 'agent'],
];

function assertMatrix(operations: readonly PublicOperation[]): void {
  assert.equal(operations.length, 39);
  for (const [method, path, id, statuses, scope] of expected) {
    const entry = operations.find((entry) => entry.method === method && entry.path === path);
    assert.ok(entry, `${method} ${path}`);
    assert.equal(entry.operation.operationId, id);
    assert.deepEqual(
      Object.keys(entry.operation.responses)
        .filter((code) => /^2\d\d$/.test(code))
        .sort(),
      statuses,
      id,
    );
    assert.equal(entry.operation['x-auth-scope'], scope, id);
    const security =
      scope === 'public'
        ? []
        : scope === 'agent'
          ? [{ AgentApiKey: [] }, { WalletSignature: [] }]
          : [{ WalletSignature: [] }];
    assert.deepEqual(entry.operation.security, security, id);
  }
}

test('all 39 documented HTTP operations have exact reviewed success and authentication contracts', () => {
  assertMatrix(publicOperations());
});

test('asynchronous address acceptance cannot be confused with completed mutation', () => {
  const schemas = publicSchemas();
  const accepted = pick(schemas, 'EmailAddressChangeAcceptedResponse', 'properties', 'change');
  const completed = pick(schemas, 'EmailAddressChangeCompletedResponse', 'properties', 'change');
  assert.equal(pickArray(accepted, 'properties', 'phase', 'enum').includes('completed'), false);
  assert.equal(pickArray(accepted, 'properties', 'phase', 'enum').includes('projected'), true);
  assert.deepEqual(pick(completed, 'properties', 'phase', 'enum'), ['completed']);
  assert.ok(pick(schemas, 'EmailListResponse', 'properties', 'addressChange'));
  assert.ok(pick(schemas, 'EmailListResponse', 'properties', 'mailStatus'));
  for (const name of ['replacePrimaryEmail', 'createEmailAlias', 'deleteEmailAlias']) {
    const operation = operationById(publicOperations(), name);
    assert.ok(
      operation.parameters?.some(
        (value) =>
          value.in === 'header' &&
          value.name === 'Idempotency-Key' &&
          value.schema['format'] === 'uuid',
      ),
    );
  }
});

test('the regression matrix rejects the former universal 200 and public-wallet assumptions', () => {
  const statuses = structuredClone(publicOperations());
  const send = operationById(statuses, 'sendEmail');
  const created = send.responses['201'];
  assert.ok(created);
  send.responses['200'] = created;
  delete send.responses['201'];
  assert.throws(() => assertMatrix(statuses), /sendEmail/);
  const scope = structuredClone(publicOperations());
  operationById(scope, 'agentsByWallet').security = [{}];
  assert.throws(() => assertMatrix(scope), /agentsByWallet/);
});

test('empty 204 and text/dns success responses are not passed to a JSON error decoder', () => {
  const operations = publicOperations();
  const dismiss = operationById(operations, 'dismissRegistrationNotice');
  assert.equal(pick(dismiss.responses, '204', 'content'), undefined);
  assert.ok(pick(dismiss.responses, '204', 'headers', 'X-Authenticated-Wallet'));
  const dns = operationById(operations, 'exportDnsZone');
  const dnsContent = dns.responses['200']?.content;
  assert.ok(dnsContent);
  assert.deepEqual(Object.keys(dnsContent), ['text/dns']);
  for (const { operation } of operations) {
    assert.equal(operation.responses['default'], undefined);
    assert.equal(
      pick(operation.responses, '2XX', 'content', 'application/json', 'schema', '$ref'),
      '#/components/schemas/DocumentedJson',
    );
    assert.equal(
      pick(operation.responses, '4XX', 'content', 'application/json', 'schema', '$ref'),
      '#/components/schemas/PublicError',
    );
    assert.equal(
      pick(operation.responses, '5XX', 'content', 'application/json', 'schema', '$ref'),
      '#/components/schemas/PublicError',
    );
  }
});

test('normal and partially accepted email envelopes keep their different required fields', () => {
  const schemas = publicSchemas();
  assert.deepEqual(pick(schemas, 'EmailQueuedResponse', 'required'), ['id', 'status', 'messages']);
  assert.deepEqual(pick(schemas, 'EmailPartialResponse', 'required'), [
    'id',
    'status',
    'code',
    'messages',
    'usage',
  ]);
  assert.deepEqual(pick(schemas, 'EmailBatchQueuedResponse', 'required'), [
    'batchId',
    'status',
    'jobs',
    'errors',
  ]);
  assert.deepEqual(pick(schemas, 'EmailBatchPartialResponse', 'required'), [
    'code',
    'message',
    'jobs',
    'usage',
  ]);
  const partialRequired = pickArray(schemas, 'EmailBatchPartialResponse', 'required');
  assert.equal(partialRequired.includes('batchId'), false);
  assert.equal(partialRequired.includes('status'), false);
  assert.equal(partialRequired.includes('errors'), false);
  assert.deepEqual(pick(schemas, 'EmailBatchResponse', 'anyOf'), [
    { $ref: '#/components/schemas/EmailBatchQueuedResponse' },
    { $ref: '#/components/schemas/EmailBatchPartialResponse' },
  ]);
});

test('webhook creation and rotation require sensitive signing output while reads and updates do not', () => {
  const schemas = publicSchemas();
  assert.deepEqual(pick(schemas, 'WebhookCreatedResponse', 'required'), [
    'webhook',
    'signingSecret',
  ]);
  assert.equal(
    pick(schemas, 'WebhookCreatedResponse', 'properties', 'signingSecret', 'x-sensitive'),
    true,
  );
  assert.deepEqual(pick(schemas, 'WebhookUpdatedResponse', 'required'), ['webhook']);
  assert.equal(pick(schemas, 'WebhookReadResponse', 'properties', 'webhook', 'nullable'), true);
  const operations = publicOperations();
  const configure = operationById(operations, 'configureEmailWebhook').responses;
  assert.equal(
    pick(configure, '200', 'content', 'application/json', 'schema', '$ref'),
    '#/components/schemas/WebhookUpdatedResponse',
  );
  assert.equal(
    pick(configure, '201', 'content', 'application/json', 'schema', '$ref'),
    '#/components/schemas/WebhookCreatedResponse',
  );
});

test('code-only and legacy error envelopes remain valid public shapes with optional messages', () => {
  const schema = publicSchemas()['PublicError'];
  assert.equal(pick(schema, 'required'), undefined);
  assert.deepEqual(pick(schema, 'anyOf'), [{ required: ['code'] }, { required: ['error'] }]);
  assert.ok(pick(schema, 'properties', 'code'));
  assert.ok(pick(schema, 'properties', 'error'));
  assert.ok(pick(schema, 'properties', 'message'));
});

test('quote defaults and recovery handles do not invent required fields or exclude refunded status', () => {
  const quote = operationById(publicOperations(), 'quoteRegistration');
  const parameters = quote.parameters;
  assert.ok(parameters);
  assert.deepEqual(
    parameters.filter((item) => item.required).map((item) => item.name),
    ['preferredName'],
  );
  assert.equal(
    pick(
      parameters.find((item) => item.name === 'tld'),
      'schema',
      'default',
    ),
    'xyz',
  );
  const schema = publicSchemas()['RegistrationHandleResponse'];
  assert.ok(pickArray(schema, 'properties', 'status', 'enum').includes('refunded'));
  assert.deepEqual(pick(schema, 'required'), ['registrationId', 'status']);
});

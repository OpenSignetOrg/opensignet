import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDomainEntry } from '../../src/lib/domain-entry';

test('a typed full domain selects its ending instead of doubling it', () => {
  assert.deepEqual(parseDomainEntry('myagent.com'), { label: 'myagent', tld: 'com' });
  assert.deepEqual(parseDomainEntry('myagent.xyz'), { label: 'myagent', tld: 'xyz' });
  assert.deepEqual(parseDomainEntry('MyAgent.AI'), { label: 'myagent', tld: 'ai' });
});

test('a bare name keeps the selected ending', () => {
  assert.deepEqual(parseDomainEntry('myagent'), { label: 'myagent', tld: null });
  assert.deepEqual(parseDomainEntry('my-agent-2'), { label: 'my-agent-2', tld: null });
  assert.deepEqual(parseDomainEntry('myagent.'), { label: 'myagent', tld: null });
  assert.deepEqual(parseDomainEntry(''), { label: '', tld: null });
});

test('pasted URLs, www and subdomains resolve to the registrable name', () => {
  assert.deepEqual(parseDomainEntry('https://www.myagent.com/path?x=1'), {
    label: 'myagent',
    tld: 'com',
  });
  assert.deepEqual(parseDomainEntry('http://myagent.io#top'), { label: 'myagent', tld: 'io' });
  assert.deepEqual(parseDomainEntry('mail.myagent.org'), { label: 'myagent', tld: 'org' });
  assert.deepEqual(parseDomainEntry('  myagent.net  '), { label: 'myagent', tld: 'net' });
});

test('unsupported characters are removed from the label and ending', () => {
  assert.deepEqual(parseDomainEntry('my_agent!.com'), { label: 'myagent', tld: 'com' });
  assert.deepEqual(parseDomainEntry('myagent.de'), { label: 'myagent', tld: 'de' });
});

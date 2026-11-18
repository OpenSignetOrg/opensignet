import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import {
  SITE_SEARCH_QUERY_MAX,
  SITE_SEARCH_RESULT_LIMIT,
  highlightParts,
  isSafeSearchHref,
  parseSiteSearchIndex,
  prepareSiteSearch,
  searchSite,
  searchTokens,
  type SiteSearchEntry,
} from '../../src/lib/site-search';
import { buildSiteSearchIndex, nodeText } from '../../src/lib/site-search-index';
import { STATIC_INDEXABLE_ROUTES } from '../../src/lib/seo';

const index = buildSiteSearchIndex();
const prepared = prepareSiteSearch(index);
const titles = (query: string) => searchSite(prepared, query).map((result) => result.entry.title);

test('every public page is in the search index', () => {
  const paths = new Set(index.map((entry) => entry.href.split('#')[0]));
  for (const route of STATIC_INDEXABLE_ROUTES) assert.ok(paths.has(route), `missing ${route}`);
  assert.ok(index.some((entry) => entry.href === 'https://docs.opensignet.com'));
});

test('every entry is safe, unique and readable', () => {
  const ids = new Set<string>();
  for (const entry of index) {
    assert.ok(isSafeSearchHref(entry.href), entry.href);
    assert.ok(!ids.has(entry.id), `duplicate ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.title.length > 0 && entry.summary.length > 0, entry.id);
    assert.doesNotMatch(entry.summary, /\[object Object\]|undefined/);
  }
  assert.deepEqual(parseSiteSearchIndex({ entries: index }), index);
});

test('FAQ answers are indexed as plain text with a link that opens the question', () => {
  const refunds = index.find((entry) => entry.title === 'Are payments refundable?');
  assert.ok(refunds);
  assert.equal(refunds.href, '/pricing#pricing-faq-are-payments-refundable');
  assert.match(refunds.summary, /See the Terms of Service\.$/);
});

test('plans, features and questions are found by name, keyword and typo', () => {
  assert.equal(titles('max')[0], 'Max plan');
  assert.deepEqual(titles('plan').slice(0, 5), [
    'Free plan',
    'Plus plan',
    'Pro plan',
    'Max plan',
    'Enterprise plan',
  ]);
  assert.equal(titles('register')[0], 'Register a domain');
  assert.equal(titles('pricing')[0], 'Pricing');
  assert.equal(titles('dashboard')[0], 'Dashboard');
  assert.equal(titles('enterprise')[0], 'Enterprise plan');
  assert.ok(titles('free').includes('Free plan'));
  assert.ok(titles('refund').includes('Are payments refundable?'));
  assert.ok(titles('basename').includes('Basename and ENS names'));
  assert.ok(titles('renwal').some((title) => /renew/i.test(title)));
  assert.ok(titles('contact').includes('Email support'));
  assert.ok(titles('charged').includes('When am I charged?'));
  const signIn = index.find((entry) => entry.title === 'Do I need to sign in to search?');
  assert.equal(signIn?.href, '/register#register-faq-do-i-need-to-sign-in-to-search');
  assert.deepEqual(titles('zzzz qqqq'), []);
});

test('queries are bounded and results are capped', () => {
  assert.ok(searchTokens('a'.repeat(500)).join('').length <= SITE_SEARCH_QUERY_MAX);
  assert.ok(searchSite(prepared, 'the').length <= SITE_SEARCH_RESULT_LIMIT);
  assert.deepEqual(searchTokens('  Pro   PLAN pro '), ['pro', 'plan']);
});

test('highlighting returns text parts only and matches at word starts', () => {
  assert.deepEqual(highlightParts('Max plan', 'max'), [
    { text: 'Max', match: true },
    { text: ' plan', match: false },
  ]);
  assert.deepEqual(highlightParts('Climax', 'max'), [{ text: 'Climax', match: false }]);
  assert.deepEqual(highlightParts('a <b>tag</b>', 'tag'), [
    { text: 'a <b>', match: false },
    { text: 'tag', match: true },
    { text: '</b>', match: false },
  ]);
});

test('a downloaded index with unsafe links or bad shapes is filtered', () => {
  const good: SiteSearchEntry = {
    id: 'page:/x',
    kind: 'page',
    title: 'X',
    context: 'X',
    summary: 'X',
    href: '/x',
  };
  const parsed = parseSiteSearchIndex({
    entries: [
      good,
      { ...good, id: 'a', href: 'javascript:alert(1)' },
      { ...good, id: 'b', href: '//evil.example' },
      { ...good, id: 'c', href: 'https://evil.example' },
      { ...good, id: 'd', kind: 'script' },
      { id: 'e' },
      null,
    ],
  });
  assert.deepEqual(parsed, [good]);
  assert.deepEqual(parseSiteSearchIndex('nope'), []);
});

test('nodeText reads nested React content', () => {
  assert.equal(
    nodeText(['See the ', createElement('a', { href: '/terms' }, 'Terms', ' of Service'), '.']),
    'See the Terms of Service.',
  );
  assert.equal(nodeText(42), '42');
});

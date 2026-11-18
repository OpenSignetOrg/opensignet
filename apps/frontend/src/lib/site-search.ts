/**
 * Site search for the public website (the documentation has its own search). The index is static
 * public content built at deploy time; queries are matched in the browser and never leave it.
 */

export type SiteSearchKind = 'page' | 'section' | 'question';

export interface SiteSearchEntry {
  id: string;
  kind: SiteSearchKind;
  title: string;
  /** Where the entry lives, for example "Pricing" or "Support · Questions". */
  context: string;
  /** One or two sentences shown under the title. */
  summary: string;
  /** Extra words people may search for that the visible text does not contain. */
  keywords?: string;
  /** Longer text that is searched but not shown. */
  body?: string;
  /**
   * Importance from 0 to 10: the main pages people come for rank above deep sections when the match
   * is equally good. Entries of equal score keep the index order (for example the plan order).
   */
  rank?: number;
  href: string;
}

export interface SiteSearchResult {
  entry: SiteSearchEntry;
  score: number;
  /** Summary or matching passage of the body, ready to display. */
  snippet: string;
}

/** Longest query that is searched; longer input is cut, never sent anywhere. */
export const SITE_SEARCH_QUERY_MAX = 64;
/** Most results shown per kind, and in total. */
export const SITE_SEARCH_GROUP_LIMIT = 5;
export const SITE_SEARCH_RESULT_LIMIT = 12;
/** Upper bound accepted from the static index file. */
export const SITE_SEARCH_INDEX_MAX_ENTRIES = 600;

export const DOCS_ORIGIN = 'https://docs.opensignet.com';

/** Only same-site paths and the documentation site are allowed as result links. */
export function isSafeSearchHref(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return true;
  return href === DOCS_ORIGIN || href.startsWith(`${DOCS_ORIGIN}/`);
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query.slice(0, SITE_SEARCH_QUERY_MAX));
  return normalized ? [...new Set(normalized.split(' '))].slice(0, 8) : [];
}

interface PreparedField {
  text: string;
  words: string[];
}

interface PreparedEntry {
  entry: SiteSearchEntry;
  order: number;
  title: PreparedField;
  keywords: PreparedField;
  context: PreparedField;
  summary: PreparedField;
  body: PreparedField;
}

function prepareField(value: string | undefined): PreparedField {
  const text = normalizeSearchText(value ?? '');
  return { text, words: text ? text.split(' ') : [] };
}

export interface PreparedSiteSearch {
  entries: PreparedEntry[];
}

export function prepareSiteSearch(entries: readonly SiteSearchEntry[]): PreparedSiteSearch {
  return {
    entries: entries.map((entry, order) => ({
      entry,
      order,
      title: prepareField(entry.title),
      keywords: prepareField(entry.keywords),
      context: prepareField(entry.context),
      summary: prepareField(entry.summary),
      body: prepareField(entry.body),
    })),
  };
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Weights: exact word, word prefix, inside a word, one typo away. */
type Weights = readonly [number, number, number, number];

function fieldScore(field: PreparedField, token: string, weights: Weights): number {
  // Light stemming: "price" also reaches "pricing", "renews" reaches "renewal".
  const stem = token.length >= 5 && /[aeisy]$/.test(token) ? token.slice(0, -1) : null;
  let best = 0;
  for (const word of field.words) {
    if (word === token) return weights[0];
    if (word.startsWith(token) && (token.length >= 2 || word.length <= 3)) {
      best = Math.max(best, weights[1]);
    } else if (stem && word.startsWith(stem)) {
      best = Math.max(best, weights[1] - 1);
    } else if (token.length >= 3 && word.includes(token)) {
      best = Math.max(best, weights[2]);
    } else if (token.length >= 4 && word.length >= 4 && withinOneEdit(word, token)) {
      best = Math.max(best, weights[3]);
    }
  }
  return best;
}

const KIND_BONUS: Record<SiteSearchKind, number> = { page: 3, section: 1, question: 0 };
/** Most an entry's importance can add, so a clearly better text match always wins. */
const RANK_WEIGHT = 0.8;

/** Ranks entries for a query. Every query word must match somewhere in an entry. */
export function searchSite(prepared: PreparedSiteSearch, query: string): SiteSearchResult[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(' ');
  const scored: Array<SiteSearchResult & { order: number }> = [];
  for (const item of prepared.entries) {
    let score = 0;
    let matchedAll = true;
    let titleHits = 0;
    for (const token of tokens) {
      const titleScore = fieldScore(item.title, token, [14, 10, 5, 6]);
      if (titleScore > 0) titleHits += 1;
      const tokenScore = Math.max(
        titleScore,
        fieldScore(item.keywords, token, [10, 7, 4, 4]),
        fieldScore(item.context, token, [5, 4, 2, 0]),
        fieldScore(item.summary, token, [4, 3, 1, 1]),
        fieldScore(item.body, token, [3, 2, 1, 0]),
      );
      if (tokenScore === 0) {
        matchedAll = false;
        break;
      }
      score += tokenScore;
    }
    if (!matchedAll) continue;
    if (item.title.text === phrase) score += 30;
    else if (item.title.text.startsWith(phrase)) score += 18;
    else if (tokens.length > 1 && item.title.text.includes(phrase)) score += 10;
    // Every query word in the title, and a short title, mean the entry is about exactly this.
    if (titleHits === tokens.length) {
      score += 6 + Math.max(0, 6 - (item.title.words.length - tokens.length));
    }
    score += KIND_BONUS[item.entry.kind];
    score += Math.min(10, Math.max(0, item.entry.rank ?? 0)) * RANK_WEIGHT;
    scored.push({
      entry: item.entry,
      score,
      snippet: buildSnippet(item.entry, tokens),
      order: item.order,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  const perKind: Record<SiteSearchKind, number> = { page: 0, section: 0, question: 0 };
  const results: SiteSearchResult[] = [];
  for (const { entry, score, snippet } of scored) {
    if (perKind[entry.kind] >= SITE_SEARCH_GROUP_LIMIT) continue;
    perKind[entry.kind] += 1;
    results.push({ entry, score, snippet });
    if (results.length >= SITE_SEARCH_RESULT_LIMIT) break;
  }
  return results;
}

const SNIPPET_LENGTH = 150;

/** The summary, or the passage of the body around the first query word when only the body matches. */
function buildSnippet(entry: SiteSearchEntry, tokens: readonly string[]): string {
  const summaryText = normalizeSearchText(entry.summary);
  if (!entry.body || tokens.some((token) => summaryText.includes(token))) {
    return clip(entry.summary, SNIPPET_LENGTH);
  }
  const lower = entry.body.toLowerCase();
  const at = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined) return clip(entry.summary, SNIPPET_LENGTH);
  const start = Math.max(0, lower.lastIndexOf(' ', Math.max(0, at - 40)) + 1);
  const passage = entry.body.slice(start);
  return `${start > 0 ? '…' : ''}${clip(passage, SNIPPET_LENGTH)}`;
}

function clip(value: string, length: number): string {
  if (value.length <= length) return value;
  const cut = value.lastIndexOf(' ', length);
  return `${value.slice(0, cut > length * 0.6 ? cut : length).trimEnd()}…`;
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Splits text into plain and matching parts at word starts, for safe rendering as text nodes. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const tokens = searchTokens(query).filter((token) => token.length >= 2 || /^\d$/.test(token));
  if (tokens.length === 0) return [{ text, match: false }];
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${tokens
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')})`,
    'giu',
  );
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), match: false });
    parts.push({ text: match[0], match: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Validates the downloaded index and drops anything malformed or with an unsafe link. */
export function parseSiteSearchIndex(value: unknown): SiteSearchEntry[] {
  if (!value || typeof value !== 'object') return [];
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  const kinds = new Set<SiteSearchKind>(['page', 'section', 'question']);
  const valid: SiteSearchEntry[] = [];
  for (const raw of entries.slice(0, SITE_SEARCH_INDEX_MAX_ENTRIES)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (
      !isString(item.id) ||
      !isString(item.title) ||
      !isString(item.context) ||
      !isString(item.summary) ||
      !isString(item.href) ||
      !kinds.has(item.kind as SiteSearchKind) ||
      !isSafeSearchHref(item.href)
    ) {
      continue;
    }
    valid.push({
      id: item.id,
      kind: item.kind as SiteSearchKind,
      title: item.title,
      context: item.context,
      summary: item.summary,
      ...(isString(item.keywords) ? { keywords: item.keywords } : {}),
      ...(isString(item.body) ? { body: item.body } : {}),
      ...(typeof item.rank === 'number' && Number.isFinite(item.rank)
        ? { rank: Math.min(10, Math.max(0, item.rank)) }
        : {}),
      href: item.href,
    });
  }
  return valid;
}

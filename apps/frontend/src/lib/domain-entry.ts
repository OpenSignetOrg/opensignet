/**
 * Splits what someone typed or pasted into a name label and an optional ending:
 * "myagent.com", "https://www.myagent.com/path" and "sub.myagent.com" all give
 * { label: "myagent", tld: "com" }; "myagent" gives { label: "myagent", tld: null }.
 */
export function parseDomainEntry(raw: string): { label: string; tld: string | null } {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  const clean = (value: string) => value.replace(/[^a-z0-9-]/g, '');
  if (parts.length < 2) return { label: clean(parts[0] ?? ''), tld: null };
  return { label: clean(parts[parts.length - 2] ?? ''), tld: clean(parts[parts.length - 1] ?? '') };
}

/** Stable anchor for one FAQ question, so search results and shared links can open it directly. */
export function faqItemId(sectionId: string, question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return `${sectionId}-${slug}`;
}

// Page numbers here are one-based, like the page-picker labels and saved choices.
export function togglePageRange(excluded, anchor, page, shift) {
  const next = new Set(excluded), exclude = !next.has(page);
  const from = shift && anchor !== null ? anchor : page;
  for (let i = Math.min(from, page); i <= Math.max(from, page); i++) {
    if (exclude) next.add(i);
    else next.delete(i);
  }
  return next;
}

export function firstPageTitles(bookmarks, count) {
  const titles = Array(count).fill("");
  for (const { page, title } of bookmarks) {
    if (Number.isInteger(page) && page >= 1 && page <= count && !titles[page - 1])
      titles[page - 1] = title;
  }
  return titles;
}

export async function readPageTitles(doc) {
  const bookmarks = [];
  async function walk(items) {
    for (const item of items || []) {
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      if (Array.isArray(dest) && dest.length) {
        const index = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
        bookmarks.push({ page: index + 1, title: item.title });
      }
      await walk(item.items);
    }
  }
  await walk(await doc.getOutline());
  return firstPageTitles(bookmarks, doc.numPages);
}

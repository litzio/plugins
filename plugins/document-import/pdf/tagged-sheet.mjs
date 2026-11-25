export async function taggedMembership(page) {
  const tree = await page.getStructTree();
  if (!tree) return null;
  const ids = new Map(),
    rows = {};
  let next = 0;
  function visit(node, parent) {
    const tag = { ...parent };
    if (node.role === "Table")
      Object.assign(tag, { table: ++next, row: null, cell: null });
    if (node.role === "TR") {
      tag.row = ++next;
      (rows[tag.table] ||= []).push([]);
    }
    if (["TH", "TD"].includes(node.role)) {
      tag.cell = ++next;
      rows[tag.table]?.at(-1)?.push(tag.cell);
    }
    if (node.role === "P") tag.paragraph = ++next;
    if (node.type === "content") ids.set(node.id, tag);
    for (const child of node.children || []) visit(child, tag);
  }
  visit(tree, {});
  const content = await page.getTextContent({ includeMarkedContent: true });
  const stack = [],
    owners = [];
  let linked = 0,
    total = 0;
  for (const [index, it] of content.items.entries()) {
    if (it.type?.startsWith("beginMarkedContent"))
      stack.push(ids.get(it.id) ?? stack.at(-1));
    if (it.type === "endMarkedContent") stack.pop();
    if (it.str === undefined) continue;
    const tag = stack.at(-1),
      count = it.str.replace(/\s/g, "").length;
    total += count;
    if (tag?.paragraph || tag?.cell) linked += count;
    owners[index] = tag;
  }
  return total && linked >= total * 0.95 ? { content, owners, rows } : null;
}

// Invocation-local indexes. Preserve Array.find's first-match semantics, including duplicate paths.
export function firstBy(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!result.has(k)) result.set(k, row);
  }
  return result;
}
export function snapshotLookup(snapshot, { strict = false } = {}) {
  // Serialized SDK paths are numeric arrays; retain deep-equality distinctions such as -0.
  const key = strict
    ? (path) =>
        JSON.stringify(
          Array.isArray(path)
            ? path.map((v) => [
                typeof v,
                typeof v === "number" && Object.is(v, -0) ? "-0" : v,
              ])
            : path,
        )
    : JSON.stringify;
  const nodes = firstBy(snapshot.nodes, (n) => key(n.path));
  const typed = firstBy(snapshot.nodes, (n) => n.type + ":" + key(n.path));
  const captions = firstBy(
    snapshot.nodes.filter((n) => n.type === "caption"),
    (n) => n.path[0],
  );
  return {
    node: (path, type) =>
      type === undefined
        ? nodes.get(key(path))
        : typed.get(type + ":" + key(path)),
    caption: (block) => captions.get(block),
  };
}
export function tokenLookup(evidence) {
  const byId = new Map();
  let order = 0;
  for (const page of evidence.pages)
    for (const token of page.tokens) {
      if (!byId.has(token.id)) byId.set(token.id, []);
      byId.get(token.id).push({ token, order: order++ });
    }
  // Existing comparisons use PDF inventory order, never the order of submitted IDs.
  return (ids) =>
    [...new Set(ids)]
      .flatMap((id) => byId.get(id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.token);
}

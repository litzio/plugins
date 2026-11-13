export function markerFormat(n, alphabeticContext = false) {
  if (!n.enumerated) return { ordered: false };
  const m = /^(\d+|[A-Za-z])([.)])?$/.exec(n.marker ?? "");
  if (!m) return null;
  // A single i/v/x could be Roman or alphabetical; do not guess.
  if (!alphabeticContext && /^[ivxlcdm]$/i.test(m[1])) return null;
  const numeric = /^\d+$/.test(m[1]);
  return {
    ordered: true,
    start: numeric ? Number(m[1]) : m[1].toLowerCase().charCodeAt(0) - 96,
    ...(!numeric
      ? { style: m[1] === m[1].toLowerCase() ? "lower-alpha" : "upper-alpha" }
      : {}),
    ...(m[2] === ")" ? { delimiter: ")" } : {}),
  };
}
export function projectList(ref, nodes, content) {
  const mappings = [],
    containers = [];
  function build(groupRef, indices = []) {
    const group = nodes.get(groupRef);
    containers.push(groupRef);
    const items = [],
      sources = [];
    for (const child of group.children ?? []) {
      const n = nodes.get(child.$ref);
      if (n.label === "list_item") {
        const path = [...indices, items.length];
        const item = { content: content(n) };
        mappings.push({ ref: child.$ref, indexPath: path });
        for (const nested of n.children ?? []) {
          if (!nodes.get(nested.$ref)?.label?.includes("list") || item.list)
            throw new Error("list-unrepresentable-structure");
          item.list = build(nested.$ref, path);
        }
        items.push(item);
        sources.push(n);
      } else if (
        n.label?.includes("list") &&
        items.length &&
        !items.at(-1).list
      ) {
        items.at(-1).list = build(child.$ref, [...indices, items.length - 1]);
      } else throw new Error("list-unrepresentable-structure");
    }
    if (!items.length) throw new Error("list-unrepresentable-structure");
    const alphabeticContext = sources.some(
      (s) =>
        s.enumerated &&
        /^[a-z][.)]?$/i.test(s.marker ?? "") &&
        !/^[ivxlcdm][.)]?$/i.test(s.marker),
    );
    const formats = sources.map((s) => markerFormat(s, alphabeticContext)),
      first = formats[0];
    if (
      !first ||
      formats.some(
        (f, i) =>
          !f ||
          f.ordered !== first.ordered ||
          f.style !== first.style ||
          f.delimiter !== first.delimiter ||
          (first.ordered && f.start !== first.start + i),
      )
    )
      throw new Error("list-ambiguous-marker");
    if (items.length > 100) throw new Error("list-count-limit");
    return { ...first, items };
  }
  const list = build(ref);
  return { list, mappings, containers };
}

// A small reader for the well-formed XML parts of a .docx file. Elements are
// {name, attrs, children}; text is a string child. Names keep their prefix (w:p).
const entities = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = s => s.indexOf("&") < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : entities[e] ?? m);

export function parseXml(text) {
  const root = { name: "#root", attrs: {}, children: [] }, stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s>/]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = token.exec(text))) {
    const top = stack.at(-1);
    if (m[6] !== undefined) top.children.push(decode(m[6]));
    else if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[3]) {
      if (m[2]) { stack.pop(); continue; }
      const attrs = {};
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const node = { name: m[3], attrs, children: [] };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    }
  }
  return root.children.find(c => typeof c === "object") ?? root;
}

export const kids = (node, name) => (node?.children || []).filter(c => typeof c === "object" && (!name || c.name === name));
export const kid = (node, name) => (node?.children || []).find(c => typeof c === "object" && c.name === name) || null;
export const val = (node, name, attr = "w:val") => kid(node, name)?.attrs[attr];
export function* walk(node) {
  for (const c of node.children) if (typeof c === "object") { yield c; yield* walk(c); }
}

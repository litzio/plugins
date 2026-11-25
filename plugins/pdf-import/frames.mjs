const quantize = (n) => Math.round(n * 2);
const key = (box, width, height) =>
  [width, height, ...box].map(quantize).join(",");
const ruleBox = (r) =>
  r.axis === "h" ? [r.a, r.pos, r.b, r.pos] : [r.pos, r.a, r.pos, r.b];

export function removeFrames(pages) {
  if (pages.length < 3) return;
  const repeats = new Map();
  for (const p of pages) {
    const keys = new Set();
    for (const { box } of [...p.shapes, ...p.images.map((box) => ({ box }))]) {
      const [l, t, r, b] = box;
      if (
        t >= p.height * 0.9 ||
        (r - l > p.width * 0.7 && b < p.height * 0.1) ||
        (b - t > p.height * 0.8 && r - l < 2)
      )
        keys.add(key(box, p.width, p.height));
    }
    for (const k of keys) repeats.set(k, (repeats.get(k) || 0) + 1);
  }
  for (const p of pages) {
    const repeated = (b) =>
      repeats.get(key(b, p.width, p.height)) >= 0.8 * pages.length;
    // Require both outer sides and a bottom title strip before touching geometry.
    const sides = p.shapes.filter(
      ({ box: b }) => repeated(b) && b[3] - b[1] > 0.8 * p.height,
    );
    const bottoms = p.shapes.filter(
      ({ box: b }) =>
        repeated(b) && b[1] >= 0.9 * p.height && b[2] - b[0] > 0.5 * p.width,
    );
    if (
      !bottoms.length ||
      !sides.some(({ box: b }) => b[0] < p.width * 0.15) ||
      !sides.some(({ box: b }) => b[0] > p.width * 0.85)
    )
      continue;
    p.footerTop = Math.min(...bottoms.map((s) => s.box[1]));
    const removedRules = new Set(
      p.shapes.filter((s) => repeated(s.box)).flatMap((s) => s.rules || []),
    );
    p.shapes = p.shapes.filter((s) => !repeated(s.box));
    p.images = p.images.filter((b) => !repeated(b));
    p.rulings = p.rulings.filter(
      (r) => !removedRules.has(r) && !repeated(ruleBox(r)),
    );
    p.graphics = p.graphics.filter((g) => !repeated(g.box));
  }
}

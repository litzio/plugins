const pattern =
  /\d+(?:[.,]\d+)*(?:[eE][+-]?\d+)?|[≤≥<>±−+=%]|(?<![\p{L}])(?:MHz|kHz|Hz|kV|mV|mA|kW|ms|μs|µs|ns|cycles|V|A|W|s|u)(?![\p{L}])|(?<![\p{L}])-(?=\s*\d)/gu;
export function protectedTokens(text) {
  return [...(text ?? "").matchAll(pattern)].map((m) => ({
    value: m[0],
    kind: /^\d/.test(m[0])
      ? "number"
      : /^[≤≥<>±−+=-]$/.test(m[0])
        ? "operator"
        : "unit",
    start: m.index,
    end: m.index + m[0].length,
  }));
}
export function difference(expected, actual) {
  const remaining = actual.map((t) => t.value ?? t),
    missing = [];
  for (const t of expected) {
    const v = t.value ?? t,
      i = remaining.indexOf(v);
    if (i < 0) missing.push(v);
    else remaining.splice(i, 1);
  }
  return { missing, extra: remaining };
}

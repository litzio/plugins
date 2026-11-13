// Cheap evidence hints, never a mathematical correctness verdict.
export function formulaHints(latex) {
  const reasons = [];
  if (!latex?.trim() || /\[UNK\]|<unk>|\ufffd/i.test(latex))
    reasons.push("empty-or-undecoded");
  let depth = 0;
  for (const c of (latex ?? "").replace(/\\[{}]/g, "")) {
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) reasons.push("unbalanced-braces");
  const begin = [...(latex ?? "").matchAll(/\\begin\{([^}]+)\}/g)].map(
      (m) => m[1],
    ),
    end = [...(latex ?? "").matchAll(/\\end\{([^}]+)\}/g)]
      .map((m) => m[1])
      .reverse();
  if (JSON.stringify(begin) !== JSON.stringify(end))
    reasons.push("unbalanced-environments");
  // Deliberately narrow: prose in an intertext clause was observed in LSR formula 3.
  if (/\\intertext\s*\{[^}]*\b(?:[A-Za-z]{2,}\s+){3}/.test(latex ?? ""))
    reasons.push("prose-inside-formula");
  return {
    suspicious: reasons.length > 0,
    reasons,
    correctness: "not evaluated",
    pdfNumericComparison:
      "deferred to PR 3: requires text-layer and region alignment",
  };
}

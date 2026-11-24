const letter = /[\p{L}\p{N}]/u;
const compact = text => text.replace(/\s/g, "");
const textNode = text => ({kind:"text", text});

export function scriptPosition(previous, word) {
  if (!previous || word.size >= previous.size * 0.8 || word.size < previous.size * 0.45 ||
      !/^[a-zA-Z0-9]+$/.test(word.text.trim()) || !previous.upright || !word.upright) return;
  const gap = (word.x0 - previous.x1) / previous.size;
  const shift = (word.base - previous.base) / previous.size;
  if (gap < -0.16 || gap > 0.12 || Math.abs(shift) > 0.65) return;
  if (shift >= 0.035) return "subscript";
  if (shift <= -0.12) {
    const base = previous.text.trimEnd();
    if (/(?:^|[^\p{L}])(?:mm|cm|km|m|s)$/u.test(base) && /^[23]$/.test(word.text.trim())) return "superscript";
    if (/\d$/.test(base) && /^(?:st|nd|rd|th)$/i.test(word.text.trim())) return "superscript";
    if (/italic|oblique/i.test(previous.font) && /(?:^|[^\p{L}\p{N}])[A-Za-z\p{Script=Greek}]$/u.test(base)) return "power";
  }
}

function variableValue(base, kind, index, italic) {
  let argument = index;
  if (index.length > 1) {
    argument = !italic && /^[a-z]+$/i.test(index)
      ? "{\\mathrm{" + index + "}}"
      : "{" + index + "}";
  }
  return base + (kind === "power" ? "^" : "_") + argument;
}

// Match the final visible text to the source suffix (list/definition prefixes can be removed).
// Keep semantic atoms intact. Any mismatch makes the whole block fall back to its original nodes.
export function decorate(content, tokens, display) {
  if (!tokens?.length || !content.length) return content;
  const visible = content.map(display);
  if (visible.some(x => typeof x !== "string")) return content;
  const text = visible.join("");
  const source = tokens.map(t => compact(t.text)).join("");
  const target = compact(text);
  if (!target || !source.endsWith(target)) return content;
  const marks = tokens.flatMap(t => Array(compact(t.text).length).fill(t)).slice(-target.length);
  let at = 0;
  const positions = Array.from({length:text.length}, (_,i) => /\s/.test(text[i]) ? null : marks[at++]);
  // Whitespace between two pieces of the same face belongs inside that run.
  for(let i=1;i<positions.length-1;i++) {
    if(positions[i]) continue;
    let j=i;
    while(j<positions.length && !positions[j]) j++;
    const left=positions[i-1], right=positions[j];
    if(left && right && !left.script && !right.script && left.bold===right.bold && left.italic===right.italic)
      positions.fill(left,i,j);
    i=j-1;
  }
  const mixed = flag => positions.some((t,i) => t && letter.test(text[i]) && !t[flag]);
  const bold = mixed("bold"), italic = mixed("italic");
  let offset = 0;
  return content.flatMap((node, index) => {
    const start = offset;
    offset += visible[index].length;
    if (node.kind !== "text") return [node];
    const value = node.text, runs = [];
    const style = t => t?.script || (bold && t?.bold ? "strong" : italic && t?.italic ? "emphasis" : null);
    for (let i=0; i<value.length;) {
      const token = positions[start+i], kind = style(token);
      let end=i+1;
      while (end<value.length && style(positions[start+end])===kind) end++;
      if (kind) runs.push({i,end,kind,token});
      i=end;
    }
    // A variable owns its single base letter, even when it was italic.
    for (const run of runs) {
      if (!["subscript","power"].includes(run.kind)) continue;
      const base = value[run.i-1];
      if (!base || !/[A-Za-z\p{Script=Greek}]/u.test(base) || letter.test(value[run.i-2] || " ") ||
          /[\p{L}\p{N}]/u.test(value[run.end] || " ") ||
          (run.kind==="subscript" && /^[A-Z]$/.test(base) && /^\d+$/.test(value.slice(run.i,run.end)) && !positions[start+run.i-1]?.italic)) continue;
      const arg=value.slice(run.i,run.end);
      if (!/^[A-Za-z0-9]+$/.test(arg)) continue;
      const prior=runs.find(r=>r.end===run.i);
      if(prior) prior.end--;
      run.i--;
      run.math = variableValue(base, run.kind, arg, run.token.italic);
    }
    const out=[];
    let cursor=0;
    for(let {i,end,kind,math} of runs) {
      if(!math && ["strong","emphasis"].includes(kind)) {
        while(i<end && !letter.test(value[i])) i++;
        while(end>i && !letter.test(value[end-1])) end--;
        if(letter.test(text[start+i-1]||" ") || letter.test(text[start+end]||" ")) continue;
      }
      if(i>=end || i<cursor) continue;
      if(i>cursor) out.push(textNode(value.slice(cursor,i)));
      out.push(math ? {kind:"math",value:math} : {kind:kind==="power"?"superscript":kind,children:[textNode(value.slice(i,end))]});
      cursor=end;
    }
    if(cursor<value.length) out.push(textNode(value.slice(cursor)));
    return out;
  });
}

export function sourceToken(word, script) {
  return {text:word.text, ...(/bold/i.test(word.font)?{bold:true}:{}),
    ...(/italic|oblique/i.test(word.font)?{italic:true}:{}), ...(script?{script}:{})};
}

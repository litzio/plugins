import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { extract } from "../extract.mjs";
import { convert, footnoteContent } from "../rules.mjs";
import { authoring } from "../authoring.mjs";
import { splitOffset } from "../corrections.mjs";
import { decorate } from "../inline-styles.mjs";

const file = fileURLToPath(new URL("./fixtures/inline-styles.pdf",import.meta.url));
const result = convert(await extract(file));
const blocks = authoring(result).authoring.inputs[0].blocks;
const text = text => ({kind:"text",text});
const mark = (kind,value) => ({kind,children:[text(value)]});
const math = value => ({kind:"math",value});

test("S-01 partial faces survive in paragraphs and cells with clean Markdown edges",()=>{
  assert.deepEqual(blocks[0].content,[text("Record the "),mark("strong","signal"),text(", using "),mark("emphasis","gentle"),text(" pressure.")]);
  assert.deepEqual(blocks[1].content,[text("Uniform lettering.")]);
  assert.deepEqual(blocks.at(-1).rows[1][1],[text("Use "),mark("strong","care")]);
  assert.equal(result.stats.chars_unaccounted,0);
});

test("S-04 variable, chemical subscript, unit exponent and footnote stay distinct",()=>{
  assert.deepEqual(blocks[2].content,[text("Compare "),math("V_N"),text(" with the first reading.")]);
  assert.deepEqual(blocks[3].content[1],mark("superscript","2"));
  assert.deepEqual(blocks[4].content[1],mark("subscript","2"));
  assert.deepEqual(blocks[5].content[1],math("P^2"));
  assert.deepEqual(blocks.at(-1).rows[1][0],[text("Read "),math("V_N")]);
  const call=footnoteContent("Read[^2]",{footnotes:{refs_without_definition:[]}});
  assert.deepEqual(decorate(call,[{text:"Read"},{text:"2",script:"power"}],n=>n.text??n.label),[text("Read"),{kind:"footnote",label:"2"}]);
  assert.equal(splitOffset([{text:"Compare VN"},{text:"with the first reading."}],1,blocks[2].content),10);
  assert.throws(()=>splitOffset([{text:"Compare V"},{text:"N with the first reading."}],1,blocks[2].content));
});

test("S-04 a matching definition keeps an ambiguous raised number as a footnote call",async()=>{
  const raw = await extract(file);
  raw.pages[0].raw.push({bbox:[70,660,250,670],
    spans:[{text:"2 A short definition.",size:8,flags:0}],
    tokens:[{text:"2 A short definition."}]});
  const withNote=authoring(convert(raw)).authoring.inputs[0].blocks;
  const power=withNote.find(b=>b.content?.[0]?.text?.startsWith("Compute"));
  assert.ok(power.content.some(n=>n.kind==="footnote" && n.label==="2"));
  assert.ok(withNote.some(n=>n.kind==="footnote" && n.label==="2"));
  const unit=withNote.find(b=>b.content?.[0]?.text?.startsWith("Surface area"));
  assert.deepEqual(unit.content[1],mark("superscript","2"));
});

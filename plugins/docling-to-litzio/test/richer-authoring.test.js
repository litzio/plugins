import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBundle, makePlan, hash, validateLimits } from "../src/convert.js";
import {
  bindNotes,
  formatInline,
  inlineText,
  inlineSignature,
} from "../src/rich-content.js";
import { extractPdf } from "../src/pdf-evidence.js";
import { generate } from "../src/generate.js";
import { loadHandoff, validateEvidence, textAt } from "../src/provenance.js";
import { auditSourceNative } from "../src/source-audit.js";
const folder = fileURLToPath(
  new URL("../../../fixtures/lsr-1.1/converted/", import.meta.url),
);
const source = await readBundle(folder);
test("v1 table/list block scalar remains null and containing-item text includes nested content", () => {
  const snapshot = {
    nodes: [
      { path: [1], type: "table", caption: [{ kind: "text", text: "cap" }] },
      {
        path: [2],
        type: "list",
        ordered: false,
        items: [
          {
            content: [
              { kind: "strong", children: [{ kind: "text", text: "root" }] },
            ],
            list: {
              ordered: false,
              items: [{ content: [{ kind: "text", text: "child" }] }],
            },
          },
        ],
      },
    ],
  };
  assert.equal(textAt(snapshot, [1]), null);
  assert.equal(textAt(snapshot, [2]), null);
  assert.equal(
    textAt(snapshot, [2], { kind: "list-item", index: 0 }),
    "root\nchild",
  );
});
function richer() {
  const b = structuredClone(source),
    d = b.doc,
    root = d.groups.find((g) => g.label === "list"),
    first = d.texts.find((n) => n.self_ref === root.children[0].$ref);
  first.enumerated = true;
  first.marker = "a)";
  first.formatting = { bold: true, italic: true, script: "super" };
  const group = {
    self_ref: `#/groups/${d.groups.length}`,
    label: "list",
    parent: { $ref: first.self_ref },
    children: [],
  };
  const nested = {
    self_ref: `#/texts/${d.texts.length}`,
    label: "list_item",
    text: "0.730 ms ≤ 10",
    orig: "0.730 ms ≤ 10",
    enumerated: false,
    marker: "•",
    parent: { $ref: group.self_ref },
    children: [],
    prov: structuredClone(first.prov),
    formatting: { script: "sub" },
  };
  group.children.push({ $ref: nested.self_ref });
  first.children = [{ $ref: group.self_ref }];
  d.groups.push(group);
  d.texts.push(nested);
  const second = {
    ...structuredClone(first),
    self_ref: `#/texts/${d.texts.length}`,
    text: "second",
    orig: "second",
    marker: "b)",
    children: [],
    formatting: null,
  };
  d.texts.push(second);
  root.children.push({ $ref: second.self_ref });
  const paragraph = d.texts.find((n) => n.label === "text");
  paragraph.formatting = { bold: true, italic: true, strikethrough: true };
  paragraph.hyperlink = "https://example.org/evidence";
  const caption = d.texts.find(
    (n) => n.label === "caption" && n.parent?.$ref.startsWith("#/tables/"),
  );
  caption.formatting = { italic: true };
  return b;
}
test("supported Docling inline marks and link preserve exact glyphs; unsupported metadata stays a loss", () => {
  const n = {
    text: "−0.730 ms ≤ 10",
    formatting: {
      bold: true,
      italic: true,
      strikethrough: true,
      script: "super",
    },
    hyperlink: "https://example.org",
  };
  assert.equal(inlineText(formatInline(n)), n.text);
  assert.equal(inlineSignature(formatInline(n))[0].marks.length, 5);
  const b = richer(),
    n2 = b.doc.texts.find((n) => n.label === "text");
  n2.formatting.underline = true;
  const p = makePlan(b);
  assert(
    p.losses.some(
      (l) =>
        l.selfRef === n2.self_ref &&
        l.reasonCode === "inline-formatting" &&
        l.category === "plugin-pending",
    ),
  );
  assert(!p.losses.some((l) => l.reasonCode === "table-caption-separate"));
});
test("nested alphabetical list carries hierarchy and coarse v1 containing-item binding", () => {
  const b = richer(),
    p = makePlan(b),
    nested = p.items.find((i) => i.selfRef === b.doc.texts.at(-2).self_ref);
  const block = p.request.authoring.inputs.find(
    (i) => i.key === nested.links[0].key,
  ).blocks[0];
  assert.equal(block.style, "lower-alpha");
  assert.equal(block.delimiter, ")");
  assert.equal(block.items[0].list.items[0].content[0].kind, "subscript");
  assert.deepEqual(nested.structure.listProjection.indexPath, [0, 0]);
  assert.deepEqual(nested.links[0].selector, { listItem: 0 });
  assert(!p.losses.some((l) => l.reasonCode === "list-marker-or-depth"));
});
test("ambiguous markers stay losses and nested items count toward the official limit", () => {
  const b = richer();
  b.doc.texts.find((n) => n.marker === "a)").marker = "i)";
  assert(
    makePlan(b).losses.some((l) => l.reasonCode === "list-marker-or-depth"),
  );
  const list = {
    kind: "list",
    ordered: false,
    items: Array.from({ length: 100 }, () => ({
      content: [{ kind: "text", text: "x" }],
    })),
  };
  assert.throws(
    () =>
      validateLimits({
        authoring: {
          inputs: Array.from({ length: 50 }, (_, i) => ({
            key: String(i),
            blocks: [list],
          })),
        },
        images: [],
      }),
    /count-limit/,
  );
});
test("PDF-raised markers bind only unique call sites; missing and repeated local markers stay unresolved", async () => {
  const e = await extractPdf(
    await readFile(join(folder, source.record.source.file)),
  );
  const notes = bindNotes(source.doc, e);
  assert.deepEqual([...notes.definitions.keys()], ["#/texts/45"]);
  assert.equal(notes.unresolved.size, 4);
  assert.match(notes.unresolved.get("#/texts/133"), /Repeated/);
  const p = makePlan({ ...source, pdfEvidence: e });
  assert.equal(
    p.losses.filter((l) => l.reasonCode === "dedicated-table-note").length,
    4,
  );
  assert.equal(
    p.losses.filter((l) => l.reasonCode === "footnote-as-paragraph").length,
    1,
  );
  const baseline = structuredClone(e);
  const witness = baseline.pages[4].items.find(
    (i) =>
      i.id === notes.definitions.get("#/texts/45").binding.witness.pdfItemId,
  );
  witness.bbox[3] += 20; // Same character and location, without small raised typography.
  assert(!bindNotes(source.doc, baseline).definitions.has("#/texts/45"));
});
test(
  "new CLI roundtrip preserves nested list and all supplied inline structures with unchanged v1 schemas",
  { skip: !process.env.DOCLING_TEST_CLI },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "docling-richer-integration-"));
    console.log("Retained richer integration:", root);
    const b = richer(),
      bundle = join(root, "bundle");
    await mkdir(bundle);
    const raw = JSON.stringify(b.doc);
    b.record.document.sha256 = hash(raw);
    await writeFile(join(bundle, "document.json"), raw);
    await writeFile(
      join(bundle, "conversion-record.json"),
      JSON.stringify(b.record),
    );
    await writeFile(
      join(bundle, b.record.source.file),
      await readFile(join(folder, b.record.source.file)),
    );
    const out = join(root, "generation"),
      result = await generate(bundle, out, process.env.DOCLING_TEST_CLI);
    assert.equal(result.generationMismatches, 0);
    const h = await loadHandoff(out);
    assert.equal(h.provenance.schemaVersion, "1.0.0");
    assert.equal(
      auditSourceNative(b.doc, h.provenance, h.snapshot).mismatches.length,
      0,
    );
    const nested = h.provenance.items.find(
      (i) => i.structure.listProjection?.indexPath.length === 2,
    );
    assert(
      nested.targets.every(
        (t) => t.selector.kind === "list-item" && t.bindingState === "current",
      ),
    );
    const damaged = structuredClone(h.snapshot),
      list = damaged.nodes.find((n) => n.path[0] === nested.targets[0].path[0]);
    list.items[0].list.items[0].content[0].children[0].text = "0.731 ms ≤ 10";
    assert(
      auditSourceNative(b.doc, h.provenance, damaged).mismatches.some(
        (m) => m.selfRef === nested.selfRef,
      ),
    );
    const styleDamage = structuredClone(h.snapshot),
      paragraph = styleDamage.nodes.find((n) =>
        n.content?.some((c) => c.kind === "link"),
      );
    paragraph.content = [{ kind: "text", text: inlineText(paragraph.content) }];
    assert(
      auditSourceNative(b.doc, h.provenance, styleDamage).mismatches.some(
        (m) => m.kind === "source-inline-structure",
      ),
    );
    const noteDamage = structuredClone(h.snapshot),
      cell = noteDamage.nodes.find(
        (n) =>
          n.type === "cell" && n.content?.some((c) => c.kind === "footnote"),
      );
    cell.content = cell.content.map((c) =>
      c.kind === "footnote" ? { kind: "text", text: "a" } : c,
    );
    assert(
      auditSourceNative(b.doc, h.provenance, noteDamage).mismatches.some(
        (m) => m.kind === "source-cell-inline-structure",
      ),
    );
    const bad = structuredClone(h.provenance);
    bad.items.find(
      (i) => i.selfRef === nested.selfRef,
    ).structure.listProjection.indexPath = [0, 5];
    const receipt = JSON.parse(await readFile(join(out, "receipt.json")));
    assert.throws(
      () => validateEvidence(bad, b.doc, b.record, h.snapshot, receipt),
      /list-projection/,
    );
  },
);

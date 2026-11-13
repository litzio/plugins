import test from "node:test";
import assert from "node:assert/strict";
import { firstBy, snapshotLookup, tokenLookup } from "../src/lookup.js";
import { createSourceReader, sourceItemText } from "../src/rich-content.js";
import { textAt } from "../src/provenance.js";

test("snapshot indexes preserve first match and typed existence with duplicate paths", () => {
  const snapshot = {
    nodes: [
      {
        type: "table",
        path: [1],
        caption: [{ kind: "text", text: "table caption" }],
      },
      { type: "caption", path: [1], text: "other caption" },
      {
        type: "cell",
        path: [1, 0, 0],
        text: "first",
        content: [{ kind: "text", text: "first" }],
      },
      { type: "cell", path: [1, 0, 0], text: "second" },
      { type: "figure", path: [2] },
      { type: "caption", path: [2], text: "figure caption" },
    ],
  };
  const lookup = snapshotLookup(snapshot);
  assert.equal(lookup.node([1]), snapshot.nodes[0]);
  assert.equal(lookup.node([1], "caption"), snapshot.nodes[1]);
  assert.equal(lookup.node([1, 0, 0], "cell").text, "first");
  assert.equal(lookup.node([99]), undefined);
  for (const [path, selector] of [
    [[1], { kind: "block" }],
    [[1], { kind: "cell", row: 0, column: 0 }],
    [[2], { kind: "block" }],
  ])
    assert.equal(
      textAt(snapshot, path, selector, lookup),
      textAt(snapshot, path, selector),
    );
  assert.throws(
    () => textAt(snapshot, [99], undefined, lookup),
    /target-missing/,
  );
});

test("source reader matches literal, rich, list, note and caption projections", () => {
  const snapshot = {
    nodes: [
      {
        type: "paragraph",
        path: [1],
        content: [
          { kind: "text", text: "value " },
          { kind: "footnote", label: "n" },
        ],
      },
      {
        type: "table",
        path: [2],
        caption: [{ kind: "text", text: "caption" }],
      },
      {
        type: "cell",
        path: [2, 0, 0],
        content: [{ kind: "math", value: "x^2" }],
      },
      {
        type: "list",
        path: [3],
        items: [
          {
            content: [{ kind: "text", text: "outer" }],
            list: { items: [{ content: [{ kind: "text", text: "inner" }] }] },
          },
        ],
      },
      { type: "figure", path: [4] },
      {
        type: "caption",
        path: [4],
        content: [{ kind: "text", text: "figure" }],
      },
    ],
  };
  const provenance = {
    items: [
      { structure: { noteBinding: { label: "n", marker: "a" } } },
      { structure: { noteBinding: { label: "n", marker: "b" } } },
    ],
  };
  const reader = createSourceReader(snapshot, provenance);
  const cases = [
    [
      { path: [1], selector: { kind: "block" } },
      { structure: {}, label: "text" },
    ],
    [
      { path: [2], selector: { kind: "block" } },
      { structure: {}, label: "caption" },
    ],
    [
      { path: [2], selector: { kind: "cell", row: 0, column: 0 } },
      { structure: {}, label: "table" },
    ],
    [
      { path: [3], selector: { kind: "list-item", index: 0 } },
      { structure: {}, label: "list_item" },
    ],
    [
      { path: [3], selector: { kind: "block" } },
      {
        structure: { listProjection: { indexPath: [0, 0] } },
        label: "list_item",
      },
    ],
    [
      { path: [4], selector: { kind: "block" } },
      { structure: {}, label: "picture" },
    ],
    [
      { path: [99], selector: { kind: "block" } },
      { structure: {}, label: "text" },
    ],
  ];
  for (const [target, item] of cases)
    assert.equal(
      reader.text(target, item),
      sourceItemText(snapshot, target, item, provenance),
    );
  assert.equal(reader.text(cases[0][0], cases[0][1]), "value b");
  const changed = structuredClone(snapshot);
  changed.nodes[0].content = [{ kind: "text", text: "new revision" }];
  assert.equal(
    createSourceReader(changed, provenance).text(cases[0][0], cases[0][1]),
    "new revision",
  );
  assert.equal(reader.text(cases[0][0], cases[0][1]), "value b");
});

test("token index preserves PDF order and duplicate inventory IDs, not submitted order", () => {
  const tokens = [
    { id: "b", value: "1" },
    { id: "a", value: "2" },
    { id: "b", value: "3" },
  ];
  const evidence = {
    pages: [{ tokens: tokens.slice(0, 2) }, { tokens: tokens.slice(2) }],
  };
  const select = tokenLookup(evidence);
  assert.deepEqual(select(["a", "b", "a", "missing"]), tokens);
  assert.deepEqual(select(["b"]), [tokens[0], tokens[2]]);
  assert.deepEqual(select([]), []);
  assert.equal(
    firstBy(
      [
        { id: "x", value: 1 },
        { id: "x", value: 2 },
      ],
      (r) => r.id,
    ).get("x").value,
    1,
  );
});

test("deep path lookup does not conflate negative zero or malformed path values", () => {
  const snapshot = {
    nodes: [
      { type: "table", path: [1] },
      { type: "cell", path: [1, -0, 0], text: "negative zero" },
      { type: "cell", path: [1, 0, 0], text: "zero" },
    ],
  };
  const strict = snapshotLookup(snapshot, { strict: true });
  const json = snapshotLookup(snapshot);
  assert.equal(strict.node([1, 0, 0], "cell").text, "zero");
  assert.equal(strict.node([1, -0, 0], "cell").text, "negative zero");
  assert.equal(json.node([1, 0, 0], "cell").text, "negative zero");
  assert.equal(
    textAt(snapshot, [1], { kind: "cell", row: 0, column: 0 }, strict),
    textAt(snapshot, [1], { kind: "cell", row: 0, column: 0 }),
  );
  assert.equal(strict.node([1, "0", 0]), undefined);
});

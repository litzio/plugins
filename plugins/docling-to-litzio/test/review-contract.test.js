import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { schemas, validateSchema } from "../src/schema.js";
import { lossCatalog } from "../src/human-review.js";
import {
  digest,
  projectEdit,
  validateHistory,
} from "../src/correction-history.js";

test("contract serialization examples match producer loss IDs byte for byte", async () => {
  const vectors = JSON.parse(
    await readFile(
      new URL(
        "../../../contracts/docling-to-litzio/examples/review-values.json",
        import.meta.url,
      ),
    ),
  );
  for (const { input, serialized, lossId } of vectors) {
    assert.equal(JSON.stringify(input), serialized);
    assert.equal(digest(serialized), lossId);
    const [sourceId, reasonCode, originalValue] = input;
    assert.equal(
      lossCatalog([
        { sourceId, reasonCode, originalValue, severity: "blocking" },
      ])[0].lossId,
      lossId,
    );
  }
});
test("closed expression policy matches documented cases and exact basis strings", () => {
  const sourceId = "s",
    target = { role: "content", path: [1], text: "body" };
  const h = {
    provenance: { items: [{ sourceId, targets: [target] }] },
    snapshot: { nodes: [{ type: "paragraph", path: [1] }] },
  };
  const catalog = (reasonCode, originalValue = {}) =>
    lossCatalog(
      [{ sourceId, reasonCode, originalValue, severity: "blocking" }],
      h,
    )[0];
  for (const reason of [
    "merged-cell-repeated",
    "compound-header-flattened",
    "table-header-role",
    "cell-block-structure",
  ]) {
    assert.equal(catalog(reason).classification, "expression");
    assert.equal(
      catalog(reason).basis,
      "Declared native representation limit; source values retained",
    );
  }
  const paragraph = catalog("footnote-as-paragraph", {
    text: "body",
    reason: "Repeated local marker within extracted table scope",
  });
  assert.equal(paragraph.representation, "unlinked-annotation");
  assert.equal(paragraph.sourceDefect, "duplicate-local-note-marker");
  assert.equal(
    paragraph.basis,
    "Note body retained as an unlinked annotation paragraph",
  );
  const numbered = catalog("dedicated-table-note", {
    text: "a body",
    reason:
      "Original table note placement/letter marker becomes a numbered endnote",
  });
  assert.equal(numbered.representation, "numbered-endnote");
  assert.equal(numbered.basis, "Note body retained as a numbered endnote");
  assert.equal(catalog("unknown").classification, "repair-required");
  assert.equal(
    catalog("unknown").basis,
    "Content preservation or ownership not established",
  );
  h.provenance.items[0].targets = [];
  assert.equal(
    catalog("merged-cell-repeated").classification,
    "repair-required",
  );
});
test("scope and human decision schema closes fields without excluding producer history", () => {
  const scope = schemas["human-review"].properties.scopes.items,
    decision = schemas["human-review"].properties.humanDecisions.items;
  const cp = { revision: "r", time: "t", rulesVersion: "1.0.0" };
  for (const state of [
    "미검사",
    "검사중",
    "차이없음",
    "교정후재검사",
    "판단불가",
    "실패",
  ])
    for (const checkpoint of [
      null,
      cp,
      { ...cp, changeId: "c" },
      { ...cp, note: "inspection" },
    ])
      validateSchema({ id: "page:1", state, checkpoint }, scope);
  for (const choice of ["confirmed", "deferred"]) {
    const d = {
      groupId: "g",
      revision: "r",
      decision: choice,
      note: "basis",
      actor: "human",
      time: "t",
    };
    validateSchema(d, decision);
    validateSchema({ ...d, invalidatedAt: "t" }, decision);
    for (const field of Object.keys(d)) {
      const missing = { ...d };
      delete missing[field];
      assert.throws(() => validateSchema(missing, decision));
    }
    assert.throws(() => validateSchema({ ...d, actor: "assistant" }, decision));
    assert.throws(() => validateSchema({ ...d, extra: 1 }, decision));
  }
  assert.throws(() =>
    validateSchema({ id: "g", state: "unknown", checkpoint: null }, scope),
  );
  assert.throws(() =>
    validateSchema(
      { id: "g", state: "미검사", checkpoint: { ...cp, extra: 1 } },
      scope,
    ),
  );
});
test("single-copy replay checks every link and never mutates baseline or history", () => {
  const baseline = {
    revision: "r0",
    nodes: [
      {
        path: [1],
        type: "paragraph",
        text: "v0",
        content: [{ kind: "text", text: "v0" }],
      },
      { path: [2], type: "heading", text: "unchanged", level: 2 },
    ],
  };
  let snapshot = baseline;
  const changes = [];
  for (let i = 1; i <= 100; i++) {
    const c = {
      changeId: String(i),
      beforeRevision: snapshot.revision,
      afterRevision: "r" + i,
      target: { kind: "paragraph", path: [1] },
      before: "v" + (i - 1),
      after: "v" + i,
      receipt: {
        ok: true,
        command: "apply-batch",
        applied: 1,
        revision: "r" + i,
      },
      evidence: { refs: ["t"] },
      validation: { readback: true },
    };
    snapshot = projectEdit(
      snapshot,
      c.target,
      c.before,
      c.after,
      c.afterRevision,
    );
    changes.push(c);
  }
  const history = {
      schemaVersion: "1.1.0",
      generationId: "g",
      baselineRevision: "r0",
      changes,
      currentSnapshot: snapshot,
    },
    original = structuredClone({ baseline, history });
  assert.deepEqual(validateHistory(history, baseline, "r100", "g"), snapshot);
  assert.deepEqual({ baseline, history }, original);
  for (const index of [0, 49, 99]) {
    const bad = structuredClone(history);
    bad.changes[index].before = "wrong";
    assert.throws(
      () => validateHistory(bad, baseline, "r100", "g"),
      /before-conflict/,
    );
  }
  const bad = structuredClone(history);
  bad.currentSnapshot.nodes[1].level = 3;
  assert.throws(
    () => validateHistory(bad, baseline, "r100", "g"),
    /history-current/,
  );
});

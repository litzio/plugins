import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedItems, sourcePagePositions } from "../linked-items.mjs";

test("V-01 linked source boxes use scaled content coordinates across pages", () => {
  const block = {
    id: "p1",
    kind: "paragraph",
    path: [2],
    warning: { reason: "문장이 끝나지 않음" },
    boxes: [
      { page: 0, x0: 10, x1: 30, top: 16, bottom: 36 },
      { page: 1, x0: 20, x1: 24, top: 2, bottom: 2.5 },
    ],
  };
  const positions = [{ top: 0, scale: 0.5 }, { top: 416, scale: 0.75 }];
  assert.deepEqual(
    linkedItems([block, { ...block, path: undefined }], positions, 300, 420, { paragraph: "본문" }, { paragraph: "info" }),
    [{
      id: "p1",
      path: [2],
      label: "본문 · 문장이 끝나지 않음",
      colorToken: "--id-color-info",
      boxes: [
        { left: 125, top: 8, width: 10, height: 10 },
        { left: 135, top: 417.5, width: 3, height: 1 },
      ],
    }],
  );
});

test("V-02 source page gaps offset linked boxes at every browse scale", () => {
  const pages = [
    { width: 200, height: 100 },
    { width: 100, height: 125 },
    { width: 200, height: 150 },
  ];
  const block = { id: "p3", path: [3], kind: "paragraph",
    boxes: [{ page: 2, x0: 40, x1: 100, top: 20, bottom: 40 }] };

  for (const [pageWidth, positions, box] of [
    [150, [
      { top: 0, height: 75, scale: 0.75 },
      { top: 83, height: 187.5, scale: 1.5 },
      { top: 278.5, height: 112.5, scale: 0.75 },
    ], { left: 96, top: 293.5, width: 45, height: 15 }],
    [200, [
      { top: 0, height: 100, scale: 1 },
      { top: 108, height: 250, scale: 2 },
      { top: 366, height: 150, scale: 1 },
    ], { left: 56, top: 386, width: 60, height: 20 }],
  ]) {
    const actual = sourcePagePositions(pages, pageWidth, 8);
    assert.deepEqual(actual, positions);
    const [item] = linkedItems([block], actual, pageWidth, 216, { paragraph: "본문" }, { paragraph: "info" });
    assert.deepEqual(item.boxes, [box]);
  }
});

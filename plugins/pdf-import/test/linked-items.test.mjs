import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedItems } from "../linked-items.mjs";

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

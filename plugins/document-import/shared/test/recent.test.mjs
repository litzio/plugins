import assert from "node:assert/strict";
import test from "node:test";
import { mergeRecentRows } from "../recent.mjs";

test("PDF와 워드 변환 결과를 종류와 함께 최근 순으로 섞는다", () => {
  const pdf = [
    { id: "pdf-1", convertedAt: "2026-11-25 09:00:00", reviewStatus: "초안" },
    { id: "pdf-2", convertedAt: "2026-11-24 16:00:00", reviewStatus: "검토 완료" },
  ];
  const word = [
    { id: "word-1", convertedAt: "2026-11-25 11:00:00", warnings: 3 },
    { id: "word-2", convertedAt: "2026-11-24 17:00:00", warnings: 0 },
  ];
  assert.deepEqual(mergeRecentRows(pdf, word), [
    { ...word[0], kind: "word" },
    { ...pdf[0], kind: "pdf" },
    { ...word[1], kind: "word" },
    { ...pdf[1], kind: "pdf" },
  ]);
  assert.deepEqual(mergeRecentRows([], []), []);
});

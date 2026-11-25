import test from "node:test";
import assert from "node:assert/strict";
import { flowState } from "../flow.mjs";

test("처음 화면과 PDF 세 양식의 저장 뒤 경로", () => {
  assert.deepEqual(flowState(), {path:[], current:null});
  for (const profile of ["generic","ieee","sheet"]) {
    const state = flowState({kind:"pdf",profile,remaining:2});
    assert.deepEqual(state.path, ["pick","pages","analysis",profile,"images","save","link","compare","checks"]);
    assert.equal(state.label, "확인할 곳 보기 2");
  }
  assert.equal(flowState({kind:"pdf"}).current,"compare");
  assert.equal(flowState({kind:"pdf",approved:true,remaining:2}).current,"approved");
});
test("변환 중에는 현재 단계까지만 지나온 경로로 표시", () => {
  for (const [kind, phase, current] of [
    ["pdf","이전 문서 정리","analysis"],["pdf","구조 분석","analysis"],["pdf","그림 만들기","images"],
    ["pdf","문서 저장","save"],["pdf","원본 연결","link"],["word","구조 읽기","structure"],
    ["word","그림 만들기","images"],["word","문서 저장","save"]
  ]) {
    const state = flowState({kind,phase});
    assert.equal(state.path.at(-1),current);
    assert.equal(state.label,phase);
  }
});
test("워드 원본 쪽 준비, 실패, 대조와 확인할 곳", () => {
  const state = (source,remaining) => flowState({kind:"word",source,remaining});
  assert.equal(state("preparing",2).current,"source");
  assert.equal(state("failed",2).failure,"source");
  assert.equal(state("failed",2).current,"checks");
  assert.equal(state("failed",0).current,"save");
  assert.ok(state("ready",2).path.includes("locate"));
  assert.equal(state("ready",2).current,"checks");
  assert.equal(state("ready",0).current,"compare");
  assert.equal(flowState({kind:"word",documentOnly:true}).current,"save");
});

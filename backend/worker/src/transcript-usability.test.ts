import assert from "node:assert/strict";
import test from "node:test";
import { transcriptHardGateFailureReason } from "./transcript-usability";

test("transcript hard gate rejects empty markers and text shorter than ten meaningful characters", () => {
  assert.match(transcriptHardGateFailureReason("[NO_ANSWER]") ?? "", /인식되지 않았/);
  assert.match(transcriptHardGateFailureReason("짧은 답변") ?? "", /너무 짧아/);
});

test("transcript hard gate accepts an understandable transcript with enough content", () => {
  assert.equal(
    transcriptHardGateFailureReason("로그를 확인하고 원인을 찾아 쿼리를 수정했습니다."),
    undefined,
  );
});

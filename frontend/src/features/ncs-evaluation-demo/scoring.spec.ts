import { strict as assert } from "node:assert";

import { EXAMPLE_ANSWERS, FIXED_QUESTIONS, evaluateNcsAnswers } from "./scoring";

const empty = evaluateNcsAnswers({});
assert.equal(empty.totalScore, undefined);
assert.ok(empty.criterionAssessments.every((item) => item.confidence === "평가 불충분"));

const strong = evaluateNcsAnswers(EXAMPLE_ANSWERS);
assert.ok(strong.totalScore !== undefined && strong.totalScore >= 80);
assert.ok(strong.jobScore !== undefined);
assert.ok(strong.basicScore !== undefined);
assert.equal(strong.questionAssessments.length, FIXED_QUESTIONS.length);
assert.ok(strong.criterionAssessments.every((item) => item.evidence.length >= 2));

const weakAnswers = Object.fromEntries(
  FIXED_QUESTIONS.map((question) => [
    question.id,
    "관련 개념은 알고 있지만 실제로 수행한 경험이나 구체적인 결과는 설명하기 어렵습니다.",
  ]),
);
const weak = evaluateNcsAnswers(weakAnswers);
assert.ok(weak.totalScore !== undefined && weak.totalScore <= 50);
assert.ok((strong.totalScore ?? 0) > (weak.totalScore ?? 0));

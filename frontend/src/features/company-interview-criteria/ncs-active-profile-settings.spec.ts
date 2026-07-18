import assert from "node:assert/strict";
import test from "node:test";

import {
  findNewlyDeactivatedQuestionImpacts,
  getConfigurationLockedMessage,
  setNcsCriterionActive,
  validateNcsActiveWeightDrafts,
} from "./ncs-active-profile-settings";
import type { InterviewSettings } from "./types";

test("checkbox off stores weight zero and on restores an editable positive value", () => {
  const drafts = [{ draftId: "job", tagId: 1, weight: "40" }];
  const disabled = setNcsCriterionActive(drafts, "job", false);
  assert.equal(disabled[0].weight, "0");
  const enabled = setNcsCriterionActive(disabled, "job", true);
  assert.equal(enabled[0].weight, "1");
});

test("only newly disabled profiles with connected active questions require confirmation", () => {
  const settings = {
    availableTags: [
      { tagId: 1, ncsProfileId: "JOB_TECHNICAL" },
      { tagId: 2, ncsProfileId: "PROBLEM_SOLVING" },
    ],
    criteria: [
      { tagId: 1, ncsProfileId: "JOB_TECHNICAL", weight: 50 },
      { tagId: 2, ncsProfileId: "PROBLEM_SOLVING", weight: 50 },
    ],
    questionImpactByProfile: [
      {
        ncsProfileId: "JOB_TECHNICAL",
        exclusivelyBoundActiveQuestionCount: 1,
        multiBoundActiveQuestionCount: 2,
      },
      {
        ncsProfileId: "PROBLEM_SOLVING",
        exclusivelyBoundActiveQuestionCount: 0,
        multiBoundActiveQuestionCount: 0,
      },
    ],
  } as InterviewSettings;

  assert.deepEqual(
    findNewlyDeactivatedQuestionImpacts(settings, [
      { draftId: "job", tagId: 1, weight: "0" },
      { draftId: "problem", tagId: 2, weight: "100" },
    ]).map((impact) => impact.ncsProfileId),
    ["JOB_TECHNICAL"],
  );
});

test("submitted application lock reason has user-actionable readonly copy", () => {
  assert.match(
    getConfigurationLockedMessage("SUBMITTED_APPLICATION_EXISTS"),
    /제출된 지원 이력/,
  );
});

test("V2 blocks zero active profiles and weights that do not sum to 100", () => {
  const drafts = [
    { draftId: "job", tagId: 1, weight: "0" },
    { draftId: "collaboration", tagId: 4, weight: "0" },
    { draftId: "problem", tagId: 2, weight: "0" },
  ];
  assert.match(validateNcsActiveWeightDrafts(drafts), /최소 1개/);
  assert.match(
    validateNcsActiveWeightDrafts([
      { ...drafts[0], weight: "40" },
      { ...drafts[1], weight: "30" },
      { ...drafts[2], weight: "20" },
    ]),
    /합계는 정확히 100/,
  );
  assert.equal(
    validateNcsActiveWeightDrafts([
      { ...drafts[0], weight: "40" },
      { ...drafts[1], weight: "30" },
      { ...drafts[2], weight: "30" },
    ]),
    "",
  );
});

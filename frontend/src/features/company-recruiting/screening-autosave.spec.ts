import type { ScreeningDecision } from "./types";
import {
  getScreeningAutosaveFieldState,
  hasScreeningDraftChanged,
  markScreeningAutosaveError,
  markScreeningAutosaveSaving,
  markScreeningAutosaveSuccess,
  type ScreeningAutosaveState,
} from "./screening-autosave";

const initialState: ScreeningAutosaveState = {};

const savingState = markScreeningAutosaveSaving(initialState, 1, "decision");
const decisionSaving = getScreeningAutosaveFieldState(savingState, 1, "decision");
const memoIdle = getScreeningAutosaveFieldState(savingState, 1, "memo");

if (decisionSaving !== "saving") {
  throw new Error("Decision field should be marked as saving.");
}

if (memoIdle !== "idle") {
  throw new Error("Other fields should stay idle.");
}

const errorState = markScreeningAutosaveError(savingState, 1, "decision");
const decisionError = getScreeningAutosaveFieldState(errorState, 1, "decision");

if (decisionError !== "error") {
  throw new Error("Failed field should be marked as error.");
}

const successState = markScreeningAutosaveSuccess(errorState, 1, "decision");
const decisionIdle = getScreeningAutosaveFieldState(successState, 1, "decision");

if (decisionIdle !== "idle") {
  throw new Error("Saved field should return to idle.");
}

const changedDecision = hasScreeningDraftChanged(
  { decision: "PASS" as ScreeningDecision, memo: "memo" },
  { decision: "HOLD" as ScreeningDecision, memo: "memo" },
);
const changedMemo = hasScreeningDraftChanged(
  { decision: "PASS" as ScreeningDecision, memo: "memo" },
  { decision: "PASS" as ScreeningDecision, memo: "memo changed" },
);
const unchangedDraft = hasScreeningDraftChanged(
  { decision: "PASS" as ScreeningDecision, memo: "memo" },
  { decision: "PASS" as ScreeningDecision, memo: "memo" },
);

if (!changedDecision || !changedMemo || unchangedDraft) {
  throw new Error("Screening draft change detection should compare decision and memo.");
}

import type { ScreeningDecision } from "./types";

export type ScreeningDraft = {
  decision: ScreeningDecision;
  memo: string;
};

export type ScreeningAutosaveField = "decision" | "memo";
export type ScreeningAutosaveFieldState = "idle" | "saving" | "error";

export type ScreeningAutosaveState = Record<
  number,
  Partial<Record<ScreeningAutosaveField, ScreeningAutosaveFieldState>>
>;

export function getScreeningAutosaveFieldState(
  state: ScreeningAutosaveState,
  applicationId: number,
  field: ScreeningAutosaveField,
): ScreeningAutosaveFieldState {
  return state[applicationId]?.[field] ?? "idle";
}

export function markScreeningAutosaveSaving(
  state: ScreeningAutosaveState,
  applicationId: number,
  field: ScreeningAutosaveField,
): ScreeningAutosaveState {
  return setScreeningAutosaveFieldState(state, applicationId, field, "saving");
}

export function markScreeningAutosaveError(
  state: ScreeningAutosaveState,
  applicationId: number,
  field: ScreeningAutosaveField,
): ScreeningAutosaveState {
  return setScreeningAutosaveFieldState(state, applicationId, field, "error");
}

export function markScreeningAutosaveSuccess(
  state: ScreeningAutosaveState,
  applicationId: number,
  field: ScreeningAutosaveField,
): ScreeningAutosaveState {
  return setScreeningAutosaveFieldState(state, applicationId, field, "idle");
}

export function hasScreeningDraftChanged(current: ScreeningDraft, next: ScreeningDraft) {
  return current.decision !== next.decision || current.memo !== next.memo;
}

function setScreeningAutosaveFieldState(
  state: ScreeningAutosaveState,
  applicationId: number,
  field: ScreeningAutosaveField,
  fieldState: ScreeningAutosaveFieldState,
): ScreeningAutosaveState {
  return {
    ...state,
    [applicationId]: {
      ...state[applicationId],
      [field]: fieldState,
    },
  };
}

export const CANDIDATE_DEMO_RESET_COMMAND = "demo:reset";

export interface CandidateDemoShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function isCandidateDemoCommandShortcut(event: CandidateDemoShortcutEvent): boolean {
  return (
    !event.altKey &&
    event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "p"
  );
}

export function isCandidateDemoResetCommand(value: string): boolean {
  return value.trim().toLowerCase() === CANDIDATE_DEMO_RESET_COMMAND;
}

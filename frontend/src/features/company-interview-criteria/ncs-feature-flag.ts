export function isNcsQuestionPolicyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}

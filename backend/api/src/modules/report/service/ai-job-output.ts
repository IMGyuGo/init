export function parseAiJobOutput(outputRef?: string | null): unknown | undefined {
  if (!outputRef) {
    return undefined;
  }

  try {
    return JSON.parse(outputRef) as unknown;
  } catch {
    return undefined;
  }
}

export const MIN_TRANSCRIPT_MEANINGFUL_LENGTH = 10;

export function transcriptHardGateFailureReason(transcript: string): string | undefined {
  const normalized = transcript.trim();
  if (!normalized || normalized.includes("[NO_ANSWER]")) {
    return "답변 녹음이 정상적으로 인식되지 않았습니다.";
  }

  if (normalized.replace(/\s/g, "").length < MIN_TRANSCRIPT_MEANINGFUL_LENGTH) {
    return "음성 인식 결과가 너무 짧아 답변 내용을 확인할 수 없습니다.";
  }

  return undefined;
}

import { CandidateDomainError } from "../../candidate";
import type { CreateRealtimeInterviewSessionDto } from "../dto/interview.runtime.dto";

export function assertRealtimeSessionRequest(
  dto: CreateRealtimeInterviewSessionDto | null | undefined,
): void {
  if (dto === null || (dto !== undefined && (typeof dto !== "object" || Array.isArray(dto)))) {
    throw new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Request body is invalid.",
      400,
      [{ field: "realtimeSession", reason: "realtimeSession must be an object" }],
    );
  }
  if (dto?.mode !== undefined && dto.mode !== "realtime-voice") {
    throw new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Realtime session mode is invalid.",
      400,
      [{ field: "mode", reason: "mode must be realtime-voice" }],
    );
  }
  if (dto?.transport !== undefined && dto.transport !== "webrtc") {
    throw new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Realtime session transport is invalid.",
      400,
      [{ field: "transport", reason: "transport must be webrtc" }],
    );
  }
}

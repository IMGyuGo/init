import { Inject, Injectable } from "@nestjs/common";
import type { CurrentUser } from "@init/common";
import { randomUUID } from "node:crypto";
import type { CreateRealtimeInterviewSessionDto } from "../dto/interview.runtime.dto";
import type { RealtimePreviewSessionResult } from "../interview.runtime.types";
import { RealtimeSessionCredentialService } from "./realtime-session-credential.service";
import { assertRealtimeSessionRequest } from "./realtime-session-request";

@Injectable()
export class InterviewerPreviewRealtimeService {
  constructor(
    @Inject(RealtimeSessionCredentialService)
    private readonly credentials: RealtimeSessionCredentialService,
  ) {}

  async createSession(
    dto: CreateRealtimeInterviewSessionDto,
    user: CurrentUser,
  ): Promise<{
    data: RealtimePreviewSessionResult;
    meta: { traceId: string; timestamp: string };
  }> {
    assertRealtimeSessionRequest(dto);
    const issuedCredentials = await this.credentials.issueOpenAi({
      instructions: [
        "You provide exact-script Korean speech for authenticated lip-sync tuning.",
        "Stay silent until the browser sends response.create.",
        "Speak only the exact marked script once and say nothing else.",
      ].join(" "),
      safetyIdentifier: `preview-${user.userType.toLowerCase()}-${user.userId}`,
    });
    const data: RealtimePreviewSessionResult = {
      ...issuedCredentials,
      provider: "openai",
    };
    return {
      data,
      meta: { traceId: randomUUID(), timestamp: new Date().toISOString() },
    };
  }
}

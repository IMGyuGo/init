import { Inject, Injectable, Optional } from "@nestjs/common";
import { CandidateDomainError } from "../../candidate";
import type { RealtimeSessionCredentials } from "../interview.runtime.types";

export interface IssueOpenAiRealtimeCredentialsInput {
  instructions: string;
  safetyIdentifier: string;
}

export const REALTIME_SESSION_FETCH = Symbol("REALTIME_SESSION_FETCH");

@Injectable()
export class RealtimeSessionCredentialService {
  constructor(
    @Optional()
    @Inject(REALTIME_SESSION_FETCH)
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async issueOpenAi(
    input: IssueOpenAiRealtimeCredentialsInput,
  ): Promise<RealtimeSessionCredentials> {
    if (process.env.AI_INTERVIEWER_REALTIME_PROVIDER !== "openai") {
      throw new CandidateDomainError(
        "COMMON_CONFLICT",
        "OpenAI realtime session provider is not configured.",
        409,
        [{ field: "AI_INTERVIEWER_REALTIME_PROVIDER", reason: "provider must be openai" }],
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CandidateDomainError(
        "COMMON_CONFLICT",
        "OpenAI realtime session provider is not configured.",
        409,
        [{ field: "OPENAI_API_KEY", reason: "OPENAI_API_KEY is required" }],
      );
    }

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
    const voice = process.env.OPENAI_REALTIME_VOICE || "marin";
    const baseUrl = (process.env.OPENAI_REALTIME_API_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
    const response = await this.fetcher(`${baseUrl}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": input.safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: input.instructions,
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                create_response: false,
                interrupt_response: false,
              },
            },
            output: { voice, speed: 0.9 },
          },
        },
      }),
    });
    const rawBody = await response.text();
    let payload: {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
      error?: { message?: string };
    } = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new CandidateDomainError(
        "COMMON_EXTERNAL_SERVICE_FAILED",
        "OpenAI realtime session creation failed.",
        502,
        [{ field: "openai", reason: payload.error?.message ?? (rawBody.slice(0, 200) || `status ${response.status}`) }],
      );
    }

    const clientSecret = payload.value ?? payload.client_secret?.value;
    if (!clientSecret) {
      throw new CandidateDomainError(
        "COMMON_EXTERNAL_SERVICE_FAILED",
        "OpenAI realtime client secret was not returned.",
        502,
        [{ field: "clientSecret", reason: "missing ephemeral client secret" }],
      );
    }

    const expiresAtSeconds = payload.expires_at ?? payload.client_secret?.expires_at;
    return {
      accepted: true,
      mode: "realtime-voice",
      provider: "openai",
      model,
      voice,
      transport: "webrtc",
      clientSecret,
      clientSecretType: "ephemeral",
      expiresAt: expiresAtSeconds && Number.isFinite(expiresAtSeconds)
        ? new Date(expiresAtSeconds! * 1000).toISOString()
        : new Date(Date.now() + 120_000).toISOString(),
      endpoint: `${baseUrl}/v1/realtime/calls`,
    };
  }
}

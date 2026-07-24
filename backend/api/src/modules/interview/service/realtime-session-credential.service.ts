import { Inject, Injectable, Optional } from "@nestjs/common";
import { CandidateDomainError } from "../../candidate";
import type { RealtimeSessionCredentials } from "../interview.runtime.types";

export interface IssueOpenAiRealtimeCredentialsInput {
  instructions: string;
  safetyIdentifier: string;
}

export const REALTIME_SESSION_FETCH = Symbol("REALTIME_SESSION_FETCH");

type OpenAiRealtimePayload = {
  value?: unknown;
  expires_at?: unknown;
  client_secret?: unknown;
  error?: unknown;
};

function externalServiceFailure(message: string, field: string, reason: string) {
  return new CandidateDomainError(
    "COMMON_EXTERNAL_SERVICE_FAILED",
    message,
    502,
    [{ field, reason: reason.slice(0, 200) }],
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
    let response: Response;
    try {
      response = await this.fetcher(`${baseUrl}/v1/realtime/client_secrets`, {
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
    } catch {
      throw externalServiceFailure(
        "OpenAI realtime session creation failed.",
        "openai",
        "request failed",
      );
    }

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch {
      throw externalServiceFailure(
        "OpenAI realtime session creation failed.",
        "openai",
        "response body could not be read",
      );
    }

    let parsedPayload: unknown = {};
    let payloadParsed = true;
    try {
      parsedPayload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payloadParsed = false;
    }

    if (!response.ok) {
      throw externalServiceFailure(
        "OpenAI realtime session creation failed.",
        "openai",
        `provider returned status ${response.status}`,
      );
    }

    if (!payloadParsed || !isObjectRecord(parsedPayload)) {
      throw externalServiceFailure(
        "OpenAI realtime client secret response was invalid.",
        "openai",
        "invalid client secret response",
      );
    }
    const payload = parsedPayload as OpenAiRealtimePayload;
    const nestedSecret = isObjectRecord(payload.client_secret) ? payload.client_secret : undefined;
    const clientSecretValue = payload.value ?? nestedSecret?.value;
    if (clientSecretValue === undefined || clientSecretValue === null) {
      throw externalServiceFailure(
        "OpenAI realtime client secret was not returned.",
        "clientSecret",
        "missing ephemeral client secret",
      );
    }
    if (typeof clientSecretValue !== "string" || clientSecretValue.trim().length === 0) {
      throw externalServiceFailure(
        "OpenAI realtime client secret response was invalid.",
        "clientSecret",
        "invalid ephemeral client secret",
      );
    }

    const expiresAtValue = payload.expires_at !== undefined
      ? payload.expires_at
      : nestedSecret?.expires_at;
    let expiresAt: string;
    if (expiresAtValue === undefined || expiresAtValue === 0) {
      expiresAt = new Date(Date.now() + 120_000).toISOString();
    } else if (typeof expiresAtValue !== "number" || !Number.isFinite(expiresAtValue) || expiresAtValue < 0) {
      throw externalServiceFailure(
        "OpenAI realtime client secret response was invalid.",
        "expiresAt",
        "invalid ephemeral client secret expiry",
      );
    } else {
      const expiresAtDate = new Date(expiresAtValue * 1000);
      if (!Number.isFinite(expiresAtDate.getTime())) {
        throw externalServiceFailure(
          "OpenAI realtime client secret response was invalid.",
          "expiresAt",
          "invalid ephemeral client secret expiry",
        );
      }
      expiresAt = expiresAtDate.toISOString();
    }

    return {
      accepted: true,
      mode: "realtime-voice",
      provider: "openai",
      model,
      voice,
      transport: "webrtc",
      clientSecret: clientSecretValue,
      clientSecretType: "ephemeral",
      expiresAt,
      endpoint: `${baseUrl}/v1/realtime/calls`,
    };
  }
}

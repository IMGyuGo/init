import { CandidateDomainError } from "../../candidate";
import { RealtimeSessionCredentialService } from "./realtime-session-credential.service";

function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("RealtimeSessionCredentialService", () => {
  const originalProvider = process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_REALTIME_MODEL;
  const originalVoice = process.env.OPENAI_REALTIME_VOICE;
  const originalBaseUrl = process.env.OPENAI_REALTIME_API_BASE_URL;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    restoreEnvironmentValue("AI_INTERVIEWER_REALTIME_PROVIDER", originalProvider);
    restoreEnvironmentValue("OPENAI_API_KEY", originalApiKey);
    restoreEnvironmentValue("OPENAI_REALTIME_MODEL", originalModel);
    restoreEnvironmentValue("OPENAI_REALTIME_VOICE", originalVoice);
    restoreEnvironmentValue("OPENAI_REALTIME_API_BASE_URL", originalBaseUrl);
    globalThis.fetch = originalFetch;
  });

  it("issues an OpenAI realtime client secret with the configured session contract", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const service = new RealtimeSessionCredentialService(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({
        value: "ephemeral-test-secret",
        expires_at: 1783300000,
      }), { status: 200 });
    });

    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    delete process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_REALTIME_VOICE;
    delete process.env.OPENAI_REALTIME_API_BASE_URL;

    const result = await service.issueOpenAi({
      instructions: "Stay silent until response.create.",
      safetyIdentifier: "preview-candidate-7",
    });

    expect(result.provider).toBe("openai");
    expect(result.clientSecret).toBe("ephemeral-test-secret");
    expect(result.expiresAt).toBe("2026-07-06T01:06:40.000Z");
    expect(calls[0]?.input).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer server-test-key",
      "OpenAI-Safety-Identifier": "preview-candidate-7",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        instructions: "Stay silent until response.create.",
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              create_response: false,
              interrupt_response: false,
            },
          },
          output: { voice: "marin", speed: 0.9 },
        },
      },
    });
  });

  it("rejects issuing OpenAI credentials while the mock provider is configured", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "mock";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(originalFetch);

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_CONFLICT",
      statusCode: 409,
      details: [{ field: "AI_INTERVIEWER_REALTIME_PROVIDER", reason: "provider must be openai" }],
    });
  });

  it("rejects issuing OpenAI credentials without an API key", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const service = new RealtimeSessionCredentialService(originalFetch);

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_CONFLICT",
      statusCode: 409,
      details: [{ field: "OPENAI_API_KEY", reason: "OPENAI_API_KEY is required" }],
    });
  });

  it("maps a non-successful OpenAI response to an external service failure", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(
      JSON.stringify({ error: { message: "provider unavailable" } }),
      { status: 503 },
    ));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "openai", reason: "provider unavailable" }],
    });
  });

  it("rejects a successful OpenAI response without an ephemeral client secret", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(
      JSON.stringify({ expires_at: 1783300000 }),
      { status: 200 },
    ));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "clientSecret", reason: "missing ephemeral client secret" }],
    });
  });
});

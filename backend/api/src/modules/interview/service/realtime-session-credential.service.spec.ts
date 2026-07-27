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
    jest.restoreAllMocks();
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
    const secretMarker = "sk-provider-secret-marker";
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(
      JSON.stringify({ error: { message: `provider unavailable ${secretMarker}` } }),
      { status: 503 },
    ));

    let thrown: unknown;
    try {
      await service.issueOpenAi({
        instructions: "instructions",
        safetyIdentifier: "preview-candidate-7",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "openai", reason: "provider returned status 503" }],
    });
    expect(JSON.stringify((thrown as CandidateDomainError).details)).not.toContain(secretMarker);
  });

  it("maps an OpenAI transport rejection to a bounded external service failure", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => {
      throw new Error(`network failed ${"secret-provider-detail".repeat(30)}`);
    });

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "openai", reason: "request failed" }],
    });
  });

  it("maps an unreadable OpenAI response body to an external service failure", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("body stream failed");
      },
    }) as unknown as Response);

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "openai", reason: "response body could not be read" }],
    });
  });

  it("uses the provider status when a non-successful response has an empty body", async () => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(null, { status: 503 }));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "openai", reason: "provider returned status 503" }],
    });
  });

  it("uses the two-minute expiry fallback when the provider expiry is zero", async () => {
    const now = 1_783_300_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(JSON.stringify({
      value: "ephemeral-test-secret",
      expires_at: 0,
    }), { status: 200 }));

    const result = await service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    });

    expect(result.expiresAt).toBe(new Date(now + 120_000).toISOString());
  });

  it("accepts nested client secrets and normalizes configured session settings", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    process.env.OPENAI_REALTIME_MODEL = "configured-realtime-model";
    process.env.OPENAI_REALTIME_VOICE = "configured-voice";
    process.env.OPENAI_REALTIME_API_BASE_URL = "https://realtime.example.test///";
    const service = new RealtimeSessionCredentialService(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({
        client_secret: {
          value: "nested-ephemeral-secret",
          expires_at: 1_783_300_000,
        },
      }), { status: 200 });
    });

    const result = await service.issueOpenAi({
      instructions: "configured instructions",
      safetyIdentifier: "preview-candidate-8",
    });
    const requestBody = JSON.parse(String(calls[0]?.init?.body));

    expect(calls[0]?.input).toBe("https://realtime.example.test/v1/realtime/client_secrets");
    expect(requestBody.session).toMatchObject({
      model: "configured-realtime-model",
      audio: { output: { voice: "configured-voice", speed: 0.9 } },
    });
    expect(result).toMatchObject({
      provider: "openai",
      model: "configured-realtime-model",
      voice: "configured-voice",
      clientSecret: "nested-ephemeral-secret",
      expiresAt: "2026-07-06T01:06:40.000Z",
      endpoint: "https://realtime.example.test/v1/realtime/calls",
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

  it.each([
    { label: "JSON null", body: "null" },
    { label: "JSON string", body: JSON.stringify("not-an-object") },
    { label: "JSON array", body: JSON.stringify([{ value: "not-a-secret" }]) },
    { label: "malformed JSON", body: "{not-json" },
  ])("maps a successful $label payload to an external service failure", async ({ body }) => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(body, { status: 200 }));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      message: "OpenAI realtime client secret response was invalid.",
      details: [{ field: "openai", reason: "invalid client secret response" }],
    });
  });

  it.each([
    { label: "blank", value: "   " },
    { label: "non-string", value: { token: "unexpected" } },
  ])("rejects a successful response with a $label client secret", async ({ value }) => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(JSON.stringify({
      value,
      expires_at: 1_783_300_000,
    }), { status: 200 }));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "clientSecret", reason: "invalid ephemeral client secret" }],
    });
  });

  it.each([
    { label: "null", expiresAt: null },
    { label: "string", expiresAt: "1783300000" },
    { label: "negative", expiresAt: -1 },
    { label: "out-of-range", expiresAt: Number.MAX_VALUE },
  ])("rejects a successful response with a $label expiry", async ({ expiresAt }) => {
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-test-key";
    const service = new RealtimeSessionCredentialService(async () => new Response(JSON.stringify({
      value: "ephemeral-test-secret",
      expires_at: expiresAt,
    }), { status: 200 }));

    await expect(service.issueOpenAi({
      instructions: "instructions",
      safetyIdentifier: "preview-candidate-7",
    })).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_EXTERNAL_SERVICE_FAILED",
      statusCode: 502,
      details: [{ field: "expiresAt", reason: "invalid ephemeral client secret expiry" }],
    });
  });
});

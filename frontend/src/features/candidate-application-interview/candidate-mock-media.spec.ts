import { strict as assert } from "node:assert";
import { createCandidateApiClient } from "./api";

async function assertMockReportMediaSessionRequest() {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });
    return new Response(JSON.stringify({
      data: {
        expiresInSeconds: 900,
        mediaBaseUrl: "/api/v1/candidate/mock-interview/reports/41/media",
      },
      meta: {
        traceId: "test",
        timestamp: "2026-07-16T00:00:00.000Z",
      },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createCandidateApiClient({
    baseUrl: "https://api.example.test",
    fetcher,
  });

  const session = await client.createMockReportMediaSession(41);

  assert.deepEqual(requests, [
    {
      method: "POST",
      url: "https://api.example.test/api/v1/candidate/mock-interview/reports/41/media/session",
    },
  ]);
  assert.equal(
    session.data.mediaBaseUrl,
    "https://api.example.test/api/v1/candidate/mock-interview/reports/41/media",
  );
  assert.equal(session.data.expiresInSeconds, 900);
}

void assertMockReportMediaSessionRequest();

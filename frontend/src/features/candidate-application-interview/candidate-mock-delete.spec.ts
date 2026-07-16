import { strict as assert } from "node:assert";
import { createCandidateApiClient } from "./api";

async function assertMockInterviewDeleteRequest() {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const client = createCandidateApiClient({
    baseUrl: "https://api.example.test",
    fetcher,
  });

  await client.deleteMockInterview(41);

  assert.deepEqual(requests, [
    {
      method: "DELETE",
      url: "https://api.example.test/api/v1/candidate/mock-interviews/41",
    },
  ]);
}

assertMockInterviewDeleteRequest()
  .then(() => console.log("candidate-mock-delete.spec: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

import { strict as assert } from "node:assert";
import { createCandidateApiClient } from "./api";
import {
  CANDIDATE_DEMO_RESET_COMMAND,
  isCandidateDemoCommandShortcut,
  isCandidateDemoResetCommand,
} from "./candidate-demo-tools";

assert.equal(
  isCandidateDemoCommandShortcut({ altKey: false, ctrlKey: true, key: "P", metaKey: false, shiftKey: true }),
  true,
);
assert.equal(
  isCandidateDemoCommandShortcut({ altKey: false, ctrlKey: false, key: "p", metaKey: true, shiftKey: true }),
  true,
);
assert.equal(
  isCandidateDemoCommandShortcut({ altKey: false, ctrlKey: true, key: "p", metaKey: false, shiftKey: false }),
  false,
);
assert.equal(isCandidateDemoResetCommand("  DEMO:RESET "), true);
assert.equal(isCandidateDemoResetCommand("demo:delete"), false);

async function assertDemoResetRequests() {
  const requests: Array<{ body?: string; method: string; url: string }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });
    return new Response(JSON.stringify({ data: { enabled: true }, meta: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createCandidateApiClient({ baseUrl: "https://api.example.test", fetcher });

  await client.unlockDemoApplicationReset(CANDIDATE_DEMO_RESET_COMMAND);
  await client.resetDemoApplication(17);
  await client.resetAllDemoApplications();

  assert.deepEqual(requests, [
    {
      body: JSON.stringify({ command: CANDIDATE_DEMO_RESET_COMMAND }),
      method: "POST",
      url: "https://api.example.test/api/v1/candidate/demo-tools/applications/unlock",
    },
    {
      body: undefined,
      method: "DELETE",
      url: "https://api.example.test/api/v1/candidate/demo-tools/applications/17",
    },
    {
      body: undefined,
      method: "DELETE",
      url: "https://api.example.test/api/v1/candidate/demo-tools/applications",
    },
  ]);
}

assertDemoResetRequests()
  .then(() => console.log("candidate-demo-tools.spec: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

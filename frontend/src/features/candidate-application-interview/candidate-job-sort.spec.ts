import { strict as assert } from "node:assert";
import { createCandidateApiClient } from "./api";
import { candidateJobSortOptions, toCandidateJobSortQuery } from "./candidate-job-sort";

assert.deepEqual(toCandidateJobSortQuery("createdAt"), {
  sort: "createdAt",
  order: "desc",
});

assert.deepEqual(toCandidateJobSortQuery("endsOn"), {
  sort: "endsOn",
  order: "asc",
});

assert.deepEqual(toCandidateJobSortQuery("title"), {
  sort: "title",
  order: "asc",
});

assert.deepEqual(
  candidateJobSortOptions.map(({ value, label, order }) => ({ value, label, order })),
  [
    { value: "createdAt", label: "최신순", order: "desc" },
    { value: "endsOn", label: "마감임박순", order: "asc" },
    { value: "title", label: "제목순", order: "asc" },
  ],
);

async function assertSerializedJobSortRequests() {
  const requestedUrls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    requestedUrls.push(input instanceof Request ? input.url : String(input));
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createCandidateApiClient({
    baseUrl: "https://api.example.test",
    fetcher,
  });

  await client.listJobs({ page: 1, limit: 9, ...toCandidateJobSortQuery("createdAt") });
  await client.listJobs({ page: 1, limit: 9, ...toCandidateJobSortQuery("endsOn") });
  await client.listJobs({ page: 1, limit: 9, ...toCandidateJobSortQuery("title") });

  assert.deepEqual(requestedUrls, [
    "https://api.example.test/api/v1/candidate/jobs?page=1&limit=9&sort=createdAt&order=desc",
    "https://api.example.test/api/v1/candidate/jobs?page=1&limit=9&sort=endsOn&order=asc",
    "https://api.example.test/api/v1/candidate/jobs?page=1&limit=9&sort=title&order=asc",
  ]);
}

assertSerializedJobSortRequests()
  .then(() => console.log("candidate-job-sort.spec: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

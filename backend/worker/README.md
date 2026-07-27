# AI Worker

This package owns the long-running AI job boundary for E-part work.

The first layer is intentionally adapter-based:

- `AiJobQueue` abstracts SQS receive/delete behavior.
- `AiProcessLogRepository` abstracts `ai_process_logs` and `ai_guardrail_logs`.
- `AiWorkerRunner` guarantees `RUNNING -> COMPLETED/FAILED` state transitions.
- `AiWorkerLoop` polls SQS in a long-running process and exits on SIGINT/SIGTERM.
- task handlers do the actual document/STT/follow-up/report/posting draft/embedding work.

Production SQS contract:

- AWS production uses SQS Standard Queue, not FIFO. AI jobs are independent by
  `processLogId`; queue ordering is not a correctness requirement.
- SQS Standard can redeliver a message. Treat `processLogId` as the idempotency
  key and skip expensive AI provider calls when a redelivered job is already
  `COMPLETED`.
- Long-running jobs extend SQS visibility and the `ai_process_logs` lease together.
  `WORKER_VISIBILITY_TIMEOUT_SECONDS` controls both lease duration and message
  visibility; `WORKER_VISIBILITY_HEARTBEAT_MS` must be shorter than that timeout.
- Apply the worker lease migration before real AI traffic. Completed redeliveries
  and concurrent valid leases are acknowledged without calling the provider.

Runtime commands:

- `npm run build`
- `npm start`
- `npm run start:dev`

Local development loads `.env` files before validating worker settings. When the
worker is started from `backend/worker`, the loader reads the project root
`.env` first and then `backend/worker/.env`, so worker-local values can override
shared defaults. Already exported shell variables take precedence over `.env`
file values.

Required runtime environment variables:

- `AI_SQS_QUEUE_URL`
- `AWS_REGION`
- `AI_PROVIDER_API_KEY`
- `S3_BUCKET_NAME`

The `.env.example` file also includes project-level aliases such as `SQS_QUEUE_URL`,
`S3_BUCKET`, and `OPENAI_API_KEY` so the shared environment harness can validate
the common deployment contract. The worker runtime accepts both the `AI_*` /
`S3_BUCKET_NAME` names above and those project-level aliases.

Deployment boundary with A:

- A owns AWS resource creation, IAM permissions, secret injection, and worker restart/deployment.
- E owns the runtime contract above, queue message handling, `ai_process_logs` transitions, and final-save behavior after guardrails.
- The worker must receive SQS/S3/AI provider values through runtime environment variables. Do not put real secret values in git.
- Local `.env.example` files may contain placeholder values only; production values must come from the deployment secret store.

Optional runtime environment variables:

- `AI_PROVIDER_MODE` defaults to `mock`; set `openai` to use OpenAI providers for follow-up questions, report summaries, and posting draft generation.
- `OPENAI_MODEL` defaults to `gpt-4o-mini`.
- `RUN_ANSWER_FACT_CHECK_SMOKE=true npm run smoke:ncs:fact-check` runs the opt-in live fact-check golden matrix. It is excluded from default CI and never prints answer or evidence text.
- `AI_STT_PROVIDER` defaults to `openai`; set `mock` only for isolated local tests that do not need real STT.
- `OPENAI_STT_MODEL` defaults to `gpt-4o-mini-transcribe`.
- `OPENAI_STT_LANGUAGE` defaults to `ko`.
- `WORKER_BATCH_SIZE` defaults to `1`, max `10`.
- `WORKER_POLL_INTERVAL_MS` defaults to `1000`.
- `WORKER_VISIBILITY_TIMEOUT_SECONDS` defaults to `900` and controls both the SQS visibility timeout and process lease duration.
- `WORKER_VISIBILITY_HEARTBEAT_MS` defaults to `300000` and must remain shorter than `WORKER_VISIBILITY_TIMEOUT_SECONDS`.
- `WORKER_REPOSITORY_MODE` is `memory` by default when unset, but integration runs must set it to `prisma` so worker updates are visible through API status polling.
- `PRISMA_CLIENT_MODULE` overrides the Prisma client module path. The default resolves to the API package's `@prisma/client`.

Secrets are read from environment variables only and must not be committed.

import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpenAiSttError } from "./stt-provider";
import { ReanswerRequiredAiWorkerFailure, SttRetryableAiWorkerFailure } from "./worker-errors";

test("classifies OpenAI STT connection failures as STT retryable", () => {
  const error = new Error("Connection error.");
  error.name = "APIConnectionError";

  const classified = classifyOpenAiSttError(error);

  assert.equal(classified instanceof SttRetryableAiWorkerFailure, true);
  assert.equal(classified.message, "Connection error.");
});

test("classifies OpenAI STT fetch failures from the cause chain as STT retryable", () => {
  const error = new Error("STT request failed");
  error.name = "APIConnectionError";
  (error as Error & { cause?: Error }).cause = new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:9");

  const classified = classifyOpenAiSttError(error);

  assert.equal(classified instanceof SttRetryableAiWorkerFailure, true);
  assert.equal(classified.message, "STT request failed");
});

test("classifies OpenAI STT empty or invalid audio failures as reanswer required", () => {
  const error = Object.assign(new Error("Invalid audio: could not decode file"), {
    status: 400
  });

  const classified = classifyOpenAiSttError(error);

  assert.equal(classified instanceof ReanswerRequiredAiWorkerFailure, true);
});

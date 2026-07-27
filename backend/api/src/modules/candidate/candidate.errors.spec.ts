import { strict as assert } from "node:assert";
import { ERROR_CODES } from "@init/common";
import { createCandidateErrorResponse } from "./candidate.errors";
import { CandidateDomainError } from "./candidate.errors";

const response = createCandidateErrorResponse(
  new CandidateDomainError("COMMON_VALIDATION_FAILED", "입력값을 확인해주세요.", 400, [
    { field: "jobId", reason: "jobId must be a positive integer" },
  ]),
  "trace-test",
);

assert.equal(response.error.code, "COMMON_VALIDATION_FAILED");
assert.equal(response.error.message, "입력값을 확인해주세요.");
assert.deepEqual(response.error.details, [{ field: "jobId", reason: "jobId must be a positive integer" }]);
assert.equal(response.meta.traceId, "trace-test");
assert.match(response.meta.timestamp, /^\d{4}-\d{2}-\d{2}T/);

test("candidate error envelope contract", () => {
  assert.equal(response.error.code, "COMMON_VALIDATION_FAILED");
});

test("shared error code registry includes gaze-data retake errors", () => {
  assert.equal(ERROR_CODES.INTERVIEW_GAZE_DATA_INVALID, "INTERVIEW_GAZE_DATA_INVALID");
});

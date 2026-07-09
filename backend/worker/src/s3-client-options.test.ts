import test from "node:test";
import assert from "node:assert/strict";
import { buildS3ClientOptions } from "./s3-client-options";

test("buildS3ClientOptions lowers response checksum validation for LocalStack endpoints", () => {
  const options = buildS3ClientOptions({
    AWS_REGION: "ap-northeast-2",
    AWS_ENDPOINT_URL: "http://localstack:4566",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test"
  });

  assert.equal(options.region, "ap-northeast-2");
  assert.equal(options.endpoint, "http://localstack:4566");
  assert.equal(options.forcePathStyle, true);
  assert.equal(options.responseChecksumValidation, "WHEN_REQUIRED");
  assert.deepEqual(options.credentials, {
    accessKeyId: "test",
    secretAccessKey: "test"
  });
});

test("buildS3ClientOptions keeps AWS S3 response checksum defaults without a local endpoint", () => {
  const options = buildS3ClientOptions({
    AWS_REGION: "ap-northeast-2"
  });

  assert.deepEqual(options, {
    region: "ap-northeast-2",
    endpoint: undefined,
    forcePathStyle: false,
    credentials: undefined
  });
});

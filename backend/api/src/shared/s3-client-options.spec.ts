import { buildS3ClientOptions } from "./s3-client-options";

describe("buildS3ClientOptions", () => {
  it("uses required-only response checksum validation for LocalStack endpoints", () => {
    const options = buildS3ClientOptions({
      AWS_REGION: "ap-northeast-2",
      AWS_ENDPOINT_URL: "http://localhost:14566",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    });

    expect(options).toMatchObject({
      region: "ap-northeast-2",
      endpoint: "http://localhost:14566",
      forcePathStyle: true,
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });
  });

  it("keeps AWS S3 response checksum defaults when no local endpoint is configured", () => {
    const options = buildS3ClientOptions({
      AWS_REGION: "ap-northeast-2",
    });

    expect(options).toEqual({
      region: "ap-northeast-2",
      endpoint: undefined,
      forcePathStyle: false,
      credentials: undefined,
    });
  });
});

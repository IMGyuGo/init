type S3ClientOptions = {
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  responseChecksumValidation?: "WHEN_REQUIRED";
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

type S3ClientEnv = Partial<
  Record<"AWS_REGION" | "AWS_ENDPOINT_URL" | "AWS_ACCESS_KEY_ID" | "AWS_SECRET_ACCESS_KEY", string | undefined>
>;

export function buildS3ClientOptions(
  env: S3ClientEnv = process.env,
  defaultRegion = "ap-northeast-2",
): S3ClientOptions {
  const endpoint = env.AWS_ENDPOINT_URL || undefined;
  return {
    region: env.AWS_REGION ?? defaultRegion,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    ...(isLocalAwsEndpoint(endpoint) ? { responseChecksumValidation: "WHEN_REQUIRED" as const } : {}),
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY
          }
        : undefined
  };
}

function isLocalAwsEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) {
    return false;
  }

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.includes("localstack");
  } catch {
    const normalized = endpoint.toLowerCase();
    return normalized.includes("localhost") || normalized.includes("127.0.0.1") || normalized.includes("localstack");
  }
}

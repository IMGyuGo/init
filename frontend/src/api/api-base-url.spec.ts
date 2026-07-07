import { resolveApiBaseUrl } from "./api-base-url";

function expectEqual(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

expectEqual(
  resolveApiBaseUrl("http://localhost:3001", {
    protocol: "http:",
    hostname: "172.21.101.77",
  }),
  "http://172.21.101.77:3001",
);

expectEqual(
  resolveApiBaseUrl(undefined, {
    protocol: "http:",
    hostname: "172.21.101.77",
  }),
  "http://172.21.101.77:3001",
);

expectEqual(
  resolveApiBaseUrl("https://api.example.com", {
    protocol: "http:",
    hostname: "172.21.101.77",
  }),
  "https://api.example.com",
);

expectEqual(
  resolveApiBaseUrl("http://localhost:3001", {
    protocol: "https:",
    hostname: "init-jungle.cloud",
    origin: "https://init-jungle.cloud",
  }),
  "https://init-jungle.cloud",
);

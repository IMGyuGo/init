import { createCorsOriginMatcher, getAllowedFrontendOrigins } from "./cors-origin";

describe("cors-origin", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("allows configured origins", () => {
    const matcher = createCorsOriginMatcher(["http://localhost:3000", "http://example.local:3000"]);

    expect(matcher("http://example.local:3000")).toBe(true);
  });

  it("allows LAN frontend origins in development", () => {
    process.env.NODE_ENV = "development";
    const matcher = createCorsOriginMatcher(["http://localhost:3000"]);

    expect(matcher("http://172.21.101.77:3000")).toBe(true);
  });

  it("does not allow LAN frontend origins in production unless configured", () => {
    process.env.NODE_ENV = "production";
    const matcher = createCorsOriginMatcher(["http://localhost:3000"]);

    expect(matcher("http://172.21.101.77:3000")).toBe(false);
  });

  it("builds allowed origins from comma separated environment values", () => {
    expect(
      getAllowedFrontendOrigins({
        FRONTEND_ORIGIN: "http://localhost:3000",
        FRONTEND_ALLOWED_ORIGINS: "http://172.21.101.77:3000, http://example.local:3000",
      }),
    ).toEqual(["http://localhost:3000", "http://172.21.101.77:3000", "http://example.local:3000"]);
  });
});

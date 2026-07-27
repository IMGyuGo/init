import { parseAiJobOutput } from "./ai-job-output";

describe("parseAiJobOutput", () => {
  it("parses JSON output refs for AI job consumers", () => {
    expect(parseAiJobOutput('{"items":["Question 1"],"reviewRequired":true}')).toEqual({
      items: ["Question 1"],
      reviewRequired: true
    });
  });

  it("leaves non-JSON output refs unavailable while preserving outputRef separately", () => {
    expect(parseAiJobOutput("s3://reports/1.json")).toBeUndefined();
    expect(parseAiJobOutput(undefined)).toBeUndefined();
  });
});

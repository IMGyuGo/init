import assert from "node:assert/strict";
import test from "node:test";
import { createAiProcessUsage, mergeAiProcessUsage } from "./ai-usage";

test("mergeAiProcessUsage preserves report and NCS evaluator token usage", () => {
  const reportUsage = createAiProcessUsage({
    modelName: "report-model",
    inputTokens: 100,
    outputTokens: 20,
  });
  const ncsUsage = createAiProcessUsage({
    modelName: "ncs-model",
    inputTokens: 70,
    outputTokens: 30,
  });

  const merged = mergeAiProcessUsage(reportUsage, ncsUsage, { processType: "REPORT_GENERATE" });
  const metadata = JSON.parse(merged?.costMetadataJson ?? "{}") as {
    processType?: string;
    stages?: Array<{ modelName?: string }>;
  };

  assert.equal(merged?.modelName, "report-model");
  assert.equal(merged?.inputTokens, 170);
  assert.equal(merged?.outputTokens, 50);
  assert.equal(metadata.processType, "REPORT_GENERATE");
  assert.deepEqual(metadata.stages?.map((stage) => stage.modelName), ["report-model", "ncs-model"]);
});

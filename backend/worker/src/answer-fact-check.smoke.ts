import { ANSWER_FACT_CHECK_GOLDEN_CASES } from "./answer-fact-check.golden";
import { determineFactCheckGate } from "./answer-fact-check";
import { OpenAiAnswerFactCheckProvider } from "./openai-answer-fact-check.provider";
import { loadWorkerEnvFiles } from "./worker-env-file";

async function main(): Promise<void> {
  loadWorkerEnvFiles();
  if (process.env.RUN_ANSWER_FACT_CHECK_SMOKE !== "true") {
    throw new Error("Set RUN_ANSWER_FACT_CHECK_SMOKE=true to run the live fact-check smoke test");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the live fact-check smoke test");
  }
  const provider = new OpenAiAnswerFactCheckProvider(apiKey, model);
  const summaries: Array<Record<string, unknown>> = [];

  for (const golden of ANSWER_FACT_CHECK_GOLDEN_CASES) {
    const result = await provider.evaluate(golden.input);
    const verdicts = Array.from(new Set(result.claims.map((claim) => claim.verdict))).sort();
    const expectedVerdict = golden.claims[0]?.verdict;
    const gateStatus = determineFactCheckGate(result.claims);
    if (!expectedVerdict || !verdicts.includes(expectedVerdict)) {
      throw new Error(`${golden.name}: expected verdict ${expectedVerdict ?? "MISSING"}, received ${verdicts.join(",") || "NO_CLAIMS"}`);
    }
    if (gateStatus !== golden.expectedGateStatus) {
      throw new Error(`${golden.name}: expected gate ${golden.expectedGateStatus}, received ${gateStatus}`);
    }
    summaries.push({
      case: golden.name,
      model: result.model,
      verdicts,
      gateStatus,
    });
  }

  process.stdout.write(`${JSON.stringify({ status: "PASS", cases: summaries }, null, 2)}\n`);
}

void main();

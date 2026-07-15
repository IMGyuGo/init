import { ANSWER_FACT_CHECK_GOLDEN_CASES } from "./answer-fact-check.golden";
import { OpenAiAnswerFactCheckProvider } from "./openai-answer-fact-check.provider";

async function main(): Promise<void> {
  if (process.env.RUN_ANSWER_FACT_CHECK_SMOKE !== "true") {
    throw new Error("Set RUN_ANSWER_FACT_CHECK_SMOKE=true to run the live fact-check smoke test");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for the live fact-check smoke test");
  }
  const result = await new OpenAiAnswerFactCheckProvider(apiKey, model).evaluate(
    ANSWER_FACT_CHECK_GOLDEN_CASES[1]!.input,
  );
  process.stdout.write(`${JSON.stringify({ model: result.model, claims: result.claims }, null, 2)}\n`);
}

void main();

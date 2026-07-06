import { AiProcessUsage } from "./worker.types";

export interface TokenUsageInput {
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  metadata?: Record<string, unknown>;
}

export function createAiProcessUsage(input: TokenUsageInput): AiProcessUsage | undefined {
  const inputTokens = positiveInteger(input.inputTokens);
  const outputTokens = positiveInteger(input.outputTokens);
  const audioSeconds = positiveInteger(input.audioSeconds);
  const hasUsage = input.modelName || inputTokens !== undefined || outputTokens !== undefined || audioSeconds !== undefined;
  if (!hasUsage) {
    return undefined;
  }

  const textInputPrice = positiveNumberFromEnv("AI_TEXT_INPUT_USD_PER_1M_TOKENS");
  const textOutputPrice = positiveNumberFromEnv("AI_TEXT_OUTPUT_USD_PER_1M_TOKENS");
  const sttPrice = positiveNumberFromEnv("AI_STT_USD_PER_MINUTE");
  const estimatedCostUsd = estimateCost({
    inputTokens,
    outputTokens,
    audioSeconds,
    textInputPrice,
    textOutputPrice,
    sttPrice
  });

  return {
    modelName: input.modelName,
    inputTokens,
    outputTokens,
    audioSeconds,
    estimatedCostUsd,
    costMetadataJson: JSON.stringify({
      pricingSource: estimatedCostUsd === undefined ? "UNCONFIGURED_ENV" : "CONFIGURED_ENV",
      textInputUsdPer1MTokens: textInputPrice,
      textOutputUsdPer1MTokens: textOutputPrice,
      sttUsdPerMinute: sttPrice,
      ...input.metadata
    })
  };
}

function estimateCost(input: {
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  textInputPrice?: number;
  textOutputPrice?: number;
  sttPrice?: number;
}): number | undefined {
  let total = 0;
  let priced = false;

  if (input.inputTokens !== undefined && input.textInputPrice !== undefined) {
    total += (input.inputTokens / 1_000_000) * input.textInputPrice;
    priced = true;
  }
  if (input.outputTokens !== undefined && input.textOutputPrice !== undefined) {
    total += (input.outputTokens / 1_000_000) * input.textOutputPrice;
    priced = true;
  }
  if (input.audioSeconds !== undefined && input.sttPrice !== undefined) {
    total += (input.audioSeconds / 60) * input.sttPrice;
    priced = true;
  }

  return priced ? Number(total.toFixed(6)) : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function positiveNumberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

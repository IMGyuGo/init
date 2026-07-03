import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import OpenAI, { toFile } from "openai";
import {
  NonRetryableAiWorkerFailure,
  ReanswerRequiredAiWorkerFailure,
  SttRetryableAiWorkerFailure
} from "./worker-errors";

export interface SttProviderInput {
  audioFileId: number;
  audioS3Key: string;
}

export interface SttProviderResult {
  transcript: string;
  transcriptSource: string;
  model?: string;
}

export interface SttProvider {
  transcribe(input: SttProviderInput): Promise<SttProviderResult>;
}

export interface OpenAiS3SttProviderOptions {
  apiKey: string;
  bucketName: string;
  region: string;
  endpoint?: string;
  model?: string;
  language?: string;
}

export class OpenAiS3SttProvider implements SttProvider {
  private readonly s3: S3Client;
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly language: string;

  constructor(private readonly options: OpenAiS3SttProviderOptions) {
    this.s3 = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: Boolean(options.endpoint),
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          : undefined
    });
    this.openai = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4o-mini-transcribe";
    this.language = options.language ?? "ko";
  }

  async transcribe(input: SttProviderInput): Promise<SttProviderResult> {
    const object = await this.readAudioObject(input.audioS3Key);
    const file = await toFile(object.body, filenameFromStorageKey(input.audioS3Key), {
      type: object.contentType ?? guessContentType(input.audioS3Key)
    });
    const response = await this.createTranscription(file);
    const transcript = normalizeTranscript(response);
    if (!transcript) {
      throw new ReanswerRequiredAiWorkerFailure("STT provider returned empty transcript");
    }

    return {
      transcript,
      transcriptSource: "OPENAI_AUDIO_TRANSCRIPTION",
      model: this.model
    };
  }

  private async readAudioObject(key: string): Promise<{ body: Buffer; contentType?: string }> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.options.bucketName,
        Key: key
      })
    );
    if (!result.Body) {
      throw new NonRetryableAiWorkerFailure(`S3 object body is empty: ${key}`);
    }

    return {
      body: await bodyToBuffer(result.Body),
      contentType: result.ContentType
    };
  }

  private async createTranscription(file: File): Promise<unknown> {
    try {
      return await this.openai.audio.transcriptions.create({
        file,
        model: this.model,
        language: this.language
      });
    } catch (error) {
      throw classifyOpenAiSttError(error);
    }
  }
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function classifyOpenAiSttError(error: unknown): Error {
  const status = errorStatus(error);
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  const reanswerRequiredMessage =
    normalized.includes("corrupt") ||
    normalized.includes("unsupported") ||
    normalized.includes("invalid file") ||
    normalized.includes("invalid audio") ||
    normalized.includes("empty") ||
    normalized.includes("no speech") ||
    normalized.includes("could not decode") ||
    normalized.includes("unrecognized file format");

  if (reanswerRequiredMessage && (status === undefined || status === 400 || status === 415)) {
    return new ReanswerRequiredAiWorkerFailure(message);
  }

  if (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("rate limit") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("network")
  ) {
    return new SttRetryableAiWorkerFailure(message);
  }

  return error instanceof Error ? error : new Error(message);
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const status = (error as { status?: unknown; code?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "STT provider failed";
}

function normalizeTranscript(response: unknown): string {
  if (typeof response === "string") {
    return response.trim();
  }
  if (response && typeof response === "object" && "text" in response) {
    const text = (response as { text?: unknown }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

function filenameFromStorageKey(key: string): string {
  return key.split("/").pop()?.trim() || "interview-answer.webm";
}

function guessContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "video/webm";
}

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { buildS3ClientOptions } from "../../../shared/s3-client-options";

export const INTERVIEW_MEDIA_STORAGE = Symbol("INTERVIEW_MEDIA_STORAGE");

export type InterviewMediaPutObjectInput = {
  key: string;
  body: Buffer;
  contentLength: number;
  contentType: string;
};

export type InterviewMediaStorageObject = {
  body: Buffer | Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
};

export interface InterviewMediaStoragePort {
  putObject(input: InterviewMediaPutObjectInput): Promise<void>;
  getObject(key: string, options?: { range?: string }): Promise<InterviewMediaStorageObject>;
}

export class S3InterviewMediaStorageAdapter implements InterviewMediaStoragePort {
  private readonly client = new S3Client(buildS3ClientOptions());

  private readonly bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;

  async putObject(input: InterviewMediaPutObjectInput): Promise<void> {
    if (!this.bucket) {
      throw new Error("S3_BUCKET or S3_BUCKET_NAME is required.");
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
      }),
    );
  }

  async getObject(key: string, options: { range?: string } = {}): Promise<InterviewMediaStorageObject> {
    if (!this.bucket) {
      throw new Error("S3_BUCKET or S3_BUCKET_NAME is required.");
    }

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: options.range,
      }),
    );
    if (!result.Body) {
      throw new Error("S3 object body is not readable.");
    }

    return {
      body: toReadableBody(result.Body),
      contentType: result.ContentType ?? undefined,
      contentLength: result.ContentLength ?? undefined,
      contentRange: result.ContentRange ?? undefined,
    };
  }
}

export class InMemoryInterviewMediaStorageAdapter implements InterviewMediaStoragePort {
  readonly objects: InterviewMediaPutObjectInput[] = [];

  async putObject(input: InterviewMediaPutObjectInput): Promise<void> {
    this.objects.push(input);
  }

  async getObject(key: string, options: { range?: string } = {}): Promise<InterviewMediaStorageObject> {
    const object = [...this.objects].reverse().find((item) => item.key === key);
    if (!object) {
      throw storageError("NoSuchKey", `Interview media object ${key} was not found.`);
    }

    if (!options.range) {
      return {
        body: Buffer.from(object.body),
        contentType: object.contentType,
        contentLength: object.contentLength,
      };
    }

    const selected = selectBufferRange(object.body, options.range);
    return {
      body: selected.body,
      contentType: object.contentType,
      contentLength: selected.body.byteLength,
      contentRange: `bytes ${selected.start}-${selected.end}/${object.body.byteLength}`,
    };
  }
}

function toReadableBody(body: unknown): Readable {
  if (body instanceof Readable) {
    return body;
  }
  if (typeof body === "object" && body !== null && "transformToWebStream" in body) {
    const webStream = (body as { transformToWebStream(): ReadableStream<Uint8Array> }).transformToWebStream();
    return Readable.fromWeb(webStream as unknown as NodeReadableStream<Uint8Array>);
  }
  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    return Readable.from((async function* toByteArrayStream() {
      const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
      yield Buffer.from(bytes);
    })());
  }
  throw new Error("S3 object body is not readable.");
}

function selectBufferRange(body: Buffer, range: string) {
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    throw storageError("InvalidRange", "Interview media range is invalid.");
  }

  const size = body.byteLength;
  const suffixLength = match[1] ? undefined : Number(match[2]);
  const start = suffixLength === undefined ? Number(match[1]) : Math.max(0, size - suffixLength);
  const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    throw storageError("InvalidRange", "Interview media range is invalid.");
  }

  return { body: body.subarray(start, end + 1), start, end };
}

function storageError(name: "InvalidRange" | "NoSuchKey", message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

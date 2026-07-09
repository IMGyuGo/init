import { Injectable } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";

import { buildS3ClientOptions } from "../../../shared/s3-client-options";
import type {
  CompanyRecruitingStorageAdapterPort,
  CompanyRecruitingStorageObject,
  CompanyRecruitingStoragePutObjectInput,
} from "./company-recruiting.service";

@Injectable()
export class S3CompanyRecruitingStorageAdapter implements CompanyRecruitingStorageAdapterPort {
  private readonly client = new S3Client(buildS3ClientOptions());

  private readonly bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;

  async putObject(input: CompanyRecruitingStoragePutObjectInput): Promise<void> {
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

  async getObject(key: string, options: { range?: string } = {}): Promise<CompanyRecruitingStorageObject> {
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
    const body = result.Body;
    if (!body) {
      throw new Error("S3 object body is not readable.");
    }

    return {
      body: toReadableBody(body),
      contentType: result.ContentType ?? undefined,
      contentLength: result.ContentLength ?? undefined,
      contentRange: result.ContentRange ?? undefined,
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

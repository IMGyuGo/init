import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { buildS3ClientOptions } from "../../../shared/s3-client-options";

export const CANDIDATE_DOCUMENT_STORAGE = Symbol("CANDIDATE_DOCUMENT_STORAGE");

export type CandidateDocumentPutObjectInput = {
  key: string;
  body: Buffer;
  contentLength: number;
  contentType: string;
};

export interface CandidateDocumentStoragePort {
  putObject(input: CandidateDocumentPutObjectInput): Promise<void>;
  deleteObjects(keys: string[]): Promise<{ failedKeys: string[] }>;
}

@Injectable()
export class S3CandidateDocumentStorageAdapter implements CandidateDocumentStoragePort {
  private readonly client = new S3Client(buildS3ClientOptions());

  private readonly bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;

  async putObject(input: CandidateDocumentPutObjectInput): Promise<void> {
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

  async deleteObjects(keys: string[]): Promise<{ failedKeys: string[] }> {
    if (!this.bucket) {
      throw new Error("S3_BUCKET or S3_BUCKET_NAME is required.");
    }

    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    const failedKeys: string[] = [];
    for (let offset = 0; offset < uniqueKeys.length; offset += 1_000) {
      const chunk = uniqueKeys.slice(offset, offset + 1_000);
      try {
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        failedKeys.push(...(response.Errors ?? []).flatMap((error) => (error.Key ? [error.Key] : [])));
      } catch {
        failedKeys.push(...chunk);
      }
    }
    return { failedKeys };
  }
}

export class InMemoryCandidateDocumentStorageAdapter implements CandidateDocumentStoragePort {
  readonly objects: CandidateDocumentPutObjectInput[] = [];

  async putObject(input: CandidateDocumentPutObjectInput): Promise<void> {
    this.objects.push(input);
  }

  async deleteObjects(keys: string[]): Promise<{ failedKeys: string[] }> {
    const keySet = new Set(keys);
    for (let index = this.objects.length - 1; index >= 0; index -= 1) {
      if (keySet.has(this.objects[index]!.key)) {
        this.objects.splice(index, 1);
      }
    }
    return { failedKeys: [] };
  }
}

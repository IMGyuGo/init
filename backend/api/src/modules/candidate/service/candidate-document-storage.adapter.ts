import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
}

export class InMemoryCandidateDocumentStorageAdapter implements CandidateDocumentStoragePort {
  readonly objects: CandidateDocumentPutObjectInput[] = [];

  async putObject(input: CandidateDocumentPutObjectInput): Promise<void> {
    this.objects.push(input);
  }
}

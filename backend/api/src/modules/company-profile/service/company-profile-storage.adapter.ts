import { Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { buildS3ClientOptions } from "../../../shared/s3-client-options";
import type { CompanyProfileStorageAdapterPort, CompanyProfileStoragePutObjectInput } from "./company-profile.service";

@Injectable()
export class S3CompanyProfileStorageAdapter implements CompanyProfileStorageAdapterPort {
  private readonly client = new S3Client(buildS3ClientOptions());

  private readonly bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;

  async putObject(input: CompanyProfileStoragePutObjectInput): Promise<void> {
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

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFParse } from "pdf-parse";
import { buildS3ClientOptions } from "./s3-client-options";
import { NonRetryableAiWorkerFailure } from "./worker-errors";

export interface DocumentTextExtractionInput {
  fileId: number;
  s3Key: string;
}

export interface DocumentTextExtractionResult {
  text: string;
  source: "PDF_TEXT_EXTRACTION";
  pageCount: number;
  truncated: boolean;
}

export interface DocumentTextExtractor {
  extract(input: DocumentTextExtractionInput): Promise<DocumentTextExtractionResult>;
}

interface S3PdfDocumentTextExtractorOptions {
  bucketName: string;
  region: string;
  endpoint?: string;
  maxBytes?: number;
  maxTextChars?: number;
  objectLoader?: (key: string) => Promise<Buffer>;
}

const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_TEXT_CHARS = 200_000;

export class S3PdfDocumentTextExtractor implements DocumentTextExtractor {
  private readonly s3: S3Client;
  private readonly maxBytes: number;
  private readonly maxTextChars: number;

  constructor(private readonly options: S3PdfDocumentTextExtractorOptions) {
    this.s3 = new S3Client(buildS3ClientOptions({
      ...process.env,
      AWS_REGION: options.region,
      AWS_ENDPOINT_URL: options.endpoint,
    }));
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_PDF_BYTES;
    this.maxTextChars = options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  }

  async extract(input: DocumentTextExtractionInput): Promise<DocumentTextExtractionResult> {
    const pdf = this.options.objectLoader
      ? await this.options.objectLoader(input.s3Key)
      : await this.readObject(input.s3Key);
    this.assertPdf(pdf, input.s3Key);

    const parser = new PDFParse({ data: pdf });
    try {
      const result = await parser.getText();
      const normalized = normalizeExtractedText(result.text);
      if (!normalized) {
        throw new NonRetryableAiWorkerFailure(
          "PDF에서 텍스트를 추출할 수 없습니다. 텍스트가 포함된 PDF 이력서를 다시 제출해주세요.",
        );
      }

      const truncated = normalized.length > this.maxTextChars;
      return {
        text: truncated ? normalized.slice(0, this.maxTextChars).trimEnd() : normalized,
        source: "PDF_TEXT_EXTRACTION",
        pageCount: result.total,
        truncated,
      };
    } catch (error) {
      if (error instanceof NonRetryableAiWorkerFailure) {
        throw error;
      }
      throw new NonRetryableAiWorkerFailure(
        `PDF 본문을 읽을 수 없습니다: ${error instanceof Error ? error.message : "invalid PDF"}`,
      );
    } finally {
      await parser.destroy();
    }
  }

  private async readObject(key: string): Promise<Buffer> {
    const result = await this.s3.send(new GetObjectCommand({
      Bucket: this.options.bucketName,
      Key: key,
    }));
    if (!result.Body) {
      throw new NonRetryableAiWorkerFailure(`S3 object body is empty: ${key}`);
    }
    return bodyToBuffer(result.Body);
  }

  private assertPdf(pdf: Buffer, key: string): void {
    if (pdf.length === 0) {
      throw new NonRetryableAiWorkerFailure(`PDF file is empty: ${key}`);
    }
    if (pdf.length > this.maxBytes) {
      throw new NonRetryableAiWorkerFailure(`PDF file exceeds ${this.maxBytes} bytes: ${key}`);
    }
    if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new NonRetryableAiWorkerFailure(`S3 object is not a PDF: ${key}`);
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

export function normalizeExtractedText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

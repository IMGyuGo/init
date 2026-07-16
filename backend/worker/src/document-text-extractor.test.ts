import test from "node:test";
import assert from "node:assert/strict";
import { S3PdfDocumentTextExtractor, normalizeExtractedText } from "./document-text-extractor";

test("S3PdfDocumentTextExtractor parses and normalizes a text PDF", async () => {
  const extractor = new S3PdfDocumentTextExtractor({
    bucketName: "test-bucket",
    region: "ap-northeast-2",
    objectLoader: async () => textPdf("Backend Engineer Resume"),
  });

  const result = await extractor.extract({ fileId: 9, s3Key: "candidate/1/resume.pdf" });

  assert.match(result.text, /Backend Engineer Resume/);
  assert.equal(result.source, "PDF_TEXT_EXTRACTION");
  assert.equal(result.pageCount, 1);
  assert.equal(result.truncated, false);
});

test("S3PdfDocumentTextExtractor rejects non-PDF objects before parsing", async () => {
  const extractor = new S3PdfDocumentTextExtractor({
    bucketName: "test-bucket",
    region: "ap-northeast-2",
    objectLoader: async () => Buffer.from("not a pdf"),
  });

  await assert.rejects(
    () => extractor.extract({ fileId: 9, s3Key: "candidate/1/resume.pdf" }),
    /S3 object is not a PDF/,
  );
});

test("S3PdfDocumentTextExtractor caps extracted text without storing raw PDF bytes", async () => {
  const extractor = new S3PdfDocumentTextExtractor({
    bucketName: "test-bucket",
    region: "ap-northeast-2",
    maxTextChars: 10,
    objectLoader: async () => textPdf("Backend Engineer Resume"),
  });

  const result = await extractor.extract({ fileId: 9, s3Key: "candidate/1/resume.pdf" });

  assert.equal(result.text.length, 10);
  assert.equal(result.truncated, true);
});

test("normalizeExtractedText removes PDF control noise and excess blank lines", () => {
  assert.equal(normalizeExtractedText("  A\u0000  \r\n\r\n\r\n B  \r\n"), "A\n\n B");
});

function textPdf(text: string): Buffer {
  const content = `BT\n/F1 12 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

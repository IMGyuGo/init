import { AiResultRepository, FailedReportRecord } from "./ai-result.repository";
import { AiWorkerJob, FailureReason } from "./worker.types";

interface ReportJobInput {
  payload?: {
    reportId?: unknown;
    reportType?: unknown;
    applicationId?: unknown;
    sessionId?: unknown;
    documentId?: unknown;
    fileId?: unknown;
  };
}

export function createDocumentExtractionStartHandler(results: AiResultRepository) {
  return async (job: AiWorkerJob): Promise<void> => {
    if (job.processType !== "DOCUMENT_EXTRACT") {
      return;
    }

    const documentRef = documentRefFromJob(job);
    if (!documentRef) {
      return;
    }

    await results.markDocumentExtractionStarted(documentRef);
  };
}

export function createReportFailureHandler(results: AiResultRepository) {
  return async (job: AiWorkerJob, failure: FailureReason): Promise<void> => {
    if (job.processType === "DOCUMENT_EXTRACT") {
      const documentRef = documentRefFromJob(job);
      if (documentRef) {
        await results.markDocumentExtractionFailed(documentRef);
      }
      return;
    }

    if (job.processType !== "REPORT_GENERATE") {
      return;
    }

    const failedReport = failedReportFromJob(job, failure);
    if (!failedReport) {
      return;
    }

    await results.markReportFailed(failedReport);
  };
}

function documentRefFromJob(job: AiWorkerJob): { documentId: number; fileId?: number } | undefined {
  try {
    const input = JSON.parse(job.inputRef) as ReportJobInput;
    const documentId = Number(input.payload?.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return undefined;
    }
    const fileId = Number(input.payload?.fileId);
    return {
      documentId,
      ...(Number.isInteger(fileId) && fileId > 0 ? { fileId } : {})
    };
  } catch {
    return undefined;
  }
}

function failedReportFromJob(job: AiWorkerJob, failure: FailureReason): FailedReportRecord | undefined {
  try {
    const input = JSON.parse(job.inputRef) as ReportJobInput;
    const reportId = Number(input.payload?.reportId);
    const reportType = input.payload?.reportType;
    if (!Number.isInteger(reportId) || reportId <= 0 || !isReportType(reportType)) {
      return undefined;
    }

    return {
      reportId,
      reportType,
      ...positiveRef(input.payload?.applicationId, "applicationId"),
      ...positiveRef(input.payload?.sessionId, "sessionId"),
      failureCategory: failure.category,
      failureReason: failure.reason
    };
  } catch {
    return undefined;
  }
}

function isReportType(value: unknown): value is FailedReportRecord["reportType"] {
  return value === "RECRUITING_REPORT" || value === "MOCK_INTERVIEW_REPORT";
}

function positiveRef(value: unknown, key: "applicationId" | "sessionId"): Partial<Pick<FailedReportRecord, "applicationId" | "sessionId">> {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? { [key]: parsed } : {};
}

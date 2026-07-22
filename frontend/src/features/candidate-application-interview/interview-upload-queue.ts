import type {
  RuntimeQuestionView,
  SaveInterviewAnswerRequest,
  SaveInterviewAnswerResponse,
} from "./api";

export type InterviewUploadJobState =
  | "QUEUED"
  | "UPLOADING"
  | "SAVING_ANSWER"
  | "RETRY_WAIT"
  | "FAILED";

export interface InterviewUploadedMedia {
  fileId: number;
  storageKey: string;
}

export interface InterviewUploadJob {
  uploadRequestId: string;
  sessionId: number;
  questionId: number;
  question?: RuntimeQuestionView;
  mode: "mock" | "recruiting";
  metricOrigin?: string;
  autoAdvance?: boolean;
  mediaKind: "video" | "audio";
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  answerRequest: Omit<
    SaveInterviewAnswerRequest,
    "videoFileId" | "videoFile" | "audioFileId" | "audioFile"
  >;
  state: InterviewUploadJobState;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt?: number;
  uploadedFile?: InterviewUploadedMedia;
  lastError?: string;
}

export interface InterviewUploadJobStore {
  list(): Promise<InterviewUploadJob[]>;
  put(job: InterviewUploadJob): Promise<void>;
  delete(uploadRequestId: string): Promise<void>;
}

export interface InterviewUploadQueueHandlers {
  upload(job: InterviewUploadJob): Promise<InterviewUploadedMedia>;
  saveAnswer(job: InterviewUploadJob, request: SaveInterviewAnswerRequest): Promise<SaveInterviewAnswerResponse>;
  onCompleted?(job: InterviewUploadJob, result: SaveInterviewAnswerResponse): void | Promise<void>;
  onStateChange?(jobs: InterviewUploadJob[]): void;
}

export interface InterviewUploadQueueOptions {
  retryDelaysMs?: readonly number[];
  isOnline?: () => boolean;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}

const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

export class InterviewUploadQueue {
  private drainPromise: Promise<void> | null = null;
  private retryScheduled = false;
  private readonly retryDelaysMs: readonly number[];
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;

  constructor(
    private readonly store: InterviewUploadJobStore,
    private readonly handlers: InterviewUploadQueueHandlers,
    options: InterviewUploadQueueOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.isOnline = options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  }

  async enqueue(job: InterviewUploadJob): Promise<void> {
    await this.store.put({ ...job, state: "QUEUED", updatedAt: this.now() });
    await this.emitState();
    this.schedule(() => void this.resume(), 0);
  }

  async resume(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  async list(): Promise<InterviewUploadJob[]> {
    return this.sortedJobs();
  }

  async retryFailed(uploadRequestId: string): Promise<void> {
    const job = (await this.store.list()).find(
      (candidate) => candidate.uploadRequestId === uploadRequestId,
    );
    if (!job || job.state !== "FAILED") return;
    await this.store.put({
      ...job,
      state: "QUEUED",
      retryCount: 0,
      updatedAt: this.now(),
      nextAttemptAt: undefined,
      lastError: undefined,
    });
    await this.emitState();
    await this.resume();
  }

  private async drain(): Promise<void> {
    while (true) {
      const jobs = await this.sortedJobs();
      await this.handlers.onStateChange?.(jobs);
      const job = jobs[0];
      if (!job || job.state === "FAILED") {
        return;
      }
      if (!this.isOnline()) {
        return;
      }
      if (job.state === "RETRY_WAIT" && (job.nextAttemptAt ?? 0) > this.now()) {
        this.scheduleRetry((job.nextAttemptAt ?? this.now()) - this.now());
        return;
      }

      try {
        const completed = await this.process(job);
        await this.store.delete(job.uploadRequestId);
        await this.handlers.onCompleted?.(completed.job, completed.result);
        await this.emitState();
      } catch (error) {
        const latestJob = (await this.store.list()).find(
          (candidate) => candidate.uploadRequestId === job.uploadRequestId,
        ) ?? job;
        const terminal = isTerminalInterviewUploadError(error);
        const retryCount = terminal ? latestJob.retryCount : latestJob.retryCount + 1;
        if (terminal || retryCount > this.retryDelaysMs.length) {
          await this.store.put({
            ...latestJob,
            state: "FAILED",
            retryCount,
            updatedAt: this.now(),
            lastError: toInterviewUploadErrorMessage(error),
          });
          await this.emitState();
          return;
        }

        const retryDelayMs = this.retryDelaysMs[retryCount - 1] ?? 0;
        await this.store.put({
          ...latestJob,
          state: "RETRY_WAIT",
          retryCount,
          nextAttemptAt: this.now() + retryDelayMs,
          updatedAt: this.now(),
          lastError: toInterviewUploadErrorMessage(error),
        });
        await this.emitState();
        if (retryDelayMs > 0) {
          this.scheduleRetry(retryDelayMs);
          return;
        }
      }
    }
  }

  private async process(job: InterviewUploadJob): Promise<{
    job: InterviewUploadJob;
    result: SaveInterviewAnswerResponse;
  }> {
    let current = job;
    if (!current.uploadedFile) {
      current = { ...current, state: "UPLOADING", updatedAt: this.now(), nextAttemptAt: undefined };
      await this.store.put(current);
      await this.emitState();
      const uploadedFile = await this.handlers.upload(current);
      current = {
        ...current,
        uploadedFile,
        state: "SAVING_ANSWER",
        updatedAt: this.now(),
        lastError: undefined,
      };
      await this.store.put(current);
      await this.emitState();
    } else {
      current = { ...current, state: "SAVING_ANSWER", updatedAt: this.now(), nextAttemptAt: undefined };
      await this.store.put(current);
    }

    const request: SaveInterviewAnswerRequest = {
      ...current.answerRequest,
      ...(current.mediaKind === "video"
        ? { videoFileId: current.uploadedFile!.fileId }
        : { audioFileId: current.uploadedFile!.fileId }),
    };
    const result = await this.handlers.saveAnswer(current, request);
    return { job: current, result };
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryScheduled) return;
    this.retryScheduled = true;
    this.schedule(() => {
      this.retryScheduled = false;
      void this.resume();
    }, Math.max(0, delayMs));
  }

  private async sortedJobs(): Promise<InterviewUploadJob[]> {
    return (await this.store.list()).sort((left, right) =>
      left.createdAt - right.createdAt || left.questionId - right.questionId,
    );
  }

  private async emitState(): Promise<void> {
    await this.handlers.onStateChange?.(await this.sortedJobs());
  }
}

export function findOptimisticNextInterviewQuestion(
  questions: readonly RuntimeQuestionView[],
  answeredQuestionId: number,
): RuntimeQuestionView | undefined {
  const answeredQuestionIndex = questions.findIndex(
    (question) => question.questionId === answeredQuestionId,
  );
  if (answeredQuestionIndex < 0) return undefined;
  return questions.slice(answeredQuestionIndex + 1).find((question) => !question.answered);
}

export class MemoryInterviewUploadJobStore implements InterviewUploadJobStore {
  private readonly jobs = new Map<string, InterviewUploadJob>();

  constructor(initialJobs: InterviewUploadJob[] = []) {
    initialJobs.forEach((job) => this.jobs.set(job.uploadRequestId, job));
  }

  async list(): Promise<InterviewUploadJob[]> {
    return [...this.jobs.values()];
  }

  async put(job: InterviewUploadJob): Promise<void> {
    this.jobs.set(job.uploadRequestId, job);
  }

  async delete(uploadRequestId: string): Promise<void> {
    this.jobs.delete(uploadRequestId);
  }
}

export class IndexedDbInterviewUploadJobStore implements InterviewUploadJobStore {
  private readonly databasePromise: Promise<IDBDatabase>;

  constructor(databaseName = "interview-upload-queue") {
    this.databasePromise = openInterviewUploadDatabase(databaseName);
  }

  async list(): Promise<InterviewUploadJob[]> {
    const database = await this.databasePromise;
    return requestToPromise(database.transaction("jobs", "readonly").objectStore("jobs").getAll());
  }

  async put(job: InterviewUploadJob): Promise<void> {
    const database = await this.databasePromise;
    const transaction = database.transaction("jobs", "readwrite");
    transaction.objectStore("jobs").put(job);
    await transactionToPromise(transaction);
  }

  async delete(uploadRequestId: string): Promise<void> {
    const database = await this.databasePromise;
    const transaction = database.transaction("jobs", "readwrite");
    transaction.objectStore("jobs").delete(uploadRequestId);
    await transactionToPromise(transaction);
  }
}

export async function createInterviewUploadJobStore(databaseName?: string): Promise<{
  store: InterviewUploadJobStore;
  persistent: boolean;
}> {
  if (typeof indexedDB === "undefined") {
    return { store: new MemoryInterviewUploadJobStore(), persistent: false };
  }
  try {
    const store = new IndexedDbInterviewUploadJobStore(databaseName);
    await store.list();
    return { store, persistent: true };
  } catch {
    return { store: new MemoryInterviewUploadJobStore(), persistent: false };
  }
}

function openInterviewUploadDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("jobs")) {
        request.result.createObjectStore("jobs", { keyPath: "uploadRequestId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function isTerminalInterviewUploadError(error: unknown): boolean {
  const status = getInterviewUploadErrorStatus(error);
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function getInterviewUploadErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const status = value.status ?? value.statusCode ?? value.response?.status;
  return typeof status === "number" ? status : undefined;
}

function toInterviewUploadErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "Interview upload failed.";
}

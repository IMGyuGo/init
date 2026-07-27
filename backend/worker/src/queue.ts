import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  MessageSystemAttributeName,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { AiQueueMessage, AiWorkerJob } from "./worker.types";

export interface AiJobQueue {
  receive(maxMessages: number): Promise<AiQueueMessage[]>;
  publish(job: AiWorkerJob): Promise<void>;
  extendVisibility(message: AiQueueMessage, timeoutSeconds: number): Promise<void>;
  delete(message: AiQueueMessage): Promise<void>;
}

export class InMemoryAiJobQueue implements AiJobQueue {
  readonly deletedMessageIds: string[] = [];
  readonly visibilityExtensions: Array<{ messageId: string; timeoutSeconds: number }> = [];

  constructor(private readonly messages: AiQueueMessage[]) {}

  async receive(maxMessages: number): Promise<AiQueueMessage[]> {
    return this.messages.slice(0, maxMessages);
  }

  async publish(job: AiWorkerJob): Promise<void> {
    this.messages.push({
      messageId: `memory-${job.processLogId}-${this.messages.length + 1}`,
      receiptHandle: `memory-receipt-${job.processLogId}-${this.messages.length + 1}`,
      job,
      receiveCount: 1,
    });
  }

  async delete(message: AiQueueMessage): Promise<void> {
    this.deletedMessageIds.push(message.messageId);
    const index = this.messages.findIndex((item) => item.messageId === message.messageId);
    if (index >= 0) {
      this.messages.splice(index, 1);
    }
  }

  async extendVisibility(message: AiQueueMessage, timeoutSeconds: number): Promise<void> {
    this.visibilityExtensions.push({ messageId: message.messageId, timeoutSeconds });
  }

}

export class SqsAiJobQueue implements AiJobQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string
  ) {}

  async receive(maxMessages: number): Promise<AiQueueMessage[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(Math.max(maxMessages, 1), 10),
        MessageSystemAttributeNames: [MessageSystemAttributeName.ApproximateReceiveCount],
        WaitTimeSeconds: 10
      })
    );

    return (result.Messages ?? []).map((message) => {
      if (!message.MessageId || !message.ReceiptHandle || !message.Body) {
        throw new Error("SQS message is missing MessageId, ReceiptHandle, or Body.");
      }

      return {
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
        job: JSON.parse(message.Body),
        receiveCount: parseReceiveCount(message.Attributes?.ApproximateReceiveCount)
      };
    });
  }

  async publish(job: AiWorkerJob): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(job),
        MessageAttributes: {
          processType: { DataType: "String", StringValue: job.processType },
          processLogId: { DataType: "Number", StringValue: String(job.processLogId) },
        },
      })
    );
  }

  async extendVisibility(message: AiQueueMessage, timeoutSeconds: number): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.receiptHandle,
        VisibilityTimeout: timeoutSeconds,
      })
    );
  }

  async delete(message: AiQueueMessage): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.receiptHandle
      })
    );
  }
}

function parseReceiveCount(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function createAiJobQueue(env: NodeJS.ProcessEnv = process.env): AiJobQueue {
  const queueUrl = env.AI_SQS_QUEUE_URL ?? env.SQS_QUEUE_URL;
  if (queueUrl) {
    return new SqsAiJobQueue(
      new SQSClient({
        region: env.AWS_REGION ?? "ap-northeast-2",
        endpoint: env.AWS_ENDPOINT_URL,
      }),
      queueUrl
    );
  }

  return new InMemoryAiJobQueue([]);
}

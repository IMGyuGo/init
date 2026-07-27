import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AiProcessType } from "../report.types";

export const AI_JOB_QUEUE_PUBLISHER = Symbol("AI_JOB_QUEUE_PUBLISHER");

export interface AiJobQueueMessage {
  processLogId: number;
  processType: AiProcessType;
  inputRef: string;
  attempt: number;
}

export interface AiJobQueuePublisher {
  publish(message: AiJobQueueMessage): Promise<void>;
}

export class InMemoryAiJobQueuePublisher implements AiJobQueuePublisher {
  readonly messages: AiJobQueueMessage[] = [];

  async publish(message: AiJobQueueMessage): Promise<void> {
    this.messages.push(message);
  }
}

export class SqsAiJobQueuePublisher implements AiJobQueuePublisher {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string
  ) {}

  async publish(message: AiJobQueueMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          processType: {
            DataType: "String",
            StringValue: message.processType
          },
          processLogId: {
            DataType: "Number",
            StringValue: String(message.processLogId)
          }
        }
      })
    );
  }
}

export function createAiJobQueuePublisher(env: NodeJS.ProcessEnv = process.env): AiJobQueuePublisher {
  const queueUrl = env.AI_SQS_QUEUE_URL ?? env.SQS_QUEUE_URL;
  if (queueUrl) {
    return new SqsAiJobQueuePublisher(
      new SQSClient({
        region: env.AWS_REGION ?? "ap-northeast-2",
        endpoint: env.AWS_ENDPOINT_URL,
      }),
      queueUrl
    );
  }

  return new InMemoryAiJobQueuePublisher();
}

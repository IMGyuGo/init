import { SQSClient } from "@aws-sdk/client-sqs";
import { SqsAiJobQueuePublisher, createAiJobQueuePublisher } from "./ai-job-queue.publisher";

describe("SqsAiJobQueuePublisher", () => {
  it("publishes AI worker jobs to SQS with process attributes", async () => {
    const sent: unknown[] = [];
    const client = {
      send: jest.fn(async (command: unknown) => {
        sent.push(command);
      })
    } as unknown as SQSClient;
    const publisher = new SqsAiJobQueuePublisher(client, "https://sqs.local/init-ai");

    await publisher.publish({
      processLogId: 10,
      processType: "DOCUMENT_EXTRACT",
      inputRef: "{\"documentId\":1}",
      attempt: 1
    });

    expect(client.send).toHaveBeenCalledTimes(1);
    expect((sent[0] as { input: Record<string, unknown> }).input).toMatchObject({
      QueueUrl: "https://sqs.local/init-ai",
      MessageAttributes: {
        processType: {
          DataType: "String",
          StringValue: "DOCUMENT_EXTRACT"
        },
        processLogId: {
          DataType: "Number",
          StringValue: "10"
        }
      }
    });
  });

  it("selects the SQS publisher when AI_SQS_QUEUE_URL is configured", () => {
    const publisher = createAiJobQueuePublisher({
      AI_SQS_QUEUE_URL: "https://sqs.local/init-ai",
      AWS_REGION: "ap-northeast-2"
    });

    expect(publisher).toBeInstanceOf(SqsAiJobQueuePublisher);
  });
});

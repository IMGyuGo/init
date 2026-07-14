import test from "node:test";
import assert from "node:assert/strict";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SqsAiJobQueue, createAiJobQueue } from "./queue";

test("SqsAiJobQueue receives worker jobs from SQS messages", async () => {
  const client = {
    async send(command: unknown) {
      const input = (command as { input: Record<string, unknown> }).input;
      assert.equal(input.QueueUrl, "https://sqs.local/init-ai");
      assert.deepEqual(input.MessageSystemAttributeNames, ["ApproximateReceiveCount"]);
      return {
        Messages: [
          {
            MessageId: "message-1",
            ReceiptHandle: "receipt-1",
            Attributes: {
              ApproximateReceiveCount: "2"
            },
            Body: JSON.stringify({
              processLogId: 1,
              processType: "REPORT_GENERATE",
              inputRef: "report:1",
              attempt: 1
            })
          }
        ]
      };
    }
  } as unknown as SQSClient;
  const queue = new SqsAiJobQueue(client, "https://sqs.local/init-ai");

  const messages = await queue.receive(5);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].messageId, "message-1");
  assert.equal(messages[0].receiveCount, 2);
  assert.deepEqual(messages[0].job, {
    processLogId: 1,
    processType: "REPORT_GENERATE",
    inputRef: "report:1",
    attempt: 1
  });
});

test("SqsAiJobQueue publishes follow-up jobs with process metadata", async () => {
  const sentInputs: Array<Record<string, unknown>> = [];
  const client = {
    async send(command: unknown) {
      sentInputs.push((command as { input: Record<string, unknown> }).input);
      return {};
    },
  } as unknown as SQSClient;
  const queue = new SqsAiJobQueue(client, "https://sqs.local/init-ai");
  const job = {
    processLogId: 12,
    processType: "RESUME_QUESTION_GENERATE" as const,
    inputRef: JSON.stringify({ applicationId: 101, inputVersion: "input-101" }),
    attempt: 1,
  };

  await queue.publish(job);

  assert.equal(sentInputs[0].QueueUrl, "https://sqs.local/init-ai");
  assert.equal(sentInputs[0].MessageBody, JSON.stringify(job));
  assert.deepEqual(sentInputs[0].MessageAttributes, {
    processType: { DataType: "String", StringValue: "RESUME_QUESTION_GENERATE" },
    processLogId: { DataType: "Number", StringValue: "12" },
  });
});

test("SqsAiJobQueue deletes processed SQS messages by receipt handle", async () => {
  const sentInputs: Array<Record<string, unknown>> = [];
  const client = {
    async send(command: unknown) {
      sentInputs.push((command as { input: Record<string, unknown> }).input);
      return {};
    }
  } as unknown as SQSClient;
  const queue = new SqsAiJobQueue(client, "https://sqs.local/init-ai");

  await queue.delete({
    messageId: "message-1",
    receiptHandle: "receipt-1",
    job: {
      processLogId: 1,
      processType: "REPORT_GENERATE",
      inputRef: "report:1",
      attempt: 1
    }
  });

  assert.deepEqual(sentInputs[0], {
    QueueUrl: "https://sqs.local/init-ai",
    ReceiptHandle: "receipt-1"
  });
});

test("createAiJobQueue selects SQS when AI_SQS_QUEUE_URL is configured", () => {
  const queue = createAiJobQueue({
    AI_SQS_QUEUE_URL: "https://sqs.local/init-ai",
    AWS_REGION: "ap-northeast-2"
  });

  assert.equal(queue instanceof SqsAiJobQueue, true);
});

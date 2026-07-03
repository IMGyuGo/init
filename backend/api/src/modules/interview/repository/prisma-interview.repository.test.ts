import { strict as assert } from "node:assert";
import { QuestionType as PrismaQuestionType } from "@prisma/client";
import { PrismaInterviewRepository } from "./prisma-interview.repository";

describe("PrismaInterviewRepository", () => {
  it("uses the active company question set before the posting question bank for recruiting runtime", async () => {
    let postingQuestionBankQueried = false;
    const prisma = {
      interviewQuestionSet: {
        async findFirst(args: { where: { postingId: bigint; status: string } }) {
          assert.deepEqual(args.where, { postingId: 1n, status: "ACTIVE" });

          return {
            items: [
              {
                sortOrder: 2,
                question: recruitingQuestion(1001n, PrismaQuestionType.TECHNICAL, "NestJS 장애 대응 경험을 설명해주세요."),
              },
              {
                sortOrder: 1,
                question: recruitingQuestion(1002n, PrismaQuestionType.CLOSING, "이 JD에서 가장 자신 있는 업무를 설명해주세요."),
              },
              {
                sortOrder: 3,
                question: recruitingQuestion(1003n, PrismaQuestionType.FOLLOW_UP, "런타임 기본 질문에 섞이면 안 되는 꼬리질문입니다."),
              },
              {
                sortOrder: 4,
                question: { ...recruitingQuestion(1004n, PrismaQuestionType.EXPERIENCE, "비활성 질문입니다."), isActive: false },
              },
              {
                sortOrder: 5,
                question: { ...recruitingQuestion(1005n, PrismaQuestionType.SITUATION, "다른 공고 질문입니다."), postingId: 2n },
              },
            ],
          };
        },
      },
      question: {
        async findMany() {
          postingQuestionBankQueried = true;
          throw new Error("posting question bank should not be queried when an active question set exists");
        },
      },
    };
    const repository = new PrismaInterviewRepository(prisma as never);

    const questions = await repository.listQuestions({
      interviewType: "RECRUITING",
      postingId: 1,
    });

    assert.equal(postingQuestionBankQueried, false);
    assert.deepEqual(
      questions.map((question) => question.questionId),
      [1002, 1001],
    );
    assert.deepEqual(
      questions.map((question) => question.sortOrder),
      [1, 2],
    );
    assert.deepEqual(
      questions.map((question) => question.content),
      ["이 JD에서 가장 자신 있는 업무를 설명해주세요.", "NestJS 장애 대응 경험을 설명해주세요."],
    );
  });
});

function recruitingQuestion(questionId: bigint, questionType: PrismaQuestionType, content: string) {
  return {
    questionId,
    companyId: 1n,
    postingId: 1n,
    criterionId: 1n,
    questionType,
    content,
    isActive: true,
  };
}

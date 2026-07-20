import type { InterviewAnswerInput } from "../report.types";
import {
  SALTLUX_FIXED_DEMO,
  isSaltluxFixedDemoPosting,
} from "../../../shared/saltlux-fixed-demo";

export function shouldUseSaltluxFixedDemoReport(input: {
  companyName?: string | null;
  jobTitle?: string | null;
  sessionMode?: "STANDARD" | "DEMO_PRESET";
  answers: InterviewAnswerInput[];
}) {
  if (!isSaltluxFixedDemoPosting(input.companyName, input.jobTitle)) return false;
  if (input.sessionMode === "DEMO_PRESET") return true;
  if (input.answers.length !== 3) return false;

  const common = input.answers.find((answer) =>
    answer.isFollowUpAnswer !== true &&
    normalize(answer.question) === normalize(SALTLUX_FIXED_DEMO.questions.common),
  );
  const personalized = input.answers.find((answer) =>
    answer.isFollowUpAnswer !== true &&
    normalize(answer.question) === normalize(SALTLUX_FIXED_DEMO.questions.personalized),
  );
  if (!common || !personalized) return false;

  return input.answers.some((answer) =>
    answer.isFollowUpAnswer === true &&
    answer.parentAnswerId === personalized.answerId &&
    normalize(answer.question) === normalize(SALTLUX_FIXED_DEMO.questions.followUp),
  );
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

import { CandidateMockInterviewRuntimePage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function CandidateMockInterviewRuntimeRoute({ params }: Props) {
  const { sessionId } = await params;
  return <CandidateMockInterviewRuntimePage sessionId={Number(sessionId)} />;
}

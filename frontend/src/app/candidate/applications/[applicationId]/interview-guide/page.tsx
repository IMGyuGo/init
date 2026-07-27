import { CandidateInterviewGuidePage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ applicationId: string }>;
};

export default async function CandidateInterviewGuideRoute({ params }: Props) {
  const { applicationId } = await params;
  return <CandidateInterviewGuidePage applicationId={Number(applicationId)} />;
}

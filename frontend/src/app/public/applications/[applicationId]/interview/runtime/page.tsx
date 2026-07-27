import { PublicCandidateInterviewPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ applicationId: string }>;
};

export default async function PublicCandidateInterviewRuntimeRoute({ params }: Props) {
  const { applicationId } = await params;
  return <PublicCandidateInterviewPage applicationId={Number(applicationId)} />;
}

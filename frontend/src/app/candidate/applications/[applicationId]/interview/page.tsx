import { CandidateInterviewPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ applicationId: string }>;
};

export default async function CandidateInterviewRoute({ params }: Props) {
  const { applicationId } = await params;
  return <CandidateInterviewPage applicationId={Number(applicationId)} />;
}

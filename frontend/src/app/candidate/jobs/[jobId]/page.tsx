import { CandidateJobDetailPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ jobId: string }>;
};

export default async function CandidateJobDetailRoute({ params }: Props) {
  const { jobId } = await params;
  return <CandidateJobDetailPage jobId={Number(jobId)} />;
}

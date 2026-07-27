import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ jobId: string }>;
};

export default async function CandidateJobApplyRoute({ params }: Props) {
  const { jobId } = await params;
  redirect(`/candidate/jobs/${Number(jobId)}?apply=1`);
}

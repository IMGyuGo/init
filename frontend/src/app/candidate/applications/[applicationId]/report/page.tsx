import { CandidateApplicationReportPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ applicationId: string }>;
};

export default async function CandidateApplicationReportRoute({ params }: Props) {
  const { applicationId } = await params;
  return <CandidateApplicationReportPage applicationId={Number(applicationId)} />;
}

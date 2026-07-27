import { CandidateMockReportDetailPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = {
  params: Promise<{ reportId: string }>;
};

export default async function CandidateMockReportDetailRoute({ params }: Props) {
  const { reportId } = await params;
  return <CandidateMockReportDetailPage reportId={Number(reportId)} />;
}

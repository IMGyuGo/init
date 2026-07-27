import { ApplicantEvaluationPage } from "@/features/company-recruiting/ApplicantEvaluationPage";

type Props = {
  params: Promise<{ applicantId: string }>;
};

export default async function ApplicantEvaluationRoute({ params }: Props) {
  const { applicantId } = await params;
  return <ApplicantEvaluationPage applicantId={Number(applicantId)} />;
}

import { CompanyInterviewSettingsPage } from "@/features/company-interview-criteria";

type Props = {
  params: Promise<{ recruitmentId: string }>;
};

export default async function RecruitmentInterviewSettingsRoute({ params }: Props) {
  const { recruitmentId } = await params;
  return <CompanyInterviewSettingsPage postingId={Number(recruitmentId)} />;
}

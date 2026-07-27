import { RecruitmentSettingsPage } from "@/features/company-recruiting/RecruitmentSettingsPage";

type Props = {
  params: Promise<{ recruitmentId: string }>;
};

export default async function RecruitmentSettingsRoute({ params }: Props) {
  const { recruitmentId } = await params;
  return <RecruitmentSettingsPage recruitmentId={Number(recruitmentId)} />;
}

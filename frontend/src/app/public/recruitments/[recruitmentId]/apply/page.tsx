import { PublicRecruitmentApplyPage } from "@/features/company-recruiting/PublicRecruitmentApplyPage";

type Props = {
  params: Promise<{ recruitmentId: string }>;
};

export default async function PublicRecruitmentApplyRoute({ params }: Props) {
  const { recruitmentId } = await params;
  return <PublicRecruitmentApplyPage recruitmentId={Number(recruitmentId)} />;
}

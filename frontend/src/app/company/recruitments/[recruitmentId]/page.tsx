import { RecruitmentDetailPage } from "@/features/company-recruiting/RecruitmentDetailPage";

type Props = {
  params: Promise<{ recruitmentId: string }>;
};

export default async function RecruitmentDetailRoute({ params }: Props) {
  const { recruitmentId } = await params;
  return <RecruitmentDetailPage recruitmentId={Number(recruitmentId)} />;
}

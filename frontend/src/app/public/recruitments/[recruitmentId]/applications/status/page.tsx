import { PublicApplicationStatusPage } from "@/features/company-recruiting/PublicApplicationStatusPage";

type Props = {
  params: Promise<{ recruitmentId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicApplicationStatusRoute({ params, searchParams }: Props) {
  const { recruitmentId } = await params;
  const { token } = await searchParams;
  return (
    <PublicApplicationStatusPage
      backHref={`/public/recruitments/${Number(recruitmentId)}/apply`}
      token={token}
    />
  );
}

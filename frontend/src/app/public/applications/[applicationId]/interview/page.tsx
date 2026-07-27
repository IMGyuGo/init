import { PublicApplicationInterviewBridgePage } from "@/features/company-recruiting/PublicApplicationInterviewBridgePage";

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PublicApplicationInterviewRoute({ params, searchParams }: Props) {
  const { applicationId } = await params;
  const { token } = await searchParams;
  return <PublicApplicationInterviewBridgePage applicationId={Number(applicationId)} token={token} />;
}

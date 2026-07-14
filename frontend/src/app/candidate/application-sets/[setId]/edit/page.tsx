import { CandidateApplicationSetEditorPage } from "@/features/candidate-application-interview/CandidatePages";

type Props = { params: Promise<{ setId: string }> };

export default async function EditCandidateApplicationSetRoute({ params }: Props) {
  const { setId } = await params;
  return <CandidateApplicationSetEditorPage folderId={Number(setId)} />;
}

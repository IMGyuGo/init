type Props = {
  params: Promise<{ applicationId: string }>;
};

export default async function PublicCandidateInterviewCompleteRoute({ params }: Props) {
  const { applicationId } = await params;

  return (
    <main style={{ maxWidth: 720, margin: "80px auto", padding: "0 24px", fontFamily: "sans-serif" }}>
      <p style={{ color: "#2563eb", fontWeight: 700 }}>지원서 #{applicationId}</p>
      <h1 style={{ fontSize: 32, margin: "12px 0" }}>면접이 완료되었습니다</h1>
      <p style={{ color: "#4b5563", lineHeight: 1.6 }}>
        답변 제출이 완료되었습니다. 분석 결과는 지원 현황 화면에서 확인할 수 있습니다.
      </p>
    </main>
  );
}

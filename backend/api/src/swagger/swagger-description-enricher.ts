import type { OpenAPIObject } from "@nestjs/swagger";

type SwaggerObject = Record<string, unknown>;

type OperationDocumentation = {
  summary: string;
  description: string;
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

const OPERATION_DOCUMENTATION_BY_HANDLER: Record<string, OperationDocumentation> = {
  getProfile: {
    summary: "지원자 프로필 조회",
    description: "로그인한 지원자의 기본 정보, 경력, 학력, 보유 기술과 지원서 작성에 사용하는 프로필 정보를 조회합니다.",
  },
  updateProfile: {
    summary: "지원자 프로필 수정",
    description: "로그인한 지원자의 기본 정보, 경력, 학력과 보유 기술을 검증해 지원자 프로필에 반영합니다.",
  },
  listJobs: {
    summary: "지원 가능한 채용공고 목록 조회",
    description: "지원자에게 노출 가능한 채용공고를 검색·필터 조건에 따라 조회하고, 각 공고의 지원 완료 여부를 함께 반환합니다.",
  },
  getJobDetail: {
    summary: "지원자용 채용공고 상세 조회",
    description: "지원 가능한 채용공고의 회사, 직무, 근무 조건, 모집 기간과 지원 완료 여부를 조회합니다.",
  },
  getApplyView: {
    summary: "채용공고 지원 화면 정보 조회",
    description: "지원서 작성에 필요한 공고 정보와 지원자의 기본 이력서·포트폴리오 정보를 조회합니다.",
  },
  submitApplication: {
    summary: "채용공고 지원서 제출",
    description: "지원자가 입력한 지원 동기와 제출 서류를 검증해 지원서를 생성하고 채용면접 세션 준비 결과를 반환합니다.",
  },
  uploadResume: {
    summary: "지원자 이력서 업로드",
    description: "지원자의 이력서 파일 또는 파일 메타데이터를 검증하고 소유권이 연결된 파일 자산으로 저장합니다.",
  },
  createPortfolioLink: {
    summary: "지원자 포트폴리오 링크 등록",
    description: "GitHub, 블로그 또는 포트폴리오 URL을 검증해 로그인한 지원자의 포트폴리오 링크로 등록합니다.",
  },
  listFolders: {
    summary: "모의면접 폴더 목록 조회",
    description: "로그인한 지원자가 만든 모의면접 준비 폴더와 연결된 이력서·포트폴리오 요약을 조회합니다.",
  },
  createFolder: {
    summary: "모의면접 폴더 생성",
    description: "모의면접 질문 생성에 사용할 직무 정보와 이력서·포트폴리오 참조를 묶어 새 준비 폴더를 생성합니다.",
  },
  getFolder: {
    summary: "모의면접 폴더 상세 조회",
    description: "로그인한 지원자가 소유한 모의면접 폴더와 연결 파일 및 추출 텍스트를 조회합니다.",
  },
  updateFolder: {
    summary: "모의면접 폴더 수정",
    description: "로그인한 지원자가 소유한 모의면접 폴더의 이름, 직무 정보와 연결 자료를 수정합니다.",
  },
  deleteFolder: {
    summary: "모의면접 폴더 삭제",
    description: "로그인한 지원자의 폴더 소유권을 확인한 뒤 지정한 모의면접 준비 폴더를 삭제합니다.",
  },
  listApplications: {
    summary: "지원자의 지원현황 목록 조회",
    description: "로그인한 지원자의 지원서, 공고, 채용면접 세션, 동의·장치 점검 및 리포트 상태를 결합해 최신순으로 반환합니다.",
  },
  getInterviewGuide: {
    summary: "채용면접 응시 안내 조회",
    description: "본인 지원 건의 면접 기간, 필수 동의, 장치 점검 및 면접 시작 가능 상태를 조회합니다.",
  },
  saveInterviewConsent: {
    summary: "채용면접 필수 동의 저장",
    description: "본인 지원 건의 개인정보·AI 분석·녹화 동의를 저장하고 면접 시작 가능 상태를 다시 계산합니다.",
  },
  getSettings: {
    summary: "기업 면접 설정 통합 조회",
    description: "기업 공고에 연결된 평가 기준, 질문 뱅크, 질문 세트와 면접 시간 정책을 한 번에 조회합니다.",
  },
  createCriterionTag: {
    summary: "기업 평가 기준 태그 생성",
    description: "기업이 면접 평가 기준을 분류할 때 사용할 역량 태그를 생성합니다.",
  },
  updateEvaluationCriteria: {
    summary: "기업 면접 평가 기준 수정",
    description: "공고에 적용할 평가 기준의 이름, 설명, 가중치와 활성 상태를 검증해 반영합니다.",
  },
  createQuestion: {
    summary: "기업 면접 질문 직접 추가",
    description: "기업 질문 뱅크에 직무·경험·상황 등 유형과 평가 기준이 연결된 면접 질문을 추가합니다.",
  },
  updateQuestion: {
    summary: "기업 면접 질문 수정",
    description: "기업 소유 질문의 문장, 유형, 난이도와 평가 기준 연결 정보를 수정합니다.",
  },
  deleteQuestion: {
    summary: "기업 면접 질문 삭제",
    description: "기업 소유권과 질문 세트 사용 여부를 확인한 뒤 지정한 질문을 삭제합니다.",
  },
  updateTimePolicy: {
    summary: "기업 면접 시간 정책 수정",
    description: "공고별 준비 시간, 답변 제한 시간과 재답변 허용 정책을 검증해 저장합니다.",
  },
  getActiveQuestionSet: {
    summary: "공고의 활성 질문 세트 조회",
    description: "지원자 채용면접 런타임에 적용되는 공고별 활성 질문 세트와 질문 순서를 조회합니다.",
  },
  confirmQuestionSet: {
    summary: "기업 면접 질문 세트 확정",
    description: "선택한 질문과 순서를 검증해 공고의 활성 질문 세트로 확정하고 기존 활성 세트를 교체합니다.",
  },
  startMockInterview: {
    summary: "모의면접 세션 시작",
    description: "지원자의 준비 폴더와 질문 구성을 확인하고 새 모의면접 세션 또는 이어갈 세션을 반환합니다.",
  },
  listMockInterviewHistory: {
    summary: "모의면접 응시 이력 조회",
    description: "로그인한 지원자의 모의면접 세션, 진행 상태, 완료 시각과 리포트 연결 정보를 최신순으로 조회합니다.",
  },
  getMockRuntime: {
    summary: "모의면접 런타임 조회",
    description: "본인 모의면접 세션의 현재 질문, 진행 상태, 시간 정책과 답변 진행 정보를 조회합니다.",
  },
  listMockQuestions: {
    summary: "모의면접 질문 목록 조회",
    description: "본인 모의면접 세션에 배정된 기본 질문과 삽입된 꼬리질문을 진행 순서대로 반환합니다.",
  },
  saveMockAnswer: {
    summary: "모의면접 답변 저장",
    description: "현재 모의면접 질문의 녹화 파일 참조, 답변 시간과 비언어 메타데이터를 검증해 답변으로 저장합니다.",
  },
  moveMockNextQuestion: {
    summary: "모의면접 다음 질문 이동",
    description: "현재 답변 처리 상태를 확인하고 세션의 다음 기본 질문 또는 꼬리질문으로 진행합니다.",
  },
  completeMockInterview: {
    summary: "모의면접 완료 처리",
    description: "모의면접의 필수 진행 상태를 확인해 세션을 완료하고 리포트 생성이 가능한 상태로 전환합니다.",
  },
  requestMockStt: {
    summary: "모의면접 답변 STT 요청",
    description: "저장된 모의면접 음성 파일을 참조하는 STT 비동기 작업을 생성하고 작업 추적 정보를 반환합니다.",
  },
  requestMockFollowUpQuestion: {
    summary: "모의면접 꼬리질문 생성 요청",
    description: "현재 질문과 STT 답변을 바탕으로 꼬리질문을 생성하는 비동기 작업을 요청합니다.",
  },
  insertMockFollowUpQuestion: {
    summary: "모의면접 꼬리질문 런타임 삽입",
    description: "완료된 꼬리질문 생성 결과를 검증해 해당 모의면접 세션의 다음 질문 흐름에 삽입합니다.",
  },
  createMockRealtimeSession: {
    summary: "모의면접 실시간 AI 세션 생성",
    description: "모의면접의 실시간 음성 안내 또는 STT 연결에 사용할 단기 세션 정보를 생성합니다.",
  },
  saveDeviceCheck: {
    summary: "면접 장치 점검 결과 저장",
    description: "면접 세션의 카메라, 마이크와 네트워크 점검 결과를 저장하고 면접 시작 가능 상태를 다시 계산합니다.",
  },
  startInterview: {
    summary: "지원자 채용면접 시작",
    description: "지원자의 필수 동의, 장치 점검, 응시 기간을 확인하고 채용면접 세션을 진행 중 상태로 전환합니다.",
  },
  getInterviewRuntime: {
    summary: "지원자 채용면접 런타임 조회",
    description: "본인 지원 건의 채용면접 세션, 현재 질문, 시간 정책과 진행 상태를 조회합니다.",
  },
  listRecruitingQuestions: {
    summary: "채용면접 질문 목록 조회",
    description: "기업이 확정한 질문 세트와 런타임 꼬리질문을 채용면접 진행 순서대로 반환합니다.",
  },
  saveRecruitingAnswer: {
    summary: "채용면접 답변 저장",
    description: "현재 채용면접 질문의 영상·음성 파일 참조와 답변 시간을 검증해 지원자의 답변으로 저장합니다.",
  },
  uploadInterviewMedia: {
    summary: "면접 답변 미디어 업로드",
    description: "면접 세션 소유권과 파일 형식·크기를 검증한 뒤 영상 또는 음성을 스토리지에 업로드하고 파일 메타데이터를 반환합니다.",
  },
  moveRecruitingNextQuestion: {
    summary: "채용면접 다음 질문 이동",
    description: "현재 답변 저장 상태를 확인한 뒤 기업 질문 세트 또는 생성된 꼬리질문의 다음 순서로 진행합니다.",
  },
  completeRecruitingInterview: {
    summary: "채용면접 완료 처리",
    description: "채용면접 세션을 완료하고 지원 상태를 갱신한 뒤 채용 평가 리포트 생성 요청을 연결합니다.",
  },
  requestRecruitingStt: {
    summary: "채용면접 답변 STT 요청",
    description: "저장된 채용면접 음성 파일을 참조하는 STT 비동기 작업을 생성하고 작업 추적 정보를 반환합니다.",
  },
  transcribeRecruitingInterview: {
    summary: "채용면접 STT 작업 생성",
    description: "채용면접 세션과 답변 음성 파일 참조를 검증해 STT 비동기 작업을 큐에 등록하고 작업 추적 정보를 반환합니다.",
  },
  requestRecruitingFollowUpQuestion: {
    summary: "채용면접 꼬리질문 생성 요청",
    description: "기업 JD, 이전 질문과 STT 답변을 바탕으로 채용면접 꼬리질문 생성 작업을 요청합니다.",
  },
  insertRecruitingFollowUpQuestion: {
    summary: "채용면접 꼬리질문 런타임 삽입",
    description: "완료된 꼬리질문 생성 결과를 검증해 해당 채용면접 세션의 다음 질문 흐름에 삽입합니다.",
  },
  createRecruitingRealtimeSession: {
    summary: "채용면접 실시간 AI 세션 생성",
    description: "채용면접의 실시간 음성 안내 또는 STT 연결에 사용할 단기 세션 정보를 생성합니다.",
  },
  startPublicInterview: {
    summary: "비회원 채용면접 접근 시작",
    description: "공개 지원 매직 토큰과 지원서 식별자를 검증하고 면접 런타임용 public access token을 발급합니다.",
  },
  beginPublicInterview: {
    summary: "비회원 채용면접 세션 시작",
    description: "public access token의 지원서·세션 소유권과 시작 조건을 확인해 비회원 면접을 진행 중 상태로 전환합니다.",
  },
  getRuntime: {
    summary: "비회원 채용면접 런타임 조회",
    description: "public access token으로 허용된 지원서의 채용면접 세션과 현재 진행 상태를 조회합니다.",
  },
  listQuestions: {
    summary: "비회원 채용면접 질문 목록 조회",
    description: "public access token으로 허용된 면접 세션의 질문을 진행 순서대로 반환합니다.",
  },
  saveAnswer: {
    summary: "비회원 채용면접 답변 저장",
    description: "public access token과 세션을 검증한 뒤 현재 질문의 영상·음성 파일 참조와 답변 시간을 저장합니다.",
  },
  uploadMedia: {
    summary: "비회원 면접 답변 미디어 업로드",
    description: "public access token으로 허용된 면접 세션에 영상 또는 음성을 업로드하고 파일 메타데이터를 반환합니다.",
  },
  moveNextQuestion: {
    summary: "비회원 채용면접 다음 질문 이동",
    description: "현재 답변 처리 상태를 확인하고 public 채용면접의 다음 질문으로 진행합니다.",
  },
  completeInterview: {
    summary: "비회원 채용면접 완료 처리",
    description: "public 채용면접 세션과 지원 상태를 완료로 전환하고 후속 분석이 가능한 상태로 만듭니다.",
  },
  requestStt: {
    summary: "비회원 채용면접 STT 요청",
    description: "public 면접 답변 음성 파일을 참조하는 STT 비동기 작업을 생성합니다.",
  },
  requestFollowUpQuestion: {
    summary: "비회원 채용면접 꼬리질문 생성 요청",
    description: "public 면접의 이전 질문과 STT 답변을 바탕으로 꼬리질문 생성 작업을 요청합니다.",
  },
  insertFollowUpQuestion: {
    summary: "비회원 채용면접 꼬리질문 삽입",
    description: "생성 완료된 꼬리질문을 public 채용면접 세션의 다음 질문 흐름에 삽입합니다.",
  },
  createRealtimeSession: {
    summary: "비회원 채용면접 실시간 AI 세션 생성",
    description: "public 채용면접의 실시간 음성 기능에 사용할 단기 세션 정보를 생성합니다.",
  },
  listMockReports: {
    summary: "지원자 모의면접 리포트 목록 조회",
    description: "로그인한 지원자가 완료한 모의면접 리포트의 생성 상태와 요약 정보를 최신순으로 조회합니다.",
  },
  getMockReportFeedback: {
    summary: "모의면접 피드백 리포트 조회",
    description: "본인 모의면접의 점수, 강점, 개선점, 답변 근거와 비언어 피드백을 조회합니다.",
  },
  getMockReportMedia: {
    summary: "모의면접 답변 미디어 조회",
    description: "본인 모의면접 리포트에 연결된 질문별 답변 영상·음성 재생 정보를 조회합니다.",
  },
  requestMockReportGeneration: {
    summary: "모의면접 리포트 생성 요청",
    description: "완료된 본인 모의면접의 답변과 STT 결과를 바탕으로 피드백 리포트 생성 작업을 요청합니다.",
  },
  getApplicationReport: {
    summary: "지원자용 채용면접 결과 조회",
    description: "본인 지원 건의 면접 제출 및 분석 상태처럼 지원자에게 허용된 제한 결과만 조회합니다.",
  },
  requestApplicationReportGeneration: {
    summary: "채용면접 리포트 생성 요청",
    description: "완료된 본인 채용면접의 답변과 STT 결과를 바탕으로 기업 검토용 리포트 생성 작업을 요청합니다.",
  },
  getApplicationStatus: {
    summary: "지원자의 채용 전형 상태 조회",
    description: "본인 지원서의 지원, 면접, 분석 및 리포트 진행 상태와 다음 안내 정보를 조회합니다.",
  },
};

const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  applicantId: "지원자 또는 지원서 식별자입니다.",
  applicationId: "지원서 식별자입니다.",
  code: "OAuth 인증 서버가 반환한 일회성 인가 코드입니다.",
  fileId: "파일 메타데이터 식별자입니다.",
  folderId: "지원자의 모의면접 준비 폴더 식별자입니다.",
  jobId: "채용 공고 식별자입니다.",
  limit: "한 페이지에 조회할 항목 수입니다. 최대 100개까지 허용합니다.",
  order: "정렬 방향입니다. asc 또는 desc 값을 사용합니다.",
  orderId: "결제 주문 식별자입니다.",
  page: "조회할 페이지 번호입니다. 1부터 시작합니다.",
  processLogId: "AI 비동기 작업 로그 식별자입니다.",
  questionId: "면접 질문 식별자입니다.",
  q: "검색어입니다. 이름, 제목, 직무 등 API별 검색 대상에 적용됩니다.",
  recruitmentId: "채용 공고 식별자입니다.",
  reportId: "평가 리포트 식별자입니다.",
  sessionId: "면접 세션 식별자입니다.",
  sort: "정렬 기준 필드입니다. API별 허용 필드만 사용할 수 있습니다.",
  status: "조회할 상태 필터입니다.",
  state: "OAuth 요청 위변조를 방지하기 위해 발급된 상태값입니다.",
  token: "공개 지원 현황 또는 public 면접 접근용 매직링크 토큰입니다.",
  userType: "로그인 또는 OAuth 요청에 사용할 사용자 유형입니다.",
  "X-Dev-User-Id": "local/dev 환경에서 사용할 임시 사용자 ID입니다.",
  "X-Dev-User-Type": "local/dev 환경에서 사용할 임시 사용자 유형입니다.",
  "X-Dev-Company-Id": "local/dev 환경에서 사용할 임시 회사 ID입니다.",
  "X-Dev-Candidate-Id": "local/dev 환경에서 사용할 임시 지원자 ID입니다.",
};

const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  accessToken: "인증된 요청에 사용하는 JWT access token입니다.",
  additionalInfo: "지원자가 추가로 전달한 참고 정보입니다.",
  allowReanswer: "해당 질문에 재답변을 허용하는지 여부입니다.",
  amount: "결제 또는 주문 금액입니다.",
  analyzeCommunication: "커뮤니케이션 보조 분석을 실행할지 여부입니다.",
  answerId: "면접 답변 식별자입니다.",
  answerTimeSec: "답변 제한 시간(초)입니다.",
  answers: "평가 또는 분석에 사용할 면접 답변 목록입니다.",
  applicant: "지원자 요약 정보입니다.",
  applicantCount: "지원자 수입니다.",
  applicantId: "지원자 또는 지원서 식별자입니다.",
  application: "지원서 요약 정보입니다.",
  applicationId: "지원서 식별자입니다.",
  applicationStatus: "지원서 전체 진행 상태입니다.",
  approvedAt: "결제가 최종 승인된 시각입니다.",
  audioFile: "업로드할 답변 음성 파일입니다.",
  audioFileId: "답변 음성 파일 메타데이터 식별자입니다.",
  audioS3Key: "S3에 저장된 답변 음성 파일 key입니다.",
  authorizationUrl: "Google OAuth 인증을 시작할 URL입니다.",
  availablePasses: "현재 사용할 수 있는 모의면접 이용권 수입니다.",
  businessRegistrationNumber: "숫자만 정규화한 사업자등록번호입니다.",
  cameraGranted: "카메라 권한 허용 여부입니다.",
  candidateId: "지원자 프로필 식별자입니다.",
  candidateName: "지원자 이름입니다.",
  careerLevel: "경력 수준 또는 요구 경력 구분입니다.",
  careerRequirement: "채용 공고의 경력 조건입니다.",
  category: "태그, 기준, 실패 등 항목의 분류입니다.",
  code: "인증 코드 또는 오류 코드입니다.",
  company: "회사 요약 정보입니다.",
  companyId: "회사 식별자입니다.",
  companyName: "회사명입니다.",
  completedAt: "작업 또는 면접이 완료된 시각입니다.",
  confidence: "AI 판단 또는 평가 결과의 신뢰도입니다.",
  consentAgreed: "필수 개인정보/분석 동의 여부입니다.",
  consentConfirmed: "면접 진행 전 필수 동의 완료 여부입니다.",
  consentTypes: "요청 또는 완료된 동의 유형 목록입니다.",
  content: "질문, 알림, 소개 등 본문 내용입니다.",
  coverLetter: "지원자가 제출한 자기소개 또는 지원 동기 본문입니다.",
  createdAt: "레코드가 생성된 시각입니다.",
  creditAmount: "결제 상품으로 지급되는 크레딧 또는 이용권 수량입니다.",
  criteria: "평가 기준 목록입니다.",
  criterionId: "평가 기준 식별자입니다.",
  criterionName: "평가 기준 이름입니다.",
  currency: "결제 통화 코드입니다.",
  customerKey: "결제 제공자에 전달하는 고객 식별 key입니다.",
  data: "API별 실제 응답 데이터입니다.",
  decision: "수동 평가 또는 전형 판정 결과입니다.",
  description: "항목에 대한 상세 설명입니다.",
  details: "검증 실패 또는 오류에 대한 구조화된 상세 정보입니다.",
  difficulty: "질문 또는 평가 항목의 난이도입니다.",
  documentId: "지원 서류 식별자입니다.",
  documentRef: "서류 원문 위치 또는 페이지 참조값입니다.",
  documentStatus: "서류 제출 또는 분석 상태입니다.",
  documentSummary: "지원 서류에서 추출한 요약 정보입니다.",
  documentText: "AI 분석에 사용할 서류 텍스트입니다.",
  durationSeconds: "답변 또는 미디어 길이(초)입니다.",
  educationRequirement: "채용 공고의 학력 조건입니다.",
  email: "사용자 이메일 주소입니다.",
  emailVerificationStatus: "이메일 인증 진행 상태입니다.",
  employmentType: "채용 공고의 고용 형태입니다.",
  enabled: "설정 또는 기능의 활성화 여부입니다.",
  endsOn: "채용 공고의 지원 마감일입니다.",
  error: "공통 오류 응답 본문입니다.",
  evaluationPolicy: "회사의 평가 정책 또는 인재상 기반 평가 방향입니다.",
  evaluationStatus: "답변 평가 가능 여부 또는 평가 처리 상태입니다.",
  evidences: "점수 산정에 사용된 근거 목록입니다.",
  failUrl: "결제 실패 후 이동할 프론트엔드 URL입니다.",
  failure: "작업 실패 정보입니다.",
  failureCategory: "실패가 재시도 가능한지 구분하는 분류입니다.",
  failureCode: "외부 결제 또는 내부 처리 실패 코드입니다.",
  failureMessage: "실패 사유 메시지입니다.",
  fileAssetId: "업로드 파일 메타데이터 식별자입니다.",
  fileId: "파일 메타데이터 식별자입니다.",
  freeExpiresAt: "무료 모의면접 이용권 만료 시각입니다.",
  freePasses: "무료로 지급된 모의면접 이용권 수입니다.",
  generatedAt: "AI 결과가 생성된 시각입니다.",
  githubBlogUrl: "GitHub, 블로그 등 지원자 외부 링크 URL입니다.",
  grantedPasses: "누적 지급된 모의면접 이용권 수입니다.",
  guardrail: "AI 출력 안전성 검증 결과입니다.",
  guardrailLogId: "AI 가드레일 검증 로그 식별자입니다.",
  href: "화면 이동 또는 다운로드에 사용할 URL입니다.",
  industry: "회사 산업군입니다.",
  inputRef: "AI 작업 입력 참조값입니다.",
  integrationStatus: "외부 연동 또는 시스템 처리 상태입니다.",
  interviewEntry: "면접 시작 화면으로 이동하기 위한 진입 정보입니다.",
  interviewSession: "면접 세션 요약 정보입니다.",
  interviewStatus: "면접 세션 또는 응시 상태입니다.",
  interviewType: "면접 유형입니다. MOCK 또는 RECRUITING 값을 사용합니다.",
  items: "목록 응답의 항목 배열입니다.",
  jobDescription: "채용 공고의 직무 설명/JD입니다.",
  jobGroup: "직무군입니다.",
  jobRole: "채용 직무명입니다.",
  keyword: "검색에 사용할 키워드입니다.",
  keywords: "검색, 추천, 분석에 사용할 키워드 목록입니다.",
  label: "화면 표시용 라벨입니다.",
  limit: "한 페이지에 조회할 항목 수입니다.",
  linkType: "포트폴리오 링크 유형입니다.",
  location: "근무 지역 또는 위치 정보입니다.",
  loggedOut: "로그아웃 처리 완료 여부입니다.",
  logoFileId: "회사 로고 파일 메타데이터 식별자입니다.",
  logoUrl: "회사 로고 이미지 URL입니다.",
  magicLinkDeliveryStatus: "매직링크 발송 상태입니다.",
  magicLinkExpiresInSeconds: "매직링크 만료까지 남은 시간(초)입니다.",
  magicToken: "공개 지원 현황 또는 public 면접 접근용 토큰입니다.",
  manualEvaluations: "면접관의 수동 평가 목록입니다.",
  mediaQuality: "업로드된 면접 미디어의 품질 판정입니다.",
  memo: "기업 담당자 또는 검토자의 메모입니다.",
  message: "사용자에게 표시할 메시지입니다.",
  meta: "traceId, timestamp, pagination 등을 담는 공통 메타데이터입니다.",
  method: "면접 진행 방식 또는 처리 방법입니다.",
  metrics: "분석 결과의 세부 지표입니다.",
  microphoneGranted: "마이크 권한 허용 여부입니다.",
  mimeType: "파일 MIME 타입입니다.",
  mode: "면접 또는 AI 세션 실행 모드입니다.",
  motivation: "지원 동기입니다.",
  name: "사용자, 회사, 태그 등 리소스 이름입니다.",
  networkStable: "면접 진행에 필요한 네트워크 안정성 여부입니다.",
  newPassword: "변경할 새 비밀번호입니다.",
  newPasswordConfirm: "새 비밀번호 확인 값입니다.",
  nextAction: "현재 상태에서 사용자가 취할 수 있는 다음 동작입니다.",
  notes: "보조 설명 또는 운영 참고 메모입니다.",
  order: "정렬 방향입니다.",
  orderId: "결제 주문 식별자입니다.",
  orderName: "결제 주문명입니다.",
  originalName: "업로드된 원본 파일명입니다.",
  output: "AI 작업 결과 데이터입니다.",
  outputRef: "AI 작업 출력 참조값입니다.",
  ownerUserId: "파일 또는 리소스를 소유한 사용자 식별자입니다.",
  page: "현재 페이지 번호입니다.",
  paidPasses: "유료로 보유한 모의면접 이용권 수입니다.",
  passAmount: "지급 또는 사용할 모의면접 이용권 수입니다.",
  passScore: "평가 기준 통과로 볼 최소 점수입니다.",
  password: "사용자 비밀번호입니다.",
  passwordConfirm: "비밀번호 확인 값입니다.",
  paymentKey: "Toss Payments 승인에 사용하는 paymentKey입니다.",
  paymentOrderId: "결제 주문 내부 식별자입니다.",
  phone: "사용자 연락처입니다.",
  policyName: "가드레일 또는 평가 정책 이름입니다.",
  portfolioFileId: "포트폴리오 파일 메타데이터 식별자입니다.",
  portfolioMode: "포트폴리오 제출 방식입니다. URL 또는 FILE 값을 사용합니다.",
  portfolioUrl: "지원자 포트폴리오 URL입니다.",
  posting: "채용 공고 요약 정보입니다.",
  postingId: "채용 공고 식별자입니다.",
  postingStatus: "채용 공고 상태입니다.",
  preparationTimeSec: "질문 표시 후 답변 전 준비 시간(초)입니다.",
  previousQuestion: "꼬리질문 생성에 참고할 이전 질문입니다.",
  processLogId: "AI 비동기 작업 로그 식별자입니다.",
  processType: "AI 비동기 작업 유형입니다.",
  productCode: "결제 상품 코드입니다.",
  profile: "회사 또는 지원자 프로필 설명입니다.",
  q: "검색어입니다.",
  quantity: "결제 상품 구매 수량입니다.",
  question: "면접 질문 문장 또는 질문 객체입니다.",
  questionCount: "질문 수입니다.",
  questionEvaluations: "질문별 평가 결과 목록입니다.",
  questionId: "면접 질문 식별자입니다.",
  questionType: "면접 질문 유형입니다.",
  questionTypes: "생성 또는 필터링에 사용할 질문 유형 목록입니다.",
  queued: "비동기 작업이 큐에 등록되었는지 여부입니다.",
  rationale: "점수 또는 판단의 근거 설명입니다.",
  reason: "상태, 실패, 가드레일 결과에 대한 사유입니다.",
  receiptUrl: "결제 영수증 URL입니다.",
  regenerated: "가드레일 검증 과정에서 재생성되었는지 여부입니다.",
  regenerationReason: "AI 출력 재생성 사유입니다.",
  report: "평가 리포트 요약 또는 상세 정보입니다.",
  reportAvailability: "리포트 조회 가능 여부와 상태 정보입니다.",
  reportId: "평가 리포트 식별자입니다.",
  reportStatus: "평가 리포트 생성 상태입니다.",
  reportType: "리포트 유형입니다.",
  result: "처리 결과 값입니다.",
  resumeFileId: "이력서 파일 메타데이터 식별자입니다.",
  resumeText: "이력서에서 추출했거나 입력한 텍스트입니다.",
  retryAllowed: "재시도 허용 여부입니다.",
  retryAnswerId: "재답변 대상 답변 식별자입니다.",
  retryable: "실패 원인이 재시도 가능한지 여부입니다.",
  reviewerUserId: "수동 평가를 남긴 검토자 사용자 식별자입니다.",
  rubricAnchor: "내부 평가 rubric 단계입니다.",
  s3Key: "S3 object key입니다.",
  salaryInfo: "채용 공고의 급여 정보입니다.",
  score: "평가 점수입니다.",
  scores: "평가 항목별 점수 목록입니다.",
  screening: "기업 전형 판정 요약 정보입니다.",
  screeningDecision: "기업 담당자의 전형 판정입니다.",
  screeningMemo: "기업 담당자의 전형 검토 메모입니다.",
  sent: "메일 또는 알림 발송 완료 여부입니다.",
  sessionId: "면접 세션 식별자입니다.",
  showQuestionText: "면접 진행 중 질문 텍스트 표시 여부입니다.",
  sizeBytes: "파일 크기(byte)입니다.",
  skipReason: "처리 또는 분석을 건너뛴 사유입니다.",
  sort: "정렬 기준 필드입니다.",
  sortOrder: "화면 표시 또는 면접 진행 순서입니다.",
  sourceProcessLogId: "결과를 만든 원본 AI 작업 로그 식별자입니다.",
  sourceType: "평가 근거 또는 임베딩 원천 유형입니다.",
  startedAt: "면접 또는 작업이 시작된 시각입니다.",
  startsOn: "채용 공고의 지원 시작일입니다.",
  status: "리소스 또는 작업의 현재 상태입니다.",
  statuses: "조회할 상태 필터 목록입니다.",
  storageKey: "스토리지 내부 파일 key입니다.",
  submittedAt: "지원서 또는 답변 제출 시각입니다.",
  successUrl: "결제 성공 후 이동할 프론트엔드 URL입니다.",
  summary: "요약 설명입니다.",
  tagId: "평가 태그 식별자입니다.",
  talentProfile: "회사가 선호하는 인재상입니다.",
  target: "검증 또는 처리 대상입니다.",
  temporary: "임시 브릿지 API 또는 임시 결과 여부입니다.",
  temporaryBoundary: "임시 구현의 적용 범위와 제거 기준입니다.",
  termsAgreed: "필수 약관 동의 여부입니다.",
  text: "분석 또는 검증 대상 텍스트입니다.",
  timestamp: "응답이 생성된 ISO-8601 시각입니다.",
  title: "채용 공고, 질문 세트, 리포트 등 항목 제목입니다.",
  token: "인증, 매직링크, public 접근에 사용하는 토큰입니다.",
  totalItems: "전체 항목 수입니다.",
  totalPages: "전체 페이지 수입니다.",
  totalScore: "리포트 총점입니다.",
  traceId: "요청 추적을 위한 trace ID입니다.",
  transcript: "STT로 변환한 면접 답변 스크립트입니다.",
  transcriptUnavailableReason: "답변 스크립트를 사용할 수 없는 사유입니다.",
  transport: "실시간 면접 세션 전송 방식입니다.",
  type: "항목 유형입니다.",
  uncertaintyReasons: "AI 판단 신뢰도가 낮거나 보완이 필요한 사유 목록입니다.",
  unitPrice: "결제 상품의 단가입니다.",
  updatedAt: "레코드가 마지막으로 수정된 시각입니다.",
  url: "접근 가능한 URL입니다.",
  usedPasses: "이미 사용한 모의면접 이용권 수입니다.",
  user: "인증된 사용자 요약 정보입니다.",
  userId: "서비스 내부 사용자 식별자입니다.",
  userType: "사용자 유형입니다.",
  verificationStatus: "회사 또는 이메일 검증 상태입니다.",
  verified: "인증 또는 검증 완료 여부입니다.",
  videoFile: "업로드할 답변 영상 파일입니다.",
  videoFileId: "답변 영상 파일 메타데이터 식별자입니다.",
  weight: "평가 기준 가중치입니다.",
  workLocation: "채용 공고의 근무 지역입니다.",
};

export function enrichSwaggerDescriptions(document: OpenAPIObject): OpenAPIObject {
  enrichComponents(document as unknown as SwaggerObject);
  enrichPaths(document as unknown as SwaggerObject);

  return document;
}

function enrichComponents(document: SwaggerObject) {
  const components = asObject(document.components);
  const schemas = asObject(components?.schemas);

  for (const [schemaName, schemaValue] of Object.entries(schemas ?? {})) {
    const schema = asObject(schemaValue);
    if (!schema) {
      continue;
    }

    setDescription(schema, `${schemaName} 스키마입니다.`);
    enrichSchemaProperties(schema, schemaName);
  }
}

function enrichPaths(document: SwaggerObject) {
  const paths = asObject(document.paths);
  if (!paths) {
    return;
  }

  for (const [path, methodsValue] of Object.entries(paths)) {
    const methods = asObject(methodsValue);
    if (!methods) {
      continue;
    }

    for (const [method, operationValue] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const operation = asObject(operationValue);
      if (!operation) {
        continue;
      }

      enrichOperation(method.toUpperCase(), path, operation);
    }
  }
}

function enrichOperation(method: string, path: string, operation: SwaggerObject) {
  const existingSummary = readString(operation.summary);
  const handlerName = readHandlerName(operation);
  const documentedOperation = !existingSummary && handlerName
    ? OPERATION_DOCUMENTATION_BY_HANDLER[handlerName]
    : undefined;
  if (documentedOperation) {
    operation.summary = documentedOperation.summary;
  }

  const summary = existingSummary ?? documentedOperation?.summary ?? `${method} ${path}`;
  const apiId = readString(operation["x-api-id"]);

  setDescription(
    operation,
    documentedOperation?.description ?? buildOperationDescription(summary, method, path, apiId),
  );
  enrichParameters(operation, method, path);
  enrichRequestBody(operation, summary);
  enrichResponses(operation, summary);
}

function enrichParameters(operation: SwaggerObject, method: string, path: string) {
  const parameters = operation.parameters;
  if (!Array.isArray(parameters)) {
    return;
  }

  for (const parameterValue of parameters) {
    const parameter = asObject(parameterValue);
    const name = readString(parameter?.name);
    if (!parameter || !name) {
      continue;
    }

    const location = readString(parameter.in);
    setDescription(
      parameter,
      PARAMETER_DESCRIPTIONS[name] ?? `${method} ${path}의 ${name} ${location ?? "parameter"} 값입니다.`,
    );
  }
}

function enrichRequestBody(operation: SwaggerObject, summary: string) {
  const requestBody = asObject(operation.requestBody);
  if (!requestBody) {
    return;
  }

  setDescription(requestBody, `${summary}에 필요한 요청 본문입니다.`);
  enrichContentSchemas(requestBody.content, "요청 본문");
}

function enrichResponses(operation: SwaggerObject, summary: string) {
  const responses = asObject(operation.responses);
  if (!responses) {
    return;
  }

  for (const [status, responseValue] of Object.entries(responses)) {
    const response = asObject(responseValue);
    if (!response) {
      continue;
    }

    setDescription(response, buildResponseDescription(status, summary));
    enrichContentSchemas(response.content, `${status} 응답`);
  }
}

function enrichContentSchemas(contentValue: unknown, context: string) {
  const content = asObject(contentValue);
  if (!content) {
    return;
  }

  for (const [contentType, mediaValue] of Object.entries(content)) {
    const media = asObject(mediaValue);
    const schema = asObject(media?.schema);
    if (!schema) {
      continue;
    }

    enrichSchemaProperties(schema, `${context} ${contentType}`);
  }
}

function enrichSchemaProperties(schema: SwaggerObject, schemaName: string) {
  const properties = asObject(schema.properties);
  if (properties) {
    for (const [propertyName, propertyValue] of Object.entries(properties)) {
      const property = asObject(propertyValue);
      if (!property) {
        continue;
      }

      setDescription(property, describeProperty(schemaName, propertyName));
      enrichSchemaProperties(property, `${schemaName}.${propertyName}`);
    }
  }

  const items = asObject(schema.items);
  if (items) {
    enrichSchemaProperties(items, `${schemaName}[]`);
  }

  for (const unionKey of ["allOf", "oneOf", "anyOf"]) {
    const schemas = schema[unionKey];
    if (!Array.isArray(schemas)) {
      continue;
    }

    schemas.forEach((child, index) => {
      const childSchema = asObject(child);
      if (childSchema) {
        enrichSchemaProperties(childSchema, `${schemaName}.${unionKey}[${index}]`);
      }
    });
  }
}

function setDescription(target: SwaggerObject, description: string) {
  if (hasDescription(target)) {
    return;
  }

  if (typeof target.$ref === "string") {
    const ref = target.$ref;
    delete target.$ref;
    target.allOf = [{ $ref: ref }];
  }

  target.description = description;
}

function buildOperationDescription(summary: string, method: string, path: string, apiId?: string) {
  const behavior = method === "GET"
    ? "요청 파라미터와 접근 권한을 확인한 뒤 조회 결과를 반환합니다."
    : method === "POST"
      ? "요청 본문과 대상 리소스 상태를 검증한 뒤 생성 또는 처리 결과를 반환합니다."
      : method === "PATCH" || method === "PUT"
        ? "대상 리소스의 접근 권한과 현재 상태를 확인한 뒤 요청된 변경을 반영합니다."
        : method === "DELETE"
          ? "대상 리소스의 접근 권한과 삭제 가능 상태를 확인한 뒤 삭제 또는 비활성화합니다."
          : `${method} ${path} 요청을 처리하고 결과를 반환합니다.`;
  const contract = apiId ? ` 계약 문서의 ${apiId} 기준을 따릅니다.` : "";
  return `${summary} API입니다. ${behavior}${contract}`;
}

function buildResponseDescription(status: string, summary: string) {
  if (status === "200") {
    return `${summary} 성공 응답입니다.`;
  }
  if (status === "201") {
    return `${summary} 생성 완료 응답입니다.`;
  }
  if (status === "202") {
    return `${summary} 비동기 작업 접수 응답입니다.`;
  }
  if (status === "204") {
    return `${summary} 처리를 완료했으며 응답 본문은 없습니다.`;
  }
  if (status === "400") {
    return `${summary} 요청값 형식, 필수값 또는 허용 범위가 올바르지 않은 경우의 응답입니다.`;
  }
  if (status === "401") {
    return `${summary} 인증 정보가 없거나 만료된 경우의 응답입니다.`;
  }
  if (status === "403") {
    return `${summary} 요청 사용자에게 대상 리소스 접근 권한이 없는 경우의 응답입니다.`;
  }
  if (status === "404") {
    return `${summary} 대상 리소스를 찾을 수 없는 경우의 응답입니다.`;
  }
  if (status === "409") {
    return `${summary} 대상 리소스의 현재 상태와 요청한 작업이 충돌하는 경우의 응답입니다.`;
  }
  if (status === "413") {
    return `${summary} 업로드 파일 또는 요청 본문의 허용 크기를 초과한 경우의 응답입니다.`;
  }
  if (status === "429") {
    return `${summary} 허용된 요청 횟수 또는 처리 한도를 초과한 경우의 응답입니다.`;
  }
  if (status.startsWith("2")) {
    return `${summary} 성공 계열 응답입니다.`;
  }
  if (status.startsWith("4")) {
    return `${summary} 요청 처리 중 클라이언트 오류가 발생한 경우의 응답입니다.`;
  }
  if (status.startsWith("5")) {
    return `${summary} 요청 처리 중 서버 오류가 발생한 경우의 응답입니다.`;
  }

  return `${summary} ${status} 응답입니다.`;
}

function describeProperty(schemaName: string, propertyName: string) {
  return PROPERTY_DESCRIPTIONS[propertyName] ?? `${schemaName}의 ${propertyName} 필드입니다.`;
}

function hasDescription(value: SwaggerObject) {
  return typeof value.description === "string" && value.description.trim().length > 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readHandlerName(operation: SwaggerObject) {
  const operationId = readString(operation.operationId);
  return operationId?.split("_").at(-1);
}

function asObject(value: unknown): SwaggerObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as SwaggerObject) : undefined;
}

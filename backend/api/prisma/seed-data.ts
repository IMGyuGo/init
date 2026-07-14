import type {
  PostingEmploymentTypeCode,
  PostingJobRoleCode,
  PostingRecruitmentType,
  PostingRegionCode,
  PostingStatus,
} from "@init/common";

type VisiblePostingStatus = Extract<PostingStatus, "OPEN" | "CLOSING_SOON">;

export const SEED_ACCOUNT_PASSWORD = "Password123";
export const SEED_COMPANY_LOGO_MIME_TYPE = "image/png" as const;

export interface SeedCompanyLogoObject {
  key: string;
  originalName: string;
  contentType: typeof SEED_COMPANY_LOGO_MIME_TYPE;
  body: Buffer;
  sizeBytes: number;
}

export function buildSeedCompanyLogoStorageKey(companySlug: string) {
  return `seed/company-logos/${companySlug}.png`;
}

export function buildSeedCompanyLogoSourceUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
}

export interface CompanyJobListingPostingSeed {
  postingId: number;
  title: string;
  jobRole: string;
  jobDescription: string;
  careerRequirement: string;
  educationRequirement: string;
  salaryInfo: string;
  workLocation: string;
  employmentType: string;
  jobRoleCode: PostingJobRoleCode;
  regionCode: PostingRegionCode;
  careerMinYears: number;
  careerMaxYears: number;
  employmentTypeCode: PostingEmploymentTypeCode;
  recruitmentType: PostingRecruitmentType;
  workplaceAddress: string;
  workplaceLat: number;
  workplaceLng: number;
  startsInDays: number;
  endsInDays: number;
  status: VisiblePostingStatus;
  createdDaysAgo: number;
}

export interface CompanyJobListingSeed {
  companySlug: string;
  logoSourceDomain: string;
  logoSourceUrl: string;
  ownerUser: {
    userId: number;
    email: string;
    name: string;
    phone: string;
  };
  logoFile: {
    fileId: number;
    storageKey: string;
    originalName: string;
    mimeType: typeof SEED_COMPANY_LOGO_MIME_TYPE;
    sizeBytes: number;
  };
  company: {
    companyId: number;
    ownerUserId: number;
    name: string;
    businessRegistrationNumber: string;
    verificationStatus: "VERIFIED";
    logoFileId: number;
    industry: string;
    profile: string;
    talentProfile: string;
    evaluationPolicy: string;
  };
  postings: CompanyJobListingPostingSeed[];
}

type RealCompanySeedInput = {
  slug: string;
  domain: string;
  companyName: string;
  ownerName: string;
  phoneSuffix: string;
  industry: string;
  jobRoleCode: PostingJobRoleCode;
  jobRole: string;
  title: string;
  regionCode: PostingRegionCode;
  employmentTypeCode: PostingEmploymentTypeCode;
  recruitmentType: PostingRecruitmentType;
  tags: string;
  address: string;
  lat: number;
  lng: number;
};

const realCompanySeedInputs: RealCompanySeedInput[] = [
  {
    slug: "samsung-electronics",
    domain: "samsung.com",
    companyName: "삼성전자",
    ownerName: "김도윤",
    phoneSuffix: "1001",
    industry: "전자·반도체",
    jobRoleCode: "AI·ML",
    jobRole: "On-device AI Platform Engineer",
    title: "온디바이스 AI 플랫폼 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#AI #C++ #Python #EdgeAI",
    address: "경기도 수원시 영통구 삼성로 129",
    lat: 37.2579,
    lng: 127.0563,
  },
  {
    slug: "sk-hynix",
    domain: "skhynix.com",
    companyName: "SK하이닉스",
    ownerName: "박서연",
    phoneSuffix: "1002",
    industry: "반도체",
    jobRoleCode: "데이터 엔지니어",
    jobRole: "Semiconductor Data Engineer",
    title: "반도체 제조 데이터 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#DataPipeline #Python #SQL #MLOps",
    address: "경기도 이천시 부발읍 경충대로 2091",
    lat: 37.2441,
    lng: 127.4899,
  },
  {
    slug: "hyundai-motor",
    domain: "hyundai.com",
    companyName: "현대자동차",
    ownerName: "이현우",
    phoneSuffix: "1003",
    industry: "모빌리티",
    jobRoleCode: "서버·백엔드",
    jobRole: "Mobility Backend Engineer",
    title: "커넥티드카 백엔드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Kotlin #Kafka #MSA #Cloud",
    address: "서울특별시 서초구 헌릉로 12",
    lat: 37.4632,
    lng: 127.0429,
  },
  {
    slug: "kia",
    domain: "kia.com",
    companyName: "기아",
    ownerName: "최지민",
    phoneSuffix: "1004",
    industry: "모빌리티",
    jobRoleCode: "프론트엔드",
    jobRole: "Vehicle Experience Frontend Engineer",
    title: "차량 경험 플랫폼 프론트엔드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#React #TypeScript #DesignSystem",
    address: "서울특별시 서초구 헌릉로 12",
    lat: 37.4632,
    lng: 127.0429,
  },
  {
    slug: "lg-electronics",
    domain: "lg.com",
    companyName: "LG전자",
    ownerName: "정하린",
    phoneSuffix: "1005",
    industry: "가전·플랫폼",
    jobRoleCode: "AI·ML",
    jobRole: "Smart Home AI Engineer",
    title: "스마트홈 AI 서비스 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#AI #IoT #Python #Cloud",
    address: "서울특별시 영등포구 여의대로 128",
    lat: 37.5284,
    lng: 126.9291,
  },
  {
    slug: "naver",
    domain: "naver.com",
    companyName: "네이버",
    ownerName: "강민준",
    phoneSuffix: "1006",
    industry: "검색·클라우드",
    jobRoleCode: "서버·백엔드",
    jobRole: "Search Platform Backend Engineer",
    title: "검색 플랫폼 백엔드 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Java #Search #DistributedSystem",
    address: "경기도 성남시 분당구 정자일로 95",
    lat: 37.3595,
    lng: 127.1052,
  },
  {
    slug: "kakao",
    domain: "kakaocorp.com",
    companyName: "카카오",
    ownerName: "윤채원",
    phoneSuffix: "1007",
    industry: "플랫폼",
    jobRoleCode: "웹풀스택",
    jobRole: "Platform Fullstack Engineer",
    title: "플랫폼 풀스택 엔지니어",
    regionCode: "제주",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Spring #React #Kotlin",
    address: "제주특별자치도 제주시 첨단로 242",
    lat: 33.4507,
    lng: 126.5707,
  },
  {
    slug: "coupang",
    domain: "coupang.com",
    companyName: "쿠팡",
    ownerName: "오시우",
    phoneSuffix: "1008",
    industry: "커머스·물류",
    jobRoleCode: "데이터 엔지니어",
    jobRole: "Logistics Data Engineer",
    title: "물류 최적화 데이터 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Spark #Airflow #DataLake",
    address: "서울특별시 송파구 송파대로 570",
    lat: 37.5145,
    lng: 127.1059,
  },
  {
    slug: "viva-republica",
    domain: "toss.im",
    companyName: "비바리퍼블리카",
    ownerName: "한유진",
    phoneSuffix: "1009",
    industry: "핀테크",
    jobRoleCode: "보안",
    jobRole: "Financial Security Engineer",
    title: "금융 보안 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Security #FinTech #Audit",
    address: "서울특별시 강남구 테헤란로 142",
    lat: 37.5007,
    lng: 127.0365,
  },
  {
    slug: "line-plus",
    domain: "line.me",
    companyName: "LINE Plus",
    ownerName: "서지호",
    phoneSuffix: "1010",
    industry: "글로벌 메신저",
    jobRoleCode: "iOS",
    jobRole: "Global Messenger iOS Engineer",
    title: "글로벌 메신저 iOS 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Swift #iOS #Realtime",
    address: "경기도 성남시 분당구 황새울로 360번길 42",
    lat: 37.385,
    lng: 127.1224,
  },
  {
    slug: "sk-telecom",
    domain: "sktelecom.com",
    companyName: "SK텔레콤",
    ownerName: "장서준",
    phoneSuffix: "1011",
    industry: "통신·AI",
    jobRoleCode: "AI·ML",
    jobRole: "Telco AI Engineer",
    title: "통신 AI 서비스 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#LLM #Recommendation #Python",
    address: "서울특별시 중구 을지로 65",
    lat: 37.5663,
    lng: 126.985,
  },
  {
    slug: "kt",
    domain: "kt.com",
    companyName: "KT",
    ownerName: "문가은",
    phoneSuffix: "1012",
    industry: "통신·클라우드",
    jobRoleCode: "DevOps·SRE",
    jobRole: "Cloud SRE Engineer",
    title: "클라우드 SRE 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Kubernetes #SRE #Observability",
    address: "서울특별시 종로구 종로3길 33",
    lat: 37.5703,
    lng: 126.979,
  },
  {
    slug: "lg-uplus",
    domain: "lguplus.com",
    companyName: "LG유플러스",
    ownerName: "배하늘",
    phoneSuffix: "1013",
    industry: "통신·미디어",
    jobRoleCode: "안드로이드",
    jobRole: "Media Android Engineer",
    title: "미디어 앱 안드로이드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Kotlin #Android #Streaming",
    address: "서울특별시 용산구 한강대로 32",
    lat: 37.5285,
    lng: 126.9644,
  },
  {
    slug: "samsung-sds",
    domain: "samsungsds.com",
    companyName: "삼성SDS",
    ownerName: "남도현",
    phoneSuffix: "1014",
    industry: "IT서비스·클라우드",
    jobRoleCode: "DevOps·SRE",
    jobRole: "Enterprise Cloud Engineer",
    title: "엔터프라이즈 클라우드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Cloud #Terraform #SRE",
    address: "서울특별시 송파구 올림픽로35길 125",
    lat: 37.5153,
    lng: 127.1028,
  },
  {
    slug: "hyundai-mobis",
    domain: "www.mobis.co.kr",
    companyName: "현대모비스",
    ownerName: "신지안",
    phoneSuffix: "1015",
    industry: "모빌리티 부품",
    jobRoleCode: "기타 IT·개발",
    jobRole: "Automotive Software Engineer",
    title: "차량 제어 소프트웨어 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Embedded #C++ #Automotive",
    address: "서울특별시 강남구 테헤란로 203",
    lat: 37.5013,
    lng: 127.0396,
  },
  {
    slug: "posco-dx",
    domain: "posco.co.kr",
    companyName: "POSCO DX",
    ownerName: "노수빈",
    phoneSuffix: "1016",
    industry: "스마트팩토리",
    jobRoleCode: "데이터 엔지니어",
    jobRole: "Smart Factory Data Engineer",
    title: "스마트팩토리 데이터 엔지니어",
    regionCode: "경북",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#IoT #Data #Manufacturing",
    address: "경상북도 포항시 남구 동해안로 6261",
    lat: 35.9945,
    lng: 129.3972,
  },
  {
    slug: "hanwha-systems",
    domain: "hanwha.com",
    companyName: "한화시스템",
    ownerName: "차은우",
    phoneSuffix: "1017",
    industry: "방산·ICT",
    jobRoleCode: "보안",
    jobRole: "Defense Security Engineer",
    title: "방산 시스템 보안 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Security #Network #Defense",
    address: "경기도 성남시 분당구 판교역로 188",
    lat: 37.3972,
    lng: 127.1106,
  },
  {
    slug: "doosan-robotics",
    domain: "doosanrobotics.com",
    companyName: "두산로보틱스",
    ownerName: "백태오",
    phoneSuffix: "1018",
    industry: "로보틱스",
    jobRoleCode: "AI·ML",
    jobRole: "Robotics AI Engineer",
    title: "협동로봇 AI 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Robotics #Vision #Python",
    address: "경기도 수원시 권선구 산업로156번길 79",
    lat: 37.2502,
    lng: 126.9751,
  },
  {
    slug: "cj-olive-networks",
    domain: "cjolivenetworks.co.kr",
    companyName: "CJ올리브네트웍스",
    ownerName: "유나경",
    phoneSuffix: "1019",
    industry: "IT서비스",
    jobRoleCode: "웹풀스택",
    jobRole: "Enterprise Fullstack Engineer",
    title: "엔터프라이즈 풀스택 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Java #React #Cloud",
    address: "서울특별시 용산구 한강대로 366",
    lat: 37.5512,
    lng: 126.9728,
  },
  {
    slug: "lotte-innovate",
    domain: "lotteinnovate.com",
    companyName: "롯데이노베이트",
    ownerName: "임하준",
    phoneSuffix: "1020",
    industry: "리테일 IT",
    jobRoleCode: "개발 PM",
    jobRole: "Retail Platform TPM",
    title: "리테일 플랫폼 개발 PM",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Product #Retail #API",
    address: "서울특별시 금천구 가산디지털2로 179",
    lat: 37.4813,
    lng: 126.8815,
  },
  {
    slug: "shinhan-bank",
    domain: "bank.shinhan.com",
    companyName: "신한은행",
    ownerName: "홍서아",
    phoneSuffix: "1021",
    industry: "금융",
    jobRoleCode: "보안",
    jobRole: "Banking Security Engineer",
    title: "금융 보안 플랫폼 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Security #Banking #Compliance",
    address: "서울특별시 중구 세종대로9길 20",
    lat: 37.5617,
    lng: 126.975,
  },
  {
    slug: "kb-kookmin-bank",
    domain: "kbstar.com",
    companyName: "KB국민은행",
    ownerName: "권지후",
    phoneSuffix: "1022",
    industry: "금융",
    jobRoleCode: "서버·백엔드",
    jobRole: "Banking Backend Engineer",
    title: "디지털 뱅킹 백엔드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#Java #MSA #Banking",
    address: "서울특별시 영등포구 국제금융로8길 26",
    lat: 37.5239,
    lng: 126.9286,
  },
  {
    slug: "hana-bank",
    domain: "kebhana.com",
    companyName: "하나은행",
    ownerName: "조은재",
    phoneSuffix: "1023",
    industry: "금융",
    jobRoleCode: "데이터 엔지니어",
    jobRole: "Financial Data Engineer",
    title: "금융 데이터 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#DataWarehouse #SQL #Finance",
    address: "서울특별시 중구 을지로 35",
    lat: 37.5661,
    lng: 126.9828,
  },
  {
    slug: "woori-bank",
    domain: "wooribank.com",
    companyName: "우리은행",
    ownerName: "민서준",
    phoneSuffix: "1024",
    industry: "금융",
    jobRoleCode: "프론트엔드",
    jobRole: "Banking Frontend Engineer",
    title: "디지털 채널 프론트엔드 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#React #TypeScript #Accessibility",
    address: "서울특별시 중구 소공로 51",
    lat: 37.5588,
    lng: 126.9826,
  },
  {
    slug: "kakao-bank",
    domain: "kakaobank.com",
    companyName: "카카오뱅크",
    ownerName: "송다인",
    phoneSuffix: "1025",
    industry: "인터넷은행",
    jobRoleCode: "QA·테스트",
    jobRole: "Banking QA Automation Engineer",
    title: "금융 서비스 QA 자동화 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#QA #Playwright #Banking",
    address: "경기도 성남시 분당구 분당내곡로 131",
    lat: 37.4006,
    lng: 127.1087,
  },
  {
    slug: "nexon",
    domain: "nexon.com",
    companyName: "넥슨",
    ownerName: "양주원",
    phoneSuffix: "1026",
    industry: "게임",
    jobRoleCode: "서버·백엔드",
    jobRole: "Game Server Engineer",
    title: "라이브 게임 서버 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#GameServer #C++ #DistributedSystem",
    address: "경기도 성남시 분당구 판교로256번길 7",
    lat: 37.402,
    lng: 127.1048,
  },
  {
    slug: "netmarble",
    domain: "netmarble.com",
    companyName: "넷마블",
    ownerName: "강로아",
    phoneSuffix: "1027",
    industry: "게임",
    jobRoleCode: "기타 IT·개발",
    jobRole: "Game Client Engineer",
    title: "모바일 게임 클라이언트 엔지니어",
    regionCode: "서울",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#Unity #CSharp #MobileGame",
    address: "서울특별시 구로구 디지털로26길 38",
    lat: 37.4816,
    lng: 126.8956,
  },
  {
    slug: "ncsoft",
    domain: "ncsoft.com",
    companyName: "엔씨소프트",
    ownerName: "이태경",
    phoneSuffix: "1028",
    industry: "게임·AI",
    jobRoleCode: "AI·ML",
    jobRole: "Game AI Engineer",
    title: "게임 AI 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#AI #Game #Python",
    address: "경기도 성남시 분당구 대왕판교로644번길 12",
    lat: 37.3996,
    lng: 127.1102,
  },
  {
    slug: "smilegate",
    domain: "smilegate.com",
    companyName: "스마일게이트",
    ownerName: "전유찬",
    phoneSuffix: "1029",
    industry: "게임·플랫폼",
    jobRoleCode: "DevOps·SRE",
    jobRole: "Game Platform SRE",
    title: "게임 플랫폼 SRE 엔지니어",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "마감형",
    tags: "#SRE #Kubernetes #GamePlatform",
    address: "경기도 성남시 분당구 판교역로 220",
    lat: 37.3954,
    lng: 127.111,
  },
  {
    slug: "pearl-abyss",
    domain: "pearlabyss.com",
    companyName: "펄어비스",
    ownerName: "황아린",
    phoneSuffix: "1030",
    industry: "게임",
    jobRoleCode: "기타 IT·개발",
    jobRole: "Game Engine Engineer",
    title: "게임 엔진 개발자",
    regionCode: "경기",
    employmentTypeCode: "정규직",
    recruitmentType: "상시",
    tags: "#GameEngine #C++ #Rendering",
    address: "경기도 과천시 과천대로2길 48",
    lat: 37.4274,
    lng: 126.9916,
  },
];

export const companyJobListingSeeds: CompanyJobListingSeed[] = realCompanySeedInputs.map((input, index) => {
  const companyId = 101 + index;
  const postingId = 1101 + index;
  const careerMinYears = index % 5;
  const logoStorageKey = buildSeedCompanyLogoStorageKey(input.slug);

  return {
    companySlug: input.slug,
    logoSourceDomain: input.domain,
    logoSourceUrl: buildSeedCompanyLogoSourceUrl(input.domain),
    ownerUser: {
      userId: companyId,
      email: `recruiter.${input.slug}@example.com`,
      name: input.ownerName,
      phone: `010-4301-${input.phoneSuffix}`,
    },
    logoFile: {
      fileId: 1101 + index,
      storageKey: logoStorageKey,
      originalName: `${input.slug}-logo.png`,
      mimeType: SEED_COMPANY_LOGO_MIME_TYPE,
      sizeBytes: 0,
    },
    company: {
      companyId,
      ownerUserId: companyId,
      name: input.companyName,
      businessRegistrationNumber: `2000000${companyId}`,
      verificationStatus: "VERIFIED",
      logoFileId: 1101 + index,
      industry: input.industry,
      profile: `${input.companyName}는 ${input.industry} 영역에서 대규모 서비스를 운영하는 기업입니다.`,
      talentProfile: "대규모 트래픽과 복잡한 비즈니스 문제를 구조적으로 해결하는 동료를 찾습니다.",
      evaluationPolicy: "직무 역량 45%, 문제 해결 35%, 협업 커뮤니케이션 20%",
    },
    postings: [
      {
        postingId,
        title: input.title,
        jobRole: input.jobRole,
        jobDescription: `${input.companyName}에서 ${input.title} 포지션을 채용합니다. ${input.tags}`,
        careerRequirement: careerMinYears === 0 ? "신입 가능" : `경력 ${careerMinYears}년 이상`,
        educationRequirement: "학력무관",
        salaryInfo: index % 3 === 0 ? "면접 후 협의" : "회사 내규에 따름",
        workLocation: input.regionCode,
        employmentType: input.employmentTypeCode,
        jobRoleCode: input.jobRoleCode,
        regionCode: input.regionCode,
        careerMinYears,
        careerMaxYears: Math.min(10, careerMinYears + 5),
        employmentTypeCode: input.employmentTypeCode,
        recruitmentType: input.recruitmentType,
        workplaceAddress: input.address,
        workplaceLat: input.lat,
        workplaceLng: input.lng,
        startsInDays: -(index % 10) - 1,
        endsInDays: 18 + index,
        status: index % 7 === 0 ? "CLOSING_SOON" : "OPEN",
        createdDaysAgo: index + 1,
      },
    ],
  };
});

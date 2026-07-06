import {
  buildRecruitmentCreateSearch,
  getBasicRecruitmentInfoValidation,
  isRecruitmentEndDateBeforeStart,
  normalizeRecruitmentCreateRoute,
} from "./recruitment-create-wizard";

const validBasicInfo = {
  title: "신입 백엔드 개발자",
  jobRole: "Backend Developer",
  career: "신입 이상",
  employmentType: "정규직",
  startsOn: "2026-07-10",
  endsOn: "2026-07-31",
  location: "서울 강남구",
};

if (getBasicRecruitmentInfoValidation(validBasicInfo) !== null) {
  throw new Error("Complete basic recruitment info should pass validation.");
}

const requiredBasicInfoKeys: Array<keyof typeof validBasicInfo> = [
  "title",
  "jobRole",
  "career",
  "employmentType",
  "startsOn",
  "endsOn",
  "location",
];

for (const key of requiredBasicInfoKeys) {
  if (getBasicRecruitmentInfoValidation({ ...validBasicInfo, [key]: " " }) !== "기본 정보를 모두 입력해주세요.") {
    throw new Error(`Basic recruitment info should require ${key}.`);
  }
}

if (getBasicRecruitmentInfoValidation({ ...validBasicInfo, endsOn: "2026-07-09" }) !== "채용 마감일은 채용 시작일보다 빠를 수 없습니다.") {
  throw new Error("Basic recruitment info should reject an end date before the start date.");
}

if (!isRecruitmentEndDateBeforeStart("2026-07-10", "2026-07-09")) {
  throw new Error("Date helper should detect an end date before the start date.");
}

if (isRecruitmentEndDateBeforeStart("2026-07-10", "2026-07-10")) {
  throw new Error("Date helper should allow the same start and end date.");
}

const formRoute = normalizeRecruitmentCreateRoute({ phase: "form", step: "3" }, 12);
if (formRoute.phase !== "form" || formRoute.step !== 3) {
  throw new Error("Wizard route should restore a form step from query params.");
}

const clampedRoute = normalizeRecruitmentCreateRoute({ phase: "form", step: "99" }, 12);
if (clampedRoute.phase !== "form" || clampedRoute.step !== 12) {
  throw new Error("Wizard route should clamp form steps to the available range.");
}

const introRoute = normalizeRecruitmentCreateRoute({}, 12);
if (introRoute.phase !== "intro" || introRoute.step !== 0) {
  throw new Error("Wizard route without query params should start at intro.");
}

if (buildRecruitmentCreateSearch({ phase: "form", step: 4 }) !== "?phase=form&step=4") {
  throw new Error("Wizard form route should serialize phase and step.");
}

if (buildRecruitmentCreateSearch({ phase: "intro", step: 0 }) !== "") {
  throw new Error("Wizard intro route should keep the base URL clean.");
}

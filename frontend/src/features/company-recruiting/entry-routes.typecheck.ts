import { CompanyPostingsPage } from "./CompanyPostingsPage";
import { ApplicantEvaluationPage } from "./ApplicantEvaluationPage";
import { RecruitmentCreatePage } from "./RecruitmentCreatePage";
import { RecruitmentInterviewSettingsBridgePage } from "./RecruitmentInterviewSettingsBridgePage";
import { RecruitmentSettingsPage } from "./RecruitmentSettingsPage";
import { buildInterviewSettingsHref } from "./routes";

const companyRecruitingEntryRoutes = {
  dashboard: "/company/applications/dashboard",
  recruitmentCreate: "/company/recruitments/new",
  recruitmentDashboard: "/company/recruitments/:recruitmentId",
  recruitmentSettings: "/company/recruitments/:recruitmentId/settings",
  recruitmentInterviewSettings: "/company/recruitments/:recruitmentId/interview-settings",
  applicantEvaluation: "/company/applicants/:applicantId/evaluation",
} as const satisfies {
  dashboard: "/company/applications/dashboard";
  recruitmentCreate: "/company/recruitments/new";
  recruitmentDashboard: "/company/recruitments/:recruitmentId";
  recruitmentSettings: "/company/recruitments/:recruitmentId/settings";
  recruitmentInterviewSettings: "/company/recruitments/:recruitmentId/interview-settings";
  applicantEvaluation: "/company/applicants/:applicantId/evaluation";
};

const interviewSettingsHref: `/company/recruitments/${number}/interview-settings` = buildInterviewSettingsHref(1);

void CompanyPostingsPage;
void RecruitmentCreatePage;
void RecruitmentInterviewSettingsBridgePage;
void RecruitmentSettingsPage;
void ApplicantEvaluationPage;
void interviewSettingsHref;
void companyRecruitingEntryRoutes;

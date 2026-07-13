import { candidateAccountBillingNav, candidateNavLabels, isCandidateAccountBillingPath } from "./candidate-nav-config";

if (candidateNavLabels.accountBilling !== "마이페이지") {
  throw new Error("Candidate account navigation label should be 마이페이지.");
}

if (candidateAccountBillingNav.length !== 5) {
  throw new Error("Candidate account dropdown should expose 프로필, 지원 내역, 지원서 세트, 결제, 지표 tabs.");
}

if (candidateAccountBillingNav[0]?.label !== "프로필" || candidateAccountBillingNav[0]?.href !== "/candidate/mypage") {
  throw new Error("Candidate account dropdown should link 프로필 to the candidate mypage.");
}

if (candidateAccountBillingNav[1]?.label !== "지원 내역" || candidateAccountBillingNav[1]?.href !== "/candidate/applications") {
  throw new Error("Candidate account dropdown should link 지원 내역 to the candidate applications page.");
}

if (candidateAccountBillingNav[2]?.label !== "지원서 세트" || candidateAccountBillingNav[2]?.href !== "/candidate/application-sets") {
  throw new Error("Candidate account dropdown should link 지원서 세트 to the candidate application-sets page.");
}

if (candidateAccountBillingNav[3]?.label !== "결제" || candidateAccountBillingNav[3]?.href !== "/candidate/billing") {
  throw new Error("Candidate account dropdown should link 결제 to the candidate billing page.");
}

if (candidateAccountBillingNav[4]?.label !== "지표" || candidateAccountBillingNav[4]?.href !== "/ai/performance") {
  throw new Error("Candidate account dropdown should link 지표 to the AI performance page.");
}

if (!isCandidateAccountBillingPath("/candidate/billing")) {
  throw new Error("Candidate billing route should keep the account/billing navigation section active.");
}

if (!isCandidateAccountBillingPath("/ai/performance")) {
  throw new Error("AI performance route should keep the mypage navigation section active.");
}

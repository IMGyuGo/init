import { candidateAccountBillingNav, candidateNavLabels, isCandidateAccountBillingPath } from "./candidate-nav-config";

if (candidateNavLabels.accountBilling !== "마이페이지") {
  throw new Error("Candidate account navigation label should be 마이페이지.");
}

if (candidateAccountBillingNav.length !== 4) {
  throw new Error("Candidate account dropdown should expose mypage, billing, applications and performance tabs.");
}

if (candidateAccountBillingNav[0]?.label !== "마이페이지" || candidateAccountBillingNav[0]?.href !== "/candidate/mypage") {
  throw new Error("Candidate account dropdown should link 마이페이지 to the candidate mypage.");
}

if (candidateAccountBillingNav[1]?.label !== "결제" || candidateAccountBillingNav[1]?.href !== "/candidate/billing") {
  throw new Error("Candidate account dropdown should link 결제 to the candidate billing page.");
}

if (candidateAccountBillingNav[2]?.label !== "지원현황" || candidateAccountBillingNav[2]?.href !== "/candidate/applications") {
  throw new Error("Candidate account dropdown should link 지원현황 to the candidate applications page.");
}

if (candidateAccountBillingNav[3]?.label !== "지표" || candidateAccountBillingNav[3]?.href !== "/ai/performance") {
  throw new Error("Candidate account dropdown should link 지표 to the AI performance page.");
}

if (!isCandidateAccountBillingPath("/candidate/billing")) {
  throw new Error("Candidate billing route should keep the account/billing navigation section active.");
}

if (!isCandidateAccountBillingPath("/ai/performance")) {
  throw new Error("AI performance route should keep the mypage navigation section active.");
}

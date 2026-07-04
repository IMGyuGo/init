import { candidateAccountBillingNav, candidateNavLabels, isCandidateAccountBillingPath } from "./candidate-nav-config";

if (candidateNavLabels.accountBilling !== "계정/결제") {
  throw new Error("Candidate account navigation label should be 계정/결제.");
}

if (candidateAccountBillingNav.length !== 2) {
  throw new Error("Candidate account dropdown should expose account and billing tabs.");
}

if (candidateAccountBillingNav[0]?.label !== "계정" || candidateAccountBillingNav[0]?.href !== "/candidate/mypage") {
  throw new Error("Candidate account dropdown should link 계정 to the candidate mypage.");
}

if (candidateAccountBillingNav[1]?.label !== "결제" || candidateAccountBillingNav[1]?.href !== "/candidate/billing") {
  throw new Error("Candidate account dropdown should link 결제 to the candidate billing page.");
}

if (!isCandidateAccountBillingPath("/candidate/billing")) {
  throw new Error("Candidate billing route should keep the account/billing navigation section active.");
}


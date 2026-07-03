import { companyAccountBillingNav, companyNavLabels } from "./company-nav-config";

if (companyNavLabels.accountBilling !== "계정/결제") {
  throw new Error("Company account navigation label should be 계정/결제.");
}

if (companyAccountBillingNav.length !== 2) {
  throw new Error("Company account dropdown should expose account and billing tabs.");
}

if (companyAccountBillingNav[0]?.label !== "계정" || companyAccountBillingNav[0]?.href !== "/company/mypage") {
  throw new Error("Company account dropdown should link 계정 to the company profile page.");
}

if (companyAccountBillingNav[1]?.label !== "결제" || !("disabled" in companyAccountBillingNav[1]) || !companyAccountBillingNav[1].disabled) {
  throw new Error("Company account dropdown should reserve 결제 as a disabled billing tab.");
}

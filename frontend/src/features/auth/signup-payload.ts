type SignupUserType = "COMPANY" | "CANDIDATE";

export type SignupFormValue = {
  name: string;
  companyName: string;
  email: string;
  code: string;
  password: string;
  passwordConfirm: string;
  termsAgreed: boolean;
};

export function buildSignupPayload(userType: SignupUserType, form: SignupFormValue) {
  if (userType === "COMPANY") {
    return form;
  }

  return {
    name: form.name,
    email: form.email,
    code: form.code,
    password: form.password,
    passwordConfirm: form.passwordConfirm,
    termsAgreed: form.termsAgreed,
  };
}

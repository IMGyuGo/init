import assert from "node:assert/strict";
import test from "node:test";
import { buildSignupPayload } from "./signup-payload";

const form = {
  name: "김지원",
  companyName: "지원자 요청에는 없어야 하는 값",
  email: "candidate@example.com",
  code: "123456",
  password: "Password123",
  passwordConfirm: "Password123",
  termsAgreed: true,
};

test("지원자 회원가입 payload에서 기업 전용 필드를 제외한다", () => {
  assert.deepEqual(buildSignupPayload("CANDIDATE", form), {
    name: "김지원",
    email: "candidate@example.com",
    code: "123456",
    password: "Password123",
    passwordConfirm: "Password123",
    termsAgreed: true,
  });
});

test("기업 회원가입 payload에는 회사명을 유지한다", () => {
  assert.deepEqual(buildSignupPayload("COMPANY", form), form);
});

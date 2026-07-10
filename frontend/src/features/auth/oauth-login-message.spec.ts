import assert from "node:assert/strict";
import test from "node:test";
import { getOAuthLoginMessageState, toOAuthLoginErrorPath } from "./oauth-login-message";

test("getOAuthLoginMessageState reads OAuth error message and removes auth query parameters", () => {
  const state = getOAuthLoginMessageState(
    "http://localhost:3000/login?errorCode=AUTH_USER_TYPE_MISMATCH&message=%EA%B8%B0%EC%97%85%20%EA%B3%84%EC%A0%95%EC%9D%80%20Google%20%EB%A1%9C%EA%B7%B8%EC%9D%B8%EC%9D%84%20%EC%82%AC%EC%9A%A9%ED%95%A0%20%EC%88%98%20%EC%97%86%EC%8A%B5%EB%8B%88%EB%8B%A4.&next=%2Fcandidate%2Fjobs",
  );

  assert.equal(state.message, "기업 계정은 Google 로그인을 사용할 수 없습니다.");
  assert.equal(state.cleanPath, "/login?next=%2Fcandidate%2Fjobs");
});

test("getOAuthLoginMessageState ignores login URLs without an OAuth message", () => {
  const state = getOAuthLoginMessageState("http://localhost:3000/login?next=%2Fcandidate%2Fjobs");

  assert.equal(state.message, "");
  assert.equal(state.cleanPath, "/login?next=%2Fcandidate%2Fjobs");
});

test("toOAuthLoginErrorPath builds the login URL that carries an OAuth failure message", () => {
  const path = toOAuthLoginErrorPath("Google 로그인 세션을 확인할 수 없습니다.", "COMMON_UNAUTHORIZED");

  assert.equal(
    path,
    "/login?errorCode=COMMON_UNAUTHORIZED&message=Google+%EB%A1%9C%EA%B7%B8%EC%9D%B8+%EC%84%B8%EC%85%98%EC%9D%84+%ED%99%95%EC%9D%B8%ED%95%A0+%EC%88%98+%EC%97%86%EC%8A%B5%EB%8B%88%EB%8B%A4.",
  );
});

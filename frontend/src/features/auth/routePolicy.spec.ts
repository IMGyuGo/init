import assert from "node:assert/strict";
import test from "node:test";

import { getLogoutRedirectPath, getRouteAccess } from "./routePolicy";

test("company login is public even though it lives under the protected company prefix", () => {
  assert.deepEqual(getRouteAccess("/company/login"), { kind: "public" });
});

test("company application pages remain company-only", () => {
  assert.deepEqual(getRouteAccess("/company/applications/dashboard"), {
    kind: "protected",
    allowedUserTypes: ["COMPANY"],
    loginPath: "/company/login",
  });
});

test("company recruitment pages use the company login destination", () => {
  assert.deepEqual(getRouteAccess("/company/recruitments"), {
    kind: "protected",
    allowedUserTypes: ["COMPANY"],
    loginPath: "/company/login",
  });
});

test("nested company recruitment pages inherit the company login destination", () => {
  assert.deepEqual(getRouteAccess("/company/recruitments/42/settings"), {
    kind: "protected",
    allowedUserTypes: ["COMPANY"],
    loginPath: "/company/login",
  });
});

test("candidate pages remain candidate-only", () => {
  assert.deepEqual(getRouteAccess("/candidate/jobs"), {
    kind: "protected",
    allowedUserTypes: ["CANDIDATE"],
    loginPath: "/login",
  });
});

test("company logout returns to the public candidate job list", () => {
  assert.equal(getLogoutRedirectPath("COMPANY"), "/");
});

test("candidate logout keeps the candidate login destination", () => {
  assert.equal(getLogoutRedirectPath("CANDIDATE"), "/login");
});

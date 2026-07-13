import assert from "node:assert/strict";
import test from "node:test";

import { getRouteAccess } from "./routePolicy";

test("company login is public even though it lives under the protected company prefix", () => {
  assert.deepEqual(getRouteAccess("/company/login"), { kind: "public" });
});

test("company application pages remain company-only", () => {
  assert.deepEqual(getRouteAccess("/company/applications/dashboard"), {
    kind: "protected",
    allowedUserTypes: ["COMPANY"],
  });
});

test("candidate pages remain candidate-only", () => {
  assert.deepEqual(getRouteAccess("/candidate/jobs"), {
    kind: "protected",
    allowedUserTypes: ["CANDIDATE"],
  });
});

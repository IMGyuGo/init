import { strict as assert } from "node:assert";

import { isNcsQuestionPolicyEnabled } from "./ncs-feature-flag";

assert.equal(isNcsQuestionPolicyEnabled(undefined), true);
assert.equal(isNcsQuestionPolicyEnabled("true"), true);
assert.equal(isNcsQuestionPolicyEnabled(" false "), false);
assert.equal(isNcsQuestionPolicyEnabled("FALSE"), false);

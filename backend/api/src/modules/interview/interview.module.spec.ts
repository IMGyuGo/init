import "reflect-metadata";
import { strict as assert } from "node:assert";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { CandidateModule } from "../candidate";
import { PaymentModule } from "../payment/payment.module";
import { InterviewController } from "./controller/interview.controller";
import { InterviewModule } from "./interview.module";
import { INTERVIEW_REPOSITORY } from "./repository/interview.repository";
import { InterviewService } from "./service/interview.service";
import { RealtimeSessionCredentialService } from "./service/realtime-session-credential.service";

const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InterviewModule) as unknown[];
const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InterviewModule) as unknown[];
const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InterviewModule) as unknown[];
const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, InterviewModule) as unknown[];

assert.ok(imports.includes(CandidateModule));
assert.ok(imports.includes(PaymentModule));
assert.ok(controllers.includes(InterviewController));
assert.ok(providers.includes(InterviewService));
assert.ok(providers.includes(RealtimeSessionCredentialService));
assert.ok(providers.some((provider) => typeof provider === "object" && provider !== null && Reflect.get(provider, "provide") === INTERVIEW_REPOSITORY));
assert.ok(exportsMetadata.includes(INTERVIEW_REPOSITORY));
assert.ok(exportsMetadata.includes(InterviewService));
assert.ok(exportsMetadata.includes(RealtimeSessionCredentialService));

test("interview module metadata", () => {
  assert.ok(imports.includes(CandidateModule));
  assert.ok(imports.includes(PaymentModule));
});

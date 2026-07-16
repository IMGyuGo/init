import "reflect-metadata";
import { strict as assert } from "node:assert";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { CandidateModule } from "../candidate";
import { InterviewModule } from "../interview";
import { CandidateReportMediaController } from "./controller/candidate-report-media.controller";
import { ReportController } from "./controller/report.controller";
import { ReportModule } from "./report.module";
import { CANDIDATE_REPORT_REPOSITORY } from "./repository/candidate-report.repository";
import { ReportService } from "./service/report.service";

const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ReportModule) as unknown[];
const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ReportModule) as unknown[];
const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ReportModule) as unknown[];
const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ReportModule) as unknown[];

assert.ok(imports.includes(CandidateModule));
assert.ok(imports.includes(InterviewModule));
assert.ok(controllers.includes(ReportController));
assert.ok(controllers.includes(CandidateReportMediaController));
assert.ok(providers.includes(ReportService));
assert.ok(providers.some((provider) => typeof provider === "object" && provider !== null && Reflect.get(provider, "provide") === CANDIDATE_REPORT_REPOSITORY));
assert.ok(exportsMetadata.includes(CANDIDATE_REPORT_REPOSITORY));
assert.ok(exportsMetadata.includes(ReportService));

test("report module metadata", () => {
  assert.ok(imports.includes(CandidateModule));
});

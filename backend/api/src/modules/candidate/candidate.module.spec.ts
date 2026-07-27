import "reflect-metadata";
import { strict as assert } from "node:assert";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { CandidateController } from "./controller/candidate.controller";
import { CandidateModule } from "./candidate.module";
import { CANDIDATE_REPOSITORY, CandidateService } from "./service/candidate.service";
import { CANDIDATE_DOCUMENT_STORAGE } from "./service/candidate-document-storage.adapter";

interface ProviderDefinition {
  provide: unknown;
  useFactory: unknown;
}

function isProviderDefinition(provider: unknown): provider is ProviderDefinition {
  return typeof provider === "object" && provider !== null && "provide" in provider && "useFactory" in provider;
}

const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CandidateModule) as unknown[];
const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CandidateModule) as unknown[];
const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, CandidateModule) as unknown[];

assert.ok(controllers.includes(CandidateController));
assert.ok(providers.includes(CandidateService));
assert.ok(exportsMetadata.includes(CandidateService));

const repositoryProvider = providers.find(isProviderDefinition);
assert.equal(repositoryProvider?.provide, CANDIDATE_REPOSITORY);
assert.equal(typeof repositoryProvider?.useFactory, "function");
assert.ok(
  providers.some(
    (provider) =>
      typeof provider === "object" &&
      provider !== null &&
      "provide" in provider &&
      provider.provide === CANDIDATE_DOCUMENT_STORAGE,
  ),
);

test("candidate module metadata", () => {
  assert.ok(controllers.includes(CandidateController));
});

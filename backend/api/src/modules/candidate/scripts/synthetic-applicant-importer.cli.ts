import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  formatSyntheticImporterFailure,
  parseSyntheticImporterArgs,
  serializeSyntheticImporterOutput,
  validateSyntheticEnvironment,
} from "./synthetic-applicant-importer.contract";
import { PrismaSyntheticApplicantStore } from "./prisma-synthetic-applicant.store";
import { SyntheticApplicantImporterService } from "./synthetic-applicant-importer.service";

async function main() {
  const options = parseSyntheticImporterArgs(process.argv.slice(2));
  validateSyntheticEnvironment(options);
  const prisma = new PrismaClient();
  const service = new SyntheticApplicantImporterService(new PrismaSyntheticApplicantStore(prisma));

  try {
    if (options.action === "plan") {
      print(await service.plan(options));
      return;
    }
    if (options.action === "apply") {
      const password = process.env.SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD ?? "";
      const passwordHash = await bcrypt.hash(password, 12);
      print(await service.apply(options, passwordHash));
      return;
    }
    print(await service.previewCleanup(options));
    print(await service.cleanup(options));
  } finally {
    await prisma.$disconnect();
  }
}

function print(value: unknown) {
  process.stdout.write(serializeSyntheticImporterOutput(value));
}

main().catch((error) => {
  process.stderr.write(formatSyntheticImporterFailure(error));
  process.exitCode = 1;
});

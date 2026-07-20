import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  parseSyntheticImporterArgs,
  sanitizeSyntheticError,
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
  process.stdout.write(`${JSON.stringify(value, (_, nested) => typeof nested === "bigint" ? nested.toString() : nested, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`synthetic-applicant-importer failed: ${sanitizeSyntheticError(error)}\n`);
  process.exitCode = 1;
});

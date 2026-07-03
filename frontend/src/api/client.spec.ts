import { getDefaultEntryPath } from "./client";

const companyEntryPath: "/company/applications/dashboard" = getDefaultEntryPath("COMPANY");
const candidateEntryPath: "/candidate/jobs" = getDefaultEntryPath("CANDIDATE");
const adminEntryPath: "/" = getDefaultEntryPath("ADMIN");

void companyEntryPath;
void candidateEntryPath;
void adminEntryPath;

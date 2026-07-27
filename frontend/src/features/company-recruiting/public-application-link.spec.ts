import {
  buildPublicApplicationPath,
  buildPublicApplicationUrl,
  getPublicApplicationLinkState,
} from "./public-application-link";
import type { Recruitment } from "./types";

const openRecruitment = {
  postingId: 42,
  status: "OPEN",
} as Recruitment;

const draftRecruitment = {
  postingId: 42,
  status: "DRAFT",
} as Recruitment;

if (buildPublicApplicationPath(openRecruitment) !== "/public/recruitments/42/apply") {
  throw new Error("Public application path should target the public recruitment apply route.");
}

if (buildPublicApplicationUrl(openRecruitment, "https://init.example.com/") !== "https://init.example.com/public/recruitments/42/apply") {
  throw new Error("Public application URL should combine origin and public apply path.");
}

const openState = getPublicApplicationLinkState(openRecruitment, "https://init.example.com");
if (!openState.isAvailable || openState.statusLabel !== "사용 가능") {
  throw new Error("OPEN recruitment should expose an available public application link.");
}

const draftState = getPublicApplicationLinkState(draftRecruitment, "https://init.example.com");
if (draftState.isAvailable || draftState.statusLabel !== "사용 불가") {
  throw new Error("Non-OPEN recruitment should not expose an available public application link.");
}

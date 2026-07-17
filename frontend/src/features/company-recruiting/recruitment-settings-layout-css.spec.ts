import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

assert.doesNotMatch(
  css,
  /\.posting-create-flow\s+\.grid-2\s*\{[^}]*grid-template-columns:\s*1fr;/s,
  "공고 설정 기본 정보는 공통 2열 grid-2 레이아웃을 재사용해야 합니다.",
);

assert.doesNotMatch(
  css,
  /\.posting-create-flow\s+\.grid-2\s+\.wide\s*\{[^}]*grid-column:\s*auto;/s,
  "공고 제목의 wide 전체 폭 배치를 해제하면 안 됩니다.",
);

assert.match(
  css,
  /\.app-shell\s+\.grid-2\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/s,
  "기업 화면의 공통 grid-2는 데스크톱에서 2열이어야 합니다.",
);

assert.match(
  css,
  /\.wide,\s*\.grid-full\s*\{[^}]*grid-column:\s*1 \/ -1;/s,
  "wide 필드는 공통 그리드 전체 폭을 차지해야 합니다.",
);

console.log("recruitment-settings-layout-css.spec: all assertions passed");

## 📌 관련 이슈
closes #이슈번호

## 📝 작업 내용
<!-- 어떤 작업을 했는지 간단히 설명해주세요 -->

## 🔍 변경 사항
- [ ] 기능 추가
- [ ] 버그 수정
- [ ] 리팩토링
- [ ] 문서 수정
- [ ] 기타

## 📸 스크린샷 (UI 변경 시)
<!-- 변경된 UI가 있다면 스크린샷을 첨부해주세요 -->

## ✅ 체크리스트
- [ ] 코드 셀프 리뷰 완료
- [ ] 테스트 완료
- [ ] 불필요한 코드/주석 제거
- [ ] PR base branch가 `dev`인지 확인
- [ ] 담당 역할의 one-time alignment 문서를 적용했거나, 적용 대상이 아님을 설명
- [ ] `npm install`이 아닌 `npm ci` 기준으로 검증
- [ ] `package.json` 변경 시 같은 package의 `package-lock.json`도 함께 변경
- [ ] 의존성 version 변경 시 A 또는 PM 리뷰 필요성을 표시
- [ ] `ownership-map.json` 변경 시 영향 role과 추가/변경 path pattern을 리뷰어에게 설명
- [ ] placeholder npm script가 실제 구현을 가리지 않는지 확인
- [ ] skip된 harness가 있다면 skip 사유와 실제 검증 전환 예정 PR을 아래에 기재

## 💬 리뷰어에게
<!-- 리뷰어가 집중해서 봐야 할 부분이나 참고사항을 적어주세요 -->

## 👥 Cross-owner 영향 및 리뷰 요청
<!-- 다른 담당자 영역을 수정했다면 영향을 받은 role과 리뷰 요청 사유를 적어주세요. 예: C API가 D 면접 런타임 계약을 함께 수정하여 D 리뷰 요청 -->
- 영향 role:
- 리뷰 요청 대상:
- cross-owner 수정 사유:

## 🧪 Harness 결과
<!-- 단일 role PR 예: powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A -->
<!-- cross-owner PR 예:
powershell -ExecutionPolicy Bypass -File scripts\verify-ownership-auto.ps1
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A -SkipOwnership
자동 CI에서는 impacted role별 `check-local -Role <Role> -SkipOwnership`가 matrix로 실행됩니다.
-->

## ⏭️ 남은 skip 검증
<!-- verify-prisma / verify-docker / verify-ai-golden / smoke-local 등 skip 사유와 전환 계획 -->

# Realtime PNG 립싱크 타이밍 보정 구현 계획

> 기준 설계: `docs/superpowers/specs/2026-07-18-realtime-png-lip-sync-timing-design.md`

**목표:** 실제 면접 Realtime WebRTC 음성에서 PNG viseme timeline이 실제 발화보다 앞서가지 않도록 예상 길이와 RMS 진행 규칙을 보정한다.

**범위:** `LipSyncDriver.ts`와 `LipSyncDriver.spec.ts`만 변경한다. 브라우저 TTS, 한국어 viseme 매핑, PNG/Cubism 에셋은 변경하지 않는다. 사용자 요청에 따라 별도 요청 전에는 커밋하거나 푸시하지 않는다.

## Task 1. Realtime 타이밍 계약 RED 테스트

**파일**
- 수정: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`

1. Realtime duration fallback이 한글 음절당 180ms인지 검증한다.
2. 브라우저 fallback은 기존 한글 음절당 155ms인지 검증한다.
3. timeline 진행 함수가 첫 음성 전 대기, 발화 중 진행, 발음 cue 무음 중 정지, `rest` cue 무음 중 진행, 100ms 상한을 지키는지 검증한다.
4. `npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts`를 실행해 새 계약이 구현되지 않아 실패하는 RED를 확인한다.

## Task 2. Realtime 전용 적응형 시계 구현

**파일**
- 수정: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`

1. 브라우저와 Realtime 예상 음절 길이를 별도 상수로 둔다.
2. 오디오 duration이 없을 때 경로에 맞는 예상 발화 길이를 반환하는 순수 함수를 추가한다.
3. RMS, 현재 cue, 발화 시작 여부에 따라 Realtime elapsed를 계산하는 순수 함수를 추가한다.
4. `useLipSyncDriverState`에서 `audioStream`일 때만 새 예상 길이와 진행 함수를 사용한다.
5. 브라우저 boundary와 `audioSource.currentTime` 분기는 그대로 유지한다.
6. Task 1 테스트를 다시 실행해 GREEN을 확인한다.

## Task 3. 회귀 및 실제 화면 검증

1. `npm.cmd run test:candidate-avatar`
2. `npm.cmd run typecheck`
3. `npm.cmd run build`
4. `git diff --check`
5. `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`
6. 실제 면접 화면에서 Realtime 음성의 문장 초반·중간 무음·문장 후반 입 모양을 확인하고 브라우저 콘솔 오류를 확인한다.
7. 기존 Cubism 기대값이나 사용자 소유 migration 때문에 별도 검증이 실패하면 이번 변경과 분리해 결과에 기록한다.


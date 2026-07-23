# Realtime 정확 발화 가드레일 구현 계획

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Realtime 면접 음성의 스타일과 속도를 세션 설정으로 분리하고, 실제 출력 transcript가 확정 문장에서 벗어나면 중단·복구한다.

**Architecture:** NestJS API가 OpenAI Realtime 세션의 `voice`와 `speed`를 설정한다. Next.js 클라이언트는 내용만 담은 out-of-band `response.create`를 보내고, response metadata와 출력 transcript를 연결해 스트리밍 접두사 및 최종 전체 일치를 검사한다. 불일치 시 WebRTC response를 취소하고 출력 버퍼를 비운 뒤 기존 SpeechSynthesis fallback을 사용한다.

**Tech Stack:** TypeScript, React/Next.js, NestJS, OpenAI Realtime WebRTC events, Jest, tsx/node:assert

---

### Task 1: OpenAI Realtime 세션 음성 설정 분리

**Files:**
- Modify: `backend/api/src/modules/interview/controller/interview.controller.spec.ts`
- Modify: `backend/api/src/modules/interview/service/interview.service.ts`

1. controller spec의 OpenAI 요청 body 타입과 검증에 `audio.output.voice === "marin"`, `audio.output.speed === 0.9`를 먼저 추가한다.
2. 해당 테스트만 실행해 `speed` 누락으로 실패하는지 확인한다.
3. service에 기본 속도 상수를 추가하고 client secret 요청의 `audio.output.speed`에 적용한다.
4. 세션 instructions의 스타일 문구를 제거하고 역할·안전 규칙만 남긴다.
5. 해당 테스트를 다시 실행해 통과를 확인한다.

### Task 2: 정확 문장 전용 response.create와 transcript 가드 단위 기능

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.ts`

1. response 요청이 `input: []`이고 instructions에 실제 문장을 포함하며 `calm`, `natural`, `slower`, `tone`을 포함하지 않는 테스트를 작성한다.
2. transcript parser와 비교기에 다음 실패 테스트를 추가한다.
   - 정확 문장 및 공백·문장부호 차이 허용
   - `좋습니다` 같은 앞말 거부
   - 정확 문장 뒤 추가 발화 거부
   - `response.created`, delta, done metadata 파싱
3. response cancel 및 output buffer clear 이벤트 생성·전송 테스트를 추가한다.
4. 프론트엔드 spec을 실행해 새 API 부재와 기존 prompt 차이로 실패하는지 확인한다.
5. 최소 구현으로 response event, transcript 정규화/비교, 이벤트 parser, cancel/clear event를 추가한다.
6. spec을 다시 실행해 통과를 확인한다.

### Task 3: CandidatePages 런타임 연결

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/CandidatePages.tsx`
- Test: `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`

1. playback별 기대 문장, response별 누적 transcript, 검증/거부 response ID를 ref로 보관한다.
2. 인트로·질문·격려 response 전송 성공 시 기대 문장을 등록한다.
3. `response.created`에서 response ID와 playback metadata를 연결한다.
4. transcript delta/done을 검사하고 불일치 시 response cancel 및 buffer clear를 전송한다.
5. 인트로·질문은 기존 브라우저 TTS로 전환하고 격려는 생략·마이크 복구한다.
6. transcript 최종 검증이 없는 완료 response도 안전하게 fallback 처리한다.
7. 프론트엔드 typecheck와 관련 spec을 실행한다.

### Task 4: 전체 검증과 커밋

**Files:**
- Verify all modified files

1. 백엔드 interview controller spec을 실행한다.
2. 프론트엔드 realtime-webrtc spec과 typecheck를 실행한다.
3. `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`를 실행한다.
4. `git diff --check`, `git status`, 변경 diff를 확인한다.
5. 검증이 모두 통과한 뒤 Conventional Commit 규칙으로 문서와 구현을 커밋한다.

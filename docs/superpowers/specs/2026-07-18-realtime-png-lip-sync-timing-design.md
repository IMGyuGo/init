# Realtime PNG 립싱크 타이밍 보정 설계

## 배경

운영 면접관은 `LocalInterviewerAvatar` 기반 PNG 렌더러와 여섯 입 모양(`rest`, `closed`, `open`, `wide`, `round`, `teeth`)을 사용한다. 브라우저 TTS는 `SpeechSynthesisUtterance`의 boundary 이벤트로 단어 시작을 다시 맞추지만, 실제 면접의 Realtime WebRTC 음성은 문자 boundary나 전체 오디오 길이를 제공하지 않는다.

현재 Realtime 경로는 한글 음절당 155ms로 만든 텍스트 viseme timeline을 첫 유효 RMS 이후 실제 시간과 같은 속도로 진행한다. 음성을 0.9 속도로 낮춘 뒤 이 예상 길이가 실제 발화보다 짧아졌고, 첫 발화가 시작된 뒤 생기는 무음에서도 timeline이 계속 진행한다. 그 결과 입 모양이 음성보다 먼저 넘어가거나 문장 후반에 timeline이 끝나 단순 RMS `open/closed` 반복으로 돌아갈 수 있다.

## 목표

- 실제 면접 Realtime AI 음성에서 viseme timeline이 발화보다 먼저 진행하지 않게 한다.
- 0.9 속도의 한국어 Realtime 음성에 맞게 예상 음절 길이를 소폭 늘린다.
- 무음에서는 최종 입 모양을 `rest`로 유지하면서 다음 발음 cue를 미리 소비하지 않는다.
- 문장부호가 만드는 의도적인 `rest` cue는 무음 중에도 정상적으로 소비한다.
- 기존 한국어 자음·단모음·복합 모음 매핑과 PNG 여섯 형태는 변경하지 않는다.

## 비목표

- 브라우저 TTS 및 boundary 동기화 경로는 변경하지 않는다.
- Realtime transcript delta를 재생 시각으로 간주하지 않는다. 생성 이벤트 시각은 실제 WebRTC 오디오 출력 시각과 일치한다고 보장할 수 없기 때문이다.
- PNG 에셋, Cubism 소스와 에셋, 눈 깜빡임과 고개 움직임은 변경하지 않는다.
- 음소 단위 강제 정렬이나 서버 측 음성 분석은 추가하지 않는다.

## 설계

### 1. Realtime 전용 예상 길이

오디오 duration을 알 수 없는 Realtime `MediaStream`에는 한글 음절당 180ms를 사용한다. 브라우저 TTS와 로컬 미디어 요소의 기존 155ms fallback은 그대로 유지한다.

180ms는 현재 155ms보다 약 16% 길며, 0.9 발화 속도 보정과 짧은 음절 사이 여유를 함께 반영하는 작은 조정이다. 값은 Realtime 분기에서만 선택해 다른 음성 경로의 회귀를 막는다.

### 2. RMS 적응형 timeline 시계

Realtime timeline은 다음 규칙으로 진행한다.

1. RMS가 무음 임계값을 처음 넘기 전에는 0ms에서 대기한다.
2. 발화 RMS가 감지되면 프레임 간 경과 시간만큼 진행한다.
3. 발화가 시작된 뒤 RMS가 무음이고 현재 cue가 발음 형태라면 진행을 멈춘다. 렌더링 결과는 기존 RMS gate에 따라 `rest`가 된다.
4. RMS가 무음이더라도 현재 cue가 문장부호에서 생성된 `rest`라면 실제 시간만큼 진행해 휴지 cue를 소비한다.
5. 한 프레임에서 반영하는 최대 시간은 기존 100ms를 유지해 탭 비활성화나 긴 프레임 이후 timeline이 급격히 건너뛰지 않게 한다.

이 규칙은 자연스러운 무음에서 다음 음절을 미리 소비하는 현상을 줄이면서, 문장부호 휴지에 영구적으로 머무르는 문제를 피한다.

### 3. 기존 출력 우선순위 유지

- RMS는 발화와 무음 판정 gate로 유지한다.
- 소리가 있는 동안에는 텍스트 timeline의 여섯 입 모양을 우선한다.
- 분석기를 사용할 수 없으면 기존처럼 텍스트 timeline fallback을 사용한다.
- 발화 종료, 모션 감소 설정, 무음 RMS에서는 `rest`로 복귀한다.

## 코드 경계

- `LipSyncDriver.ts`
  - Realtime 예상 음절 길이 상수와 경로 선택을 추가한다.
  - Realtime timeline 진행을 계산하는 순수 함수를 추가하거나 기존 함수를 확장한다.
  - `useLipSyncDriverState`의 `audioStream` 분기에서 현재 cue와 RMS를 함께 사용한다.
- `LipSyncDriver.spec.ts`
  - Realtime 예상 길이와 RMS 적응형 진행 규칙을 검증한다.
- `CandidatePages.tsx`, Realtime 세션 생성 코드, 브라우저 TTS 코드는 변경하지 않는다.

## 테스트

테스트를 먼저 추가하고 다음 RED를 확인한다.

- Realtime 예상 길이는 한글 음절당 180ms다.
- 브라우저 fallback 예상 길이는 기존 음절당 155ms다.
- 첫 유효 RMS 전에는 timeline이 진행하지 않는다.
- 유효 RMS 중에는 timeline이 진행한다.
- 발음 cue에서 무음이면 timeline이 진행하지 않는다.
- `rest` cue에서 무음이면 timeline이 진행한다.
- 긴 프레임은 최대 100ms만 반영한다.
- 무음 최종 출력은 항상 `rest`다.
- 기존 자음·모음·복합 모음 timeline 테스트가 그대로 통과한다.

최종 검증은 `npm.cmd run test:candidate-avatar`, `npm.cmd run typecheck`, `npm.cmd run build`, `git diff --check`, Role D Windows 하네스와 실제 면접 화면의 Realtime 음성 확인으로 한다.

## 완료 기준

- Realtime 문장 후반에도 `wide`, `round`, `teeth`가 텍스트 순서에 맞춰 유지된다.
- 자연스러운 발화 중간 무음에서 timeline이 앞서가지 않는다.
- 발화가 재개되면 멈춘 cue 다음부터 이어진다.
- 브라우저 TTS 동작과 기존 PNG 입 모양 매핑에는 코드 차이가 없다.


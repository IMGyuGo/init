# 립싱크 튜닝 패널 설계

## 목표

- `/interviewer-preview`에서 실제 브라우저 한국어 TTS 문장을 재생하며 입 모양을 확인한다.
- 입 모양 시간차, 최소 유지 시간, 무음 여운, 작은 입·큰 입 전환 기준을 즉시 조절한다.
- 조절 중인 값은 미리보기에만 적용하고, `설정 저장`을 눌렀을 때만 실제 모의·채용 면접 아바타에 적용한다.
- 저장하지 않거나 초기화하면 현재 운영 기본값과 같은 동작을 유지한다.

## 비목표

- TTS 제공자, Realtime 세션, API 계약 또는 DB 스키마는 변경하지 않는다.
- 새 입 모양 이미지를 추가하지 않는다.
- 지원자별 또는 서버 계정별 설정 동기화는 이번 범위에 포함하지 않는다.
- 음성 속도와 음색은 실제 면접과 동일한 `ko-KR`, rate `0.9`, pitch `1`을 사용하고 튜닝 항목으로 노출하지 않는다.

## 접근안 비교

### 1. 공용 브라우저 튜닝 프로필 — 채택

순수 설정 모듈이 기본값, 범위 보정, 저장·초기화를 담당한다. 미리보기는 편집 중인 draft를 직접 사용하고, 실제 `InterviewAvatar`는 저장된 설정만 읽는다.

- 장점: API·DB 변경 없이 실제 면접까지 같은 규칙을 적용할 수 있다.
- 장점: 기본값과 초기화가 명확하고 롤백이 쉽다.
- 단점: 설정은 현재 브라우저에만 저장된다.

### 2. 미리보기 전용 조절 후 상수 수동 반영

미리보기에서 값을 찾은 뒤 코드 상수를 직접 수정한다.

- 장점: 구현이 가장 작다.
- 단점: 반복 튜닝마다 다시 빌드해야 하며 실제 면접과 값이 쉽게 어긋난다.

### 3. 서버 저장형 튜닝 프로필

관리 API와 DB에 설정을 저장하고 모든 브라우저에 배포한다.

- 장점: 팀 공용 설정과 중앙 배포가 가능하다.
- 단점: API·DB·권한·운영 UI가 필요해 이번 테스트 단계에는 과하다.

## 설정 모델

`LipSyncTuningSettingsV1`은 다음 값을 가진다.

| 필드 | 기본값 | 입력 범위 | 의미 |
| --- | ---: | ---: | --- |
| `timelineOffsetMs` | `0` | `-200..200`, 10ms 단위 | 양수면 입 모양을 음성 진행보다 앞당기고, 음수면 늦춘다. |
| `minimumShapeHoldMs` | `80` | `60..120`, 10ms 단위 | 서로 다른 입 모양 사이의 최소 유지 시간이다. |
| `silenceHangoverMs` | `60` | `0..150`, 10ms 단위 | 짧은 무음에서 직전 입 모양을 유지하는 시간이다. |
| `fullOpenEnterThreshold` | `0.58` | `0.45..0.75`, 0.01 단위 | 작은 입에서 큰 입으로 전환하는 벌림값이다. |
| `fullOpenExitThreshold` | `0.42` | `0.25..0.60`, 0.01 단위 | 큰 입에서 작은 입으로 복귀하는 벌림값이다. |

- `fullOpenExitThreshold`는 항상 `fullOpenEnterThreshold - 0.05` 이하로 보정해 히스테리시스를 유지한다.
- 숫자가 아니거나 범위를 벗어난 저장값은 필드별 기본값 또는 허용 범위로 보정한다.
- localStorage에는 `{ version: 1, settings: ... }` 형태로 저장한다.
- 저장 키는 리깅 시안 선택 키와 분리한다.

## 컴포넌트와 책임

### `LipSyncTuning.ts`

- 기본 설정과 저장 키를 소유한다.
- 설정 정규화, 동일성 비교, localStorage 읽기·쓰기·초기화를 제공한다.
- `useStoredLipSyncTuningSettings`가 실제 아바타에 저장된 설정을 공급한다.
- 같은 문서에서 저장 직후 반영할 수 있도록 전용 브라우저 이벤트를 발행하고, 다른 탭 변경은 `storage` 이벤트로 반영한다.

### `LipSyncDriver.ts`

- `timelineOffsetMs`를 계산된 재생 위치에 적용하고 타임라인 범위로 제한한다.
- 안정화 함수가 `minimumShapeHoldMs`와 `silenceHangoverMs`를 입력받는다.
- RMS를 얻을 수 없는 브라우저 TTS에서는 현재 cue의 초반·후반을 작은 벌림으로 만드는 결정적 envelope를 사용한다. 이에 따라 기존 9단계 PNG가 브라우저 TTS에서도 작은 입과 큰 입을 모두 사용할 수 있다.
- Realtime 또는 `<audio>` 입력은 기존 RMS 기반 벌림값을 유지한다.

### `LocalInterviewerAvatar.tsx`

- 작은 입·큰 입 히스테리시스의 진입·복귀 기준을 props로 받는다.
- props가 없으면 현재 기본값 `0.58/0.42`를 사용한다.

### `InterviewAvatar.tsx`

- 저장된 튜닝 설정을 읽어 드라이버와 PNG 렌더러에 전달한다.
- 저장된 값이 없거나 손상되면 기본 설정으로 동작한다.

### `InterviewerRiggingPreview.tsx`

- 기본 문장: `안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.`
- 문장 입력, `TTS 재생/정지`, 다섯 개 조절 항목, `설정 저장`, `기본값으로 초기화`를 제공한다.
- 편집 중인 draft는 즉시 미리보기에 반영하지만 실제 면접에는 저장 전까지 영향을 주지 않는다.
- TTS의 `onboundary` 이벤트를 드라이버에 전달한다.
- 현재 음절 위치, 입 모양, 작은/큰 입 variant와 중복을 제거한 최근 전환 기록을 표시한다.
- 기존 합성 WAV RMS QA는 Realtime 계열 검증을 위해 그대로 유지한다.

## 데이터 흐름

```text
문장 입력
  -> SpeechSynthesisUtterance(ko-KR, rate 0.9)
  -> onboundary(characterIndex, elapsedTime)
  -> useLipSyncDriverState(draft 설정)
  -> LocalInterviewerAvatar(draft 진입/복귀 기준)
  -> 현재 음절·shape·variant 기록 표시

설정 저장
  -> 정규화
  -> localStorage V1 저장
  -> 저장 이벤트
  -> 실제 InterviewAvatar가 저장 설정 사용
```

## 오류 처리

- `speechSynthesis` 미지원이면 TTS 버튼을 비활성화하고 안내한다. 합성 WAV QA와 수동 상태 QA는 계속 사용할 수 있다.
- TTS 시작 또는 재생 오류는 상태 영역에 표시하며 아바타는 즉시 대기 입으로 복귀한다.
- 저장 실패 시 draft는 유지하고 실제 면접 적용 실패를 안내한다.
- 손상된 localStorage JSON은 예외를 외부로 전파하지 않고 기본값을 사용한다.
- 컴포넌트 종료 또는 재생 정지 시 해당 utterance를 취소하고 경계 상태를 초기화한다.
- `prefers-reduced-motion`이면 기존 정책대로 입 애니메이션을 정지한다.

## 접근성 및 UI

- 입력과 range control은 모두 명시적 label과 현재 숫자 출력을 가진다.
- 상태 변경은 `aria-live="polite"`로 알린다.
- 버튼과 입력 높이는 최소 44px을 유지하고 760px 이하에서는 한 열로 배치한다.
- 기존 미리보기의 밝은 배경, hairline, 인디고 강조색과 간격 토큰을 재사용한다.
- 타임라인은 색만으로 상태를 구분하지 않고 음절·shape·variant 텍스트를 함께 표시한다.

## 테스트 기준

### 단위 테스트

- 기본값, 범위 보정, 손상된 저장값 fallback, 저장·초기화.
- offset의 양수·음수 적용과 타임라인 범위 제한.
- 사용자 지정 최소 유지 시간과 무음 여운.
- 브라우저 TTS fallback envelope가 cue 초반에는 작은 벌림, 중앙에는 큰 벌림을 만든다.
- 사용자 지정 진입·복귀 기준의 히스테리시스.

### 컴포넌트 테스트

- 실제 TTS 기본 문장과 다섯 조절 항목이 렌더링된다.
- 저장·초기화 버튼, 상태 live region, 전환 기록 영역이 존재한다.
- `InterviewAvatar`가 저장 설정 hook과 드라이버·렌더러 전달 경로를 사용한다.

### 브라우저 QA

- TTS 기본 문장을 재생해 `rest`, 작은 입 variant, 큰 입 variant가 모두 관찰된다.
- 슬라이더 변경이 재생 중 미리보기 동작에 반영된다.
- 저장 후 새로고침해 값이 복원되고, 초기화 후 기본값으로 돌아온다.
- 콘솔 오류가 없다.

### 최종 검증

- `npm run test:candidate-avatar`
- `npm run typecheck`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D`

## 롤백과 소유권

- 새 API, DB migration, 환경변수, 의존성을 추가하지 않는다.
- 기능은 별도 구현 커밋으로 나누어 `git revert`가 가능하게 한다.
- `frontend` 변경은 D 소유 범위다. `docs` 설계 문서는 PM cross-owner review가 필요하다.

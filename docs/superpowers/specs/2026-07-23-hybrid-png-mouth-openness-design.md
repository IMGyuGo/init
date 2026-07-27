# 하이브리드 PNG 입 벌림 단계 설계

## 배경

운영 면접관은 `LocalInterviewerAvatar`와 여섯 PNG 입 모양(`rest`,
`closed`, `open`, `wide`, `round`, `teeth`)을 사용한다. 텍스트 기반
타임라인은 한글 음절을 초성, 중성, 종성 cue로 나누고 Realtime 오디오의
RMS는 발화 여부와 연속적인 `mouthOpen` 값을 계산한다.

현재 PNG 렌더러는 `mouthShape`만 사용하고 계산된 `mouthOpen`을 버린다.
따라서 작은 소리와 큰 소리가 같은 입 모양으로 보이며, 짧은 자음 cue와
순간적인 무음이 그대로 이미지 교체로 이어져 입이 빠르게 튀는 인상을 준다.
GIF 검토에서도 발음 순서는 대체로 맞지만 동일 계열 입 모양의 강도 변화가
없고 `rest`와 발음 모양 사이 전환이 갑작스러운 점이 주된 한계로 확인됐다.

## 목표

- 기존 한글 발음 분류와 Realtime 타임라인을 유지한다.
- 음량에 따라 모음 입 모양을 작은 벌림과 큰 벌림으로 구분한다.
- 너무 짧은 cue와 순간적인 무음으로 발생하는 프레임 단위 떨림을 줄인다.
- 기존 여섯 PNG에 세 장만 추가해 에셋 제작과 QA 범위를 제한한다.
- 오디오 분석이 불가능한 브라우저와 모션 감소 설정의 기존 동작을 보존한다.

## 비목표

- 서버 측 음소 강제 정렬 또는 별도 STT/음성 분석을 추가하지 않는다.
- Realtime WebRTC 이벤트를 실제 오디오 재생 boundary로 간주하지 않는다.
- Cubism 모델, 얼굴 피부, 턱, 눈, 고개 움직임을 변경하지 않는다.
- API, DB, 환경변수 또는 백엔드 계약을 변경하지 않는다.
- PNG 사이에 투명도 크로스페이드를 적용하지 않는다. 서로 다른 입술이
  겹쳐 보이는 이중 윤곽을 피하기 위해 안정화된 시점에 한 장만 표시한다.

## 검토한 대안

### 1. 기존 여섯 장과 시간 규칙만 변경

최소 유지시간과 무음 완충만 추가하는 방식이다. 구현 비용은 가장 낮지만
작은 소리와 큰 소리가 계속 동일한 입 모양으로 보이므로 개선 폭이 제한된다.

### 2. 아홉 장 하이브리드 방식

기존 발음 형태에 모음용 작은 벌림 세 장을 더하고, 텍스트는 형태를, RMS는
벌림 단계를 담당한다. 이미 계산 중인 신호를 활용하므로 구현 범위 대비
시각적 개선이 가장 크다. 이 설계에서 채택한다.

### 3. 12장 이상 viseme와 음소 강제 정렬

자음과 모음을 더 세밀하게 나누고 음성에서 실제 음소 시각을 구한다. 잠재적
정확도는 높지만 서버 처리, 지연, 언어별 모델, 에셋 정합성 관리가 필요해
현재 Realtime 면접 MVP 범위를 넘는다.

## 에셋 계약

기존 230x105 투명 캔버스와 기준점을 유지하면서 다음 세 장을 추가한다.

| 파일 | 용도 | 기준 원본 |
| --- | --- | --- |
| `open-small.png` | `ㅏ/ㅓ` 계열의 작은 벌림 | `open.png` |
| `wide-small.png` | `ㅐ/ㅔ/ㅣ` 계열의 작은 벌림 | `wide.png` |
| `round-small.png` | `ㅗ/ㅜ/ㅡ` 계열의 작은 벌림 | `round.png` |

모든 파일은 `frontend/public/assets/interviewer-avatar/mouth-sprite`에 둔다.
입 중심, 입꼬리의 좌우 위치, 피부 패치의 외곽과 알파 경계는 대응하는 기존
파일과 일치해야 한다. 작은 벌림은 현재 큰 벌림의 45~60% 높이를 목표로
하되 입술 두께와 인물의 정체성은 유지한다.

`rest`, `closed`, `teeth`는 단계화하지 않는다. `rest`와 `closed`는 기본
자세 이미지의 닫힌 입으로 표현하고, 짧은 자음용 `teeth`는 기존 한 장을
유지한다. 이로써 실행 중 선택 가능한 프레임은 총 아홉 개가 된다.

## 런타임 모델

### 발음 형태와 벌림 단계 분리

`MouthShape`는 기존 의미를 유지한다. `LipSyncDriverState`의 `mouthShape`는
텍스트 타임라인이 선택하고 `mouthOpen`은 RMS smoothing이 선택한다.
PNG 렌더러는 두 값을 받아 다음 표시 프레임을 결정한다.

| `mouthShape` | 작은 벌림 | 큰 벌림 |
| --- | --- | --- |
| `open` | `open-small` | `open` |
| `wide` | `wide-small` | `wide` |
| `round` | `round-small` | `round` |
| `teeth` | `teeth` | `teeth` |
| `rest`, `closed` | 기본 자세의 닫힌 입 | 기본 자세의 닫힌 입 |

오디오 분석을 사용할 수 없으면 기존 shape별 기본 벌림값을 사용한다.
`open`, `wide`, `round`의 기존 기본값은 큰 벌림을 선택하게 해 현재 fallback
동작을 보존한다.

### 벌림 단계 히스테리시스

smoothed `mouthOpen`이 0.58 이상이면 큰 벌림으로 진입한다. 큰 벌림 상태는
0.42 이하가 될 때만 작은 벌림으로 내려간다. 상승과 하강 기준을 분리해
경계 근처 음량에서 두 이미지가 반복 교체되는 것을 방지한다.

발화가 시작됐지만 큰 벌림 기준에 도달하지 않은 경우 작은 벌림을 사용한다.
`mouthOpen`은 기존 attack/release smoothing을 그대로 거치므로 별도 CSS
애니메이션이나 이미지 크기 변형은 추가하지 않는다.

### 형태 안정화

화면에 표시된 비무음 형태는 최소 80ms 동안 유지한다. 그 사이 타임라인이
다른 형태를 요청하면 타임라인 시계는 계속 진행하되 화면 교체만 보류한다.
유지시간이 끝났을 때 가장 최신 타임라인 형태로 바꾸므로 1~2프레임짜리
자음 cue는 자연스럽게 생략될 수 있고 전체 발화 시간은 늘어나지 않는다.

타임라인 생성 시에는 문자 경계와 무관하게 인접한 동일 `mouthShape` cue를
합친다. 현재처럼 한 문자 안의 중복만 합치는 방식보다 불필요한 상태 갱신을
줄이면서 source character index의 시작 위치는 첫 cue 기준으로 보존한다.

### 짧은 무음 완충

RMS가 무음 임계값 이하로 내려가도 마지막 유효 발음 이후 60ms 동안은 이전
형태의 작은 벌림을 유지한다. 60ms가 지나면 `rest`로 복귀한다. 명시적인
문장부호 `rest` cue, 발화 종료, 모션 감소 설정은 완충을 건너뛰고 즉시
`rest`가 된다.

이 완충은 Realtime 타임라인 진행 규칙을 바꾸지 않는다. 발음 cue에서 무음인
동안 타임라인이 멈추고 문장부호 `rest` cue는 소비되는 기존 정책을 유지한다.

## 컴포넌트와 데이터 흐름

1. `LipSyncDriver`가 텍스트에서 `mouthShape`를, 오디오에서 smoothed
   `mouthOpen`을 계산한다.
2. 안정화 함수가 직전 표시 형태, 마지막 변경 시각, 마지막 유효 발음 시각을
   이용해 현재 표시 형태와 무음 완충 여부를 결정한다.
3. `InterviewAvatar`는 `useLipSyncDriverState`를 사용해 두 값을 모두
   `LocalInterviewerAvatar`에 전달한다.
4. `LocalInterviewerAvatar`의 순수 선택 함수가 형태, 벌림값, 직전 벌림
   단계를 받아 아홉 프레임 중 하나를 선택한다.
5. 렌더러는 `open`, `wide`, `round`, `teeth`에서 선택된 한 장에만
   `data-active="true"`를 설정한다. `rest`와 `closed`에서는 기존처럼 별도
   입 스프라이트를 활성화하지 않는다.

형태 안정화와 벌림 히스테리시스는 각각 순수 함수로 분리한다. React hook은
시각과 직전 상태를 보관하는 역할만 담당해 타임라인 생성, 안정화 정책,
렌더링 선택을 독립적으로 테스트할 수 있게 한다.

## 오류 및 fallback

- 새 에셋의 누락, 크기 불일치, 알파 채널 손상은 asset audit에서 실패시킨다.
- 오디오 분석기가 없거나 suspended 상태면 기존 shape별 기본 벌림값으로
  프레임을 고른다.
- speech timeline이 끝나거나 존재하지 않으면 기존 RMS `rest/closed/open`
  fallback을 유지하고 `open`은 RMS 벌림 단계에 따라 작은/큰 프레임을 쓴다.
- 발화 상태가 아니거나 모션 감소 설정이면 모든 안정화 상태를 초기화하고
  기본 자세의 `rest`를 표시한다.

## 테스트

### 순수 함수

- 0.58 이상에서 작은 벌림이 큰 벌림으로 전환된다.
- 큰 벌림은 0.42보다 클 때 유지되고 0.42 이하에서만 작아진다.
- `open`, `wide`, `round`가 각각 올바른 small/full 파일로 매핑된다.
- `teeth`, `rest`, `closed`는 벌림값과 무관하게 기존 표현을 유지한다.
- 비무음 형태는 80ms 전에 교체되지 않고 이후 최신 요청 형태로 바뀐다.
- 60ms 이하 무음은 작은 벌림을 유지하고 그 이후에는 `rest`가 된다.
- 문장부호, 발화 종료, 모션 감소는 무음 완충 없이 `rest`가 된다.
- 서로 인접한 동일 형태 cue는 문자 경계를 넘어 하나로 합쳐진다.

### 렌더러와 에셋

- 아홉 PNG가 모두 eager mount된다. 모음과 `teeth`에서는 정확히 한 장만
  활성화되고 `rest`와 `closed`에서는 활성 스프라이트가 없다.
- 새 PNG 세 장은 230x105이며 투명 배경과 기존 기준점을 유지한다.
- CSS에는 입 스프라이트 opacity transition이 추가되지 않는다.
- 기존 six-shape 발음 매핑, Realtime 무음 정지, boundary 정렬 테스트가
  회귀 없이 통과한다.

### 수동 검증

다음 문장을 실제 Realtime 면접 화면에서 재생하고 전후 화면을 녹화한다.

> 안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.

정상 기준은 작은 소리에서 큰 입이 반복되지 않고, 짧은 무음마다 입이
닫히지 않으며, `wide`와 `round` 형태가 유지되면서 벌림 강도만 자연스럽게
바뀌는 것이다. 발화 끝의 짧은 오디오 무음은 최대 60ms 완충되고, 발화
상태가 종료되면 완충 없이 기본 입으로 돌아와야 한다.

## 변경 범위

- `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- `frontend/src/features/candidate-application-interview/InterviewAvatar.tsx`
- `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`
- 관련 candidate avatar 테스트
- `frontend/public/assets/interviewer-avatar/mouth-sprite`의 새 PNG 세 장
- interviewer avatar asset audit와 관련 테스트

담당 영역은 D의 Candidate/Application/Interview 프론트엔드다. API, 공용 DTO,
DB 또는 다른 담당자 소유 영역은 변경하지 않는다.

## 완료 기준

- 운영 PNG 렌더러가 `mouthShape`와 `mouthOpen`을 함께 사용한다.
- 총 아홉 프레임 중 발음 형태와 음량에 맞는 한 프레임이 선택된다.
- 형태 최소 유지시간, 벌림 히스테리시스, 짧은 무음 완충이 자동 테스트로
  고정된다.
- `npm.cmd run test:candidate-avatar`, `npm.cmd run typecheck`,
  `npm.cmd run build`, `git diff --check`, Windows Role D 로컬 하네스가
  통과한다.
- 대표 문장 전후 녹화에서 프레임 단위 입 떨림이 줄고 발화 종료 시 기본
  입으로 정상 복귀한다.

# 립싱크 문장부호 쉼·입술 기준점 고정 설계

## 배경

현재 운영 면접관은 한글 텍스트로 viseme 타임라인을 만들고, Realtime 오디오
RMS로 실제 발화와 무음을 확인한다. 문장부호도 `rest` cue로 변환하지만 모든
문장부호에 같은 가중치를 부여한 뒤 전체 발화 길이에 비례해 시간을 나눈다.
따라서 `안녕하세요.` 뒤의 쉼이 문장마다 달라지고 200ms를 보장하지 못한다.

입 이미지는 230x105 캔버스 아홉 장을 같은 CSS 좌표에 겹쳐 표시한다. 조사
결과 전체 벌림 이미지의 윗입술은 대략 y=29~34에 있지만 `open-small`,
`wide-small`, `round-small`은 y=42~49에 있어 대응 이미지보다 12~16px 아래에
놓인다. CSS 컨테이너가 움직이는 문제가 아니라 이미지 내부 기준점이 서로
다른 것이 입술이 아래로 내려가 보이는 직접 원인이다.

## 결정

사용자가 선택한 권장안에 따라 문장부호를 세 단계의 절대 쉼으로 분류한다.

| 문장부호 | 목표 쉼 | 의도 |
| --- | ---: | --- |
| `.`, `!`, `?` | 200ms | 문장 종료 후 호흡 |
| `,`, `;`, `:` | 110ms | 문장 안의 짧은 끊김 |
| `…` 또는 `...` | 260ms | 의도적인 긴 여운 |

일반 띄어쓰기에는 강제 쉼을 넣지 않는다. `?!`, `!!`, `...`처럼 문장부호가
연속되면 각각 더하지 않고 그 묶음에서 가장 긴 쉼 하나만 사용한다.

입 위치는 이미지 전체 컨테이너를 옮기는 방식 대신 고정된 입 창 안에서
활성 이미지만 등록 보정한다. 기본 `rest` 피부 패치를 고정된 밑바탕으로
사용하고 작은 벌림 이미지의 투명 입술 레이어만 위로 보정한다. 이렇게 하면
피부 패치 외곽이 함께 움직여 생기는 사각형 경계와 얼굴 이음새를 피할 수
있다.

## 검토한 대안

### 1. 모든 문장부호에 동일한 200ms 쉼

규칙은 단순하지만 쉼표가 반복되는 긴 질문에서 말이 끊기고 느려진다. 문장
종료와 문장 내부 호흡의 차이도 표현하지 못해 채택하지 않는다.

### 2. 오디오 무음만 보고 입을 닫기

실제 음성과는 잘 맞지만 브라우저 TTS와 Realtime 음성의 무음 길이가 매번
달라 같은 문장을 재생해도 입 모양 결과가 달라진다. 텍스트에서 이미 알 수
있는 호흡 구조를 버리므로 단독 방식으로 채택하지 않는다.

### 3. 문장부호 목표 쉼 + 오디오 무음 동기화

텍스트에서 목표 쉼을 만들고 오디오 RMS가 실제 발화 재개 시점을 확인한다.
결정적인 호흡 리듬을 유지하면서 실제 음성이 늦게 재개되면 입도 닫힌 채로
기다릴 수 있다. 이 설계에서 채택한다.

입 위치는 PNG 파일을 다시 생성하는 방법도 검토했다. 그러나 생성 결과의
피부색과 외곽 알파가 바뀔 위험이 있고 픽셀 기준점을 자동으로 보장하기
어렵다. 먼저 런타임 등록 보정과 정적 자산 감사를 적용하고, 추후 원본
에셋을 수작업으로 정렬하더라도 같은 감사 계약을 유지한다.

## 쉼 타임라인

### 문장부호 토큰화

`buildKoreanVisemeTimeline`은 문자 하나씩 바로 cue로 만들지 않고 연속
문장부호를 하나의 pause run으로 읽는다. 각 run은 다음 정보를 가진다.

- `sourceCharacterIndex`: run의 첫 문자 인덱스
- `targetDurationMs`: run에 포함된 기호 중 가장 긴 목표 쉼
- `mouthShape: "rest"`, `isPause: true`

예를 들어 `안녕하세요?! 지금부터`의 `?!`는 400ms가 아니라 200ms 한 번,
`잠시... 다시`의 `...`는 마침표 세 번이 아니라 260ms 한 번으로 만든다.

### 절대 쉼 예산 배분

기존 발음 cue의 초성·중성·종성 가중치는 유지한다. 전체 `durationMs`에서
pause cue의 목표 시간을 먼저 예약하고 남은 시간을 비쉼 cue의 가중치에
비례해 나눈다. 그 결과 대표 문장은 다음 구조가 된다.

```text
안녕하세요 [rest 200ms] 지금부터 AI 모의면접을 시작하겠습니다 [rest 200ms]
```

오디오가 비정상적으로 짧아 목표 쉼을 모두 넣을 수 없는 경우, 비쉼 cue마다
최소 40ms의 발음 예산을 먼저 보호한다. 남은 범위에서 모든 pause cue를 같은
비율로 축소한다. 총 길이보다 긴 타임라인이나 음수 길이 cue는 만들지 않는다.

오디오 길이를 알 수 없는 fallback 추정은 기존 한글 음절당 시간을 합산한
뒤 문장부호 목표 쉼의 합을 더한다. 실제 오디오 duration이 있으면 실제 값을
우선하고 위의 예산 배분만 적용한다.

### 오디오 무음과 재개

Realtime 오디오 분석이 가능할 때 다음 규칙을 유지·명시한다.

1. 명시적인 pause cue에 들어가면 즉시 `rest`를 표시한다.
2. pause cue의 목표 시간이 지나도 RMS가 무음이면 다음 발음 cue의 시계를
   멈추고 계속 `rest`로 기다린다.
3. RMS가 발화로 돌아오면 다음 발음 cue의 진행과 입 움직임을 함께 재개한다.
4. TTS가 목표 시간보다 일찍 발화를 재개한 경우에는 목표 pause가 끝날 때까지
   `rest`를 지키되, Realtime 생성 지시에도 동일한 호흡 길이를 요청해 음성과
   입의 충돌 가능성을 낮춘다.

Realtime 정확 문장 지시에는 원문 변경 금지와 함께 문장 종료 약 200ms,
쉼표류 약 110ms, 말줄임표 약 260ms의 호흡을 요청한다. transcript 검증은
기존처럼 문장부호와 공백을 제거한 정확 문장 비교를 사용하므로 이 운율
지시는 발화 내용 계약을 바꾸지 않는다. 브라우저 `speechSynthesis`는 별도
정밀 pause API가 없으므로 문장부호 운율과 boundary/RMS 동기화를 사용한다.

## 입술 기준점 고정

### 고정 입 창과 레이어

기존 입 위치와 크기를 고정된 `.local-interviewer-avatar__mouth-window`가
소유한다. 창의 위치는 현재 값인 top `36.947514%`, left `39.594843%`,
width `21.178637%`, height `7.251381%`를 유지한다.

창 안에는 다음 순서로 이미지를 둔다.

1. `rest.png`: 고정 피부/닫힌 입 밑바탕
2. 현재 활성 발음 이미지: 한 장만 표시되는 입술 레이어

창은 `overflow: hidden`을 사용한다. 활성 레이어의 외곽은 기존 투명 알파를
사용하고 필요한 경우 가장자리만 짧게 feather 처리해 고정 밑바탕과 섞는다.
불투명 피부 사각형 자체를 화면 좌표에서 이동시키지 않는다.

### variant별 등록 보정

등록값은 `MOUTH_SPRITE_REGISTRATION` 상수로 관리하며 렌더링 시 CSS 사용자
속성으로 전달한다. 첫 기준값은 조사된 윗입술 차이를 반영한다.

| variant | x | y | 기준 |
| --- | ---: | ---: | --- |
| `open-small` | 0px | -14px | `open`의 윗입술 |
| `wide-small` | 0px | -13px | `wide`의 윗입술 |
| `round-small` | 0px | -15px | `round`의 윗입술 |
| 나머지 | 0px | 0px | 현재 기준 유지 |

보정은 원본 230x105 좌표계에서 정의하고 화면 확대·축소와 함께 비례하도록
퍼센트 또는 `calc` 가능한 CSS 값으로 변환한다. 모든 상태에서 입 창 자체의
좌표는 변하지 않는다.

### 자산 기준점 감사

기존 asset audit는 크기와 알파 채널만 확인해 이미지 내부의 입 위치 차이를
놓쳤다. 감사에 대응 variant의 윗입술 기준점 차이를 추가한다.

- `open-small` ↔ `open`
- `wide-small` ↔ `wide`
- `round-small` ↔ `round`

등록 보정 후 계산된 윗입술 y 차이는 3px 이하여야 한다. x 중심 차이도 3px
이하로 제한한다. 허용 범위를 벗어나면 감사 테스트가 실패해 새로운 이미지가
같은 문제를 다시 만들지 못하게 한다.

## 컴포넌트와 데이터 흐름

1. `LipSyncDriver`가 텍스트를 발음 cue와 절대 pause cue로 변환한다.
2. 실제/추정 발화 길이에 맞춰 pause 예산을 예약하고 나머지를 발음 cue에
   배분한다.
3. 오디오 기반 진행기는 pause를 소비하고, 실제 무음이 더 길면 다음 발음
   cue를 정지시킨다.
4. `LocalInterviewerAvatar`가 shape와 openness로 variant를 선택한다.
5. 고정 입 창은 `rest` 밑바탕을 유지하고 선택된 variant의 등록 보정만
   적용한다.

변경은 D 소유의 Candidate/Application/Interview 프론트엔드와 관련 정적
자산 감사에 한정한다. API, DB, 공용 DTO, 환경변수는 변경하지 않는다.

## 오류와 fallback

- 빈 텍스트나 0 이하 duration은 기존처럼 빈 타임라인을 반환한다.
- 문장부호만 있는 텍스트는 전체 duration 안에서 pause cue만 만든다.
- 실제 duration이 너무 짧으면 쉼을 비례 축소하고 cue 순서는 유지한다.
- 오디오 분석을 사용할 수 없으면 절대 pause 타임라인과 브라우저 boundary를
  사용한다.
- 등록값이 없거나 유효하지 않으면 `(0, 0)`으로 처리한다.
- 모션 감소 설정, 발화 종료, 비발화 상태에서는 활성 발음 레이어를 숨기고
  고정된 닫힌 입을 표시한다.

## 테스트

### 타임라인 단위 테스트

- `안녕하세요. 지금부터`에서 마침표 pause가 정확히 200ms다.
- 쉼표류는 110ms, 말줄임표는 260ms다.
- `?!`, `!!`, `...`는 하나의 pause cue로 합쳐지고 가장 긴 값만 사용한다.
- 일반 공백에는 pause cue가 생기지 않는다.
- 추정 duration에 음절 시간과 pause 시간이 함께 포함된다.
- 짧은 실제 duration에서는 음수/역전 cue 없이 pause가 비례 축소된다.
- 실제 무음이 200ms보다 길면 다음 발음 cue가 무음 종료까지 진행되지 않는다.

### 렌더러·자산 테스트

- 입 창 좌표는 variant 전환 중 변하지 않는다.
- `rest` 밑바탕과 활성 발음 이미지 한 장만 올바른 z-order로 표시된다.
- 세 small variant에 각각 -14px, -13px, -15px 등록값이 적용된다.
- full variant와 `closed`, `teeth`, `rest`는 0px 기준을 유지한다.
- 자산 감사에서 보정 후 윗입술 y와 x 중심 차이가 각각 3px 이하다.
- 기존 9개 이미지 preload, 히스테리시스, 80ms 형태 안정화, 60ms 무음
  완충 테스트가 회귀 없이 통과한다.

### 수동 검증

다음 문장을 Realtime과 브라우저 fallback에서 각각 재생하고 녹화한다.

> 안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다.

정상 기준은 `안녕하세요.` 뒤에 약 200ms 동안 입이 닫히고, 실제 음성 재개와
동시에 다음 입 모양이 시작되는 것이다. `open-small`, `wide-small`,
`round-small`과 대응 full variant를 반복 전환해도 윗입술의 세로 위치가
눈에 띄게 내려가지 않아야 한다. 피부 패치 사각형 경계나 이중 입술도 없어야
한다.

## 예상 변경 범위

- `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`
- `frontend/src/features/candidate-application-interview/realtime-webrtc.ts`
- `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`
- `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.tsx`
- `frontend/src/features/candidate-application-interview/LocalInterviewerAvatar.spec.tsx`
- `frontend/src/features/candidate-application-interview/CandidatePages.module.css`
- interviewer avatar 자산 감사 스크립트와 테스트

## 완료 기준

- 선택한 세 단계 쉼 규칙이 자동 테스트로 고정된다.
- 대표 문장의 마침표 뒤 `rest`가 200ms이고 실제 무음이 더 길면 닫힌 입을
  유지한다.
- small/full 전환 시 보정 후 입술 기준점 차이가 3px 이하로 검증된다.
- 관련 단위 테스트, `test:candidate-avatar`, typecheck, build,
  `git diff --check`, Windows Role D 로컬 하네스가 통과한다.


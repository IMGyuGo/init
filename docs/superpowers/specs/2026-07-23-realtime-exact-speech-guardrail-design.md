# Realtime 정확 발화 가드레일 설계

## 배경

면접 인트로와 질문은 브라우저가 확정한 문장을 OpenAI Realtime 모델에 `response.create`로 전달한다. 현재 요청은 문장과 별도로 `차분하고 자연스럽게`, `조금 느리게` 같은 발화 지시를 포함한다. Realtime 모델은 생성 모델이므로 이 지시를 `좋습니다. 침착하게 말할게요` 같은 대사로 바꾸거나, 제공 문장 앞뒤에 말을 덧붙일 수 있다. 기존 테스트는 요청 JSON만 확인하고 실제 출력 transcript가 문장과 일치하는지는 검사하지 않는다.

## 목표

- `marin` 음색과 0.9배 발화 속도를 유지한다.
- 모델에게 전달하는 응답별 지시에서 말투·속도 표현을 제거한다.
- 인트로, 본 질문, 꼬리질문, 격려 문구가 제공 문장 이외의 말을 생성하면 빠르게 중단한다.
- 인트로와 질문이 불일치하면 기존 브라우저 TTS로 자동 복구한다.
- 외부 API 응답 계약, DB 모델, 면접 상태 전이는 변경하지 않는다.

## 검토한 접근

### 1. 프롬프트만 강화

`정확히 한 번`, `다른 말 금지`를 더 강하게 반복한다. 변경 폭은 작지만 OpenAI 문서상 instructions 준수는 보장되지 않으므로 실제 출력 가드가 없다.

### 2. 음성 설정과 내용 지시를 분리하고 transcript를 검사 — 선택

음색은 `audio.output.voice=marin`, 속도는 `audio.output.speed=0.9`로 세션에 설정한다. 응답별 instructions에는 정확히 읽을 문장과 추가 발화 금지만 남기고 `input`은 비운다. 생성 중 `response.output_audio_transcript.delta`를 기대 문장의 접두사와 비교하고, 완료 transcript는 전체 문장과 비교한다. 불일치하면 `response.cancel`과 `output_audio_buffer.clear`를 전송한다.

이 방식은 현재 WebRTC 구조를 유지하면서 프롬프트 실패를 실행 중 감지할 수 있다. 인트로·질문은 브라우저 TTS로 복구하고, 답변 도중 격려 문구는 잘못된 음성을 중단한 뒤 생략해 지원자 녹음을 방해하지 않는다.

### 3. 검증 후 재생하는 완전 버퍼링 또는 사전 생성 TTS

오디오 전체를 받은 뒤 transcript를 검증하고 통과한 파일만 재생하면 잘못된 첫 음절도 노출되지 않는다. 대신 현재 WebRTC 자동 재생 구조를 바꾸고 지연·메모리·오디오 수명주기를 새로 관리해야 한다. 이번 결함 수정 범위를 넘어 별도 개선으로 둔다.

## 설계

### 세션 구성

백엔드의 OpenAI Realtime client secret 요청에 `audio.output.speed: 0.9`를 추가한다. `voice`는 기존 `marin`을 유지한다. 세션 instructions에서도 `calm`, `neutral tone` 같은 스타일 지시를 제거하고 역할·안전·자동 응답 금지 규칙만 유지한다.

### 응답 생성

프론트엔드는 `response.create`를 다음 원칙으로 만든다.

- `conversation: none`, `output_modalities: [audio]` 유지
- `input: []`로 설정해 사용자 메시지에 대한 대화형 답변으로 해석될 여지를 줄임
- instructions에 확정 문장을 직접 넣고 `그 문장만 정확히 한 번, 확인/설명/바꿔 말하기/반복 금지`만 명시
- 말투와 속도에 관한 자연어 지시는 포함하지 않음

### 출력 검증

브라우저는 전송한 `playbackId`별 기대 문장을 메모리에 보관한다. `response.created`의 metadata로 `responseId`와 기대 문장을 연결한다. 출력 transcript는 Unicode NFKC 정규화 후 공백·문장부호·기호를 제거해 비교한다. 이 정규화는 발화 내용과 무관한 표기 차이만 허용한다.

- delta: 현재 transcript가 기대 문장의 접두사이면 계속 재생
- delta: 접두사가 아니면 즉시 불일치 처리
- done: 정규화한 전체 문자열이 정확히 같아야 검증 완료
- response 완료 시 검증 완료 기록이 없으면 안전하게 불일치 처리

### 실패 복구

불일치는 response별로 한 번만 처리한다. 클라이언트는 해당 `responseId`를 취소하고 WebRTC 출력 오디오 버퍼를 비운다. 인트로와 질문은 기존 브라우저 SpeechSynthesis를 0.9배 속도로 다시 실행한다. 격려 문구는 Realtime 입력 마이크만 복구하고 해당 격려를 생략한다.

## 한계

WebRTC 원격 트랙은 오디오가 도착하는 즉시 재생된다. transcript delta가 도착하기 전에 재생된 매우 짧은 잘못된 앞부분까지 사전 차단한다고 보장할 수는 없다. 한 음절도 허용할 수 없는 요구가 생기면 접근 3의 검증 후 재생 구조로 전환해야 한다.

## 테스트

- response 요청이 정확 문장을 instructions에 포함하고 스타일 표현 및 user input을 포함하지 않는지 검증
- 공백·문장부호만 다른 transcript는 허용
- `알겠습니다`, `좋습니다` 같은 앞말과 추가 뒷말은 delta/done에서 거부
- `response.created`, transcript delta/done, cancel, buffer clear 이벤트 파싱·생성 검증
- OpenAI 세션 요청의 `voice=marin`, `speed=0.9`, VAD 자동 응답 비활성 검증
- 프론트엔드 관련 테스트, 백엔드 interview controller 테스트, Role D 로컬 하네스 실행

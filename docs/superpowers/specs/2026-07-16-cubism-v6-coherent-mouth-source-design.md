# Cubism V6 일관된 입 원본 설계

## 목표

V5에서 확인된 입 중심 불일치, 사람 입술과 다른 외곽선, 입술과 치아가 떨어져 보이는 문제를 원본 단계에서 해결한다. 기존 V5 파츠를 재배치하지 않고, 기존 면접관 얼굴에 맞는 차분한 대화형 열린 입 한 장을 먼저 만든 뒤 그 동일한 원본에서 상순, 하순, 입안, 윗니, 혀를 분리한다.

V6는 `/interviewer-preview` 전용 QA proof다. 운영 면접 화면의 `InterviewAvatar`와 `LocalInterviewerAvatar`는 계속 PNG 렌더러를 사용한다.

## 현재 문제

- V5 상순과 하순은 기존 얼굴 참조를 기준으로 만들었지만 입안, 치아, 혀는 별도 재구성됐다.
- 서로 다른 원본에서 만들어진 파츠라 입 중심선, 입술 곡선, 치아 곡선, 입꼬리 접점이 하나의 해부 구조를 공유하지 않는다.
- 크기와 위치만 조정하면 전체 크기는 줄일 수 있지만 입술과 치아 사이의 분리, 비대칭 중심, 붙여 넣은 듯한 외곽선은 남는다.
- 부모 Warp의 과도한 세로 변형은 V5에서 해소했지만, 기술적으로 안정된 리깅만으로 원본의 시각 결함을 보정할 수는 없다.

## 선택한 방식

**완성된 열린 입 한 장을 먼저 제작하고, 그 동일한 픽셀 원본에서 모든 입 파츠를 분리한다.**

1. 기존 1024x1536 면접관 master를 편집 대상으로 사용한다.
2. 얼굴, 코, 턱, 피부, 헤어, 의상은 변경하지 않고 입 영역만 차분한 대화형 열린 입으로 편집한다.
3. 완성된 열린 입의 중심과 비율을 승인한 뒤 semantic mask로 상순, 하순, 입안, 윗니, 혀를 분리한다.
4. 각 anatomy layer를 별도로 다시 생성하지 않는다.
5. 피부 underlay는 같은 master의 입 주변 피부로 만들고, 입 anatomy 원본과 분리해 관리한다.
6. 파츠 재합성 결과가 승인된 완성 입과 픽셀 단위로 일치하는지 자동 검사한다.

이 방식은 각 파츠가 동일한 입꼬리, 입술 곡선, 치아 배치와 조명을 공유하므로 V5의 근본 원인을 직접 제거한다.

## 표정 기준

- 표정은 **치아를 조금만 보이는 차분한 대화형**으로 한다.
- 웃는 인상을 강하게 만들지 않는다.
- 윗니는 보이되 입 전체 높이의 20~25%만 차지한다.
- 아랫니는 기본 원본과 `ParamMouthOpenY` proof 범위에서 노출하지 않는다.
- 혀는 입안 하단에만 작게 보이고 치아나 입술보다 시선을 끌지 않는다.
- 입술 채도와 광택은 기존 닫힌 입과 얼굴의 반실사 스타일에 맞춘다.

## 범위

### 포함

- `assets/interviewer-rigging/existing-look-cubism-v6/` 신규 패키지
- 기존 얼굴에 정렬된 완성형 열린 입 원본
- 동일 원본에서 분리한 상순, 하순, 입안, 윗니, 혀
- 피부 underlay, semantic mask, 재합성 QA 이미지
- V6 PSD와 별도 Cubism `.cmo3`
- `ParamMouthOpenY` 0/0.5/1 키폼
- V6 Web R5 QA export
- V6 raster 정합성과 Cubism geometry 자동 감사
- `/interviewer-preview`의 V6 전용 QA 연결
- desktop/mobile, RMS, reduced-motion 브라우저 QA

### 제외

- V5 파일 덮어쓰기 또는 기존 V5 리깅 재사용
- 운영 면접 화면의 Cubism 전환
- 눈, 시선, 고개, 머리카락, 목, 상체 리깅
- `ParamMouthForm`, wide/round/teeth viseme 리깅
- 백엔드 API, 데이터베이스, 배포 계약 변경
- 면접관 얼굴 정체성, 코, 턱, 헤어, 의상 변경

## 패키지 구조

```text
assets/interviewer-rigging/existing-look-cubism-v6/
  manifest.json
  interviewer-mouth-v6.psd
  interviewer-import-v6.cmo3
  sources/
    mouth-open-coherent.png
    mouth-skin-underlay.png
  masks/
    mouth-upper-lip-mask.png
    mouth-lower-lip-mask.png
    mouth-interior-mask.png
    mouth-upper-teeth-mask.png
    mouth-tongue-mask.png
  normalized/
    mouth-skin-underlay.png
    mouth-interior.png
    mouth-upper-teeth.png
    mouth-tongue.png
    mouth-upper-lip.png
    mouth-lower-lip.png
  references/
    mouth-open-0.png
    mouth-open-05.png
    mouth-open-1.png
    mouth-open-recomposed.png

frontend/public/assets/interviewer-cubism/v6-coherent-mouth-proof/
  interviewer-v6-coherent-mouth-proof.model3.json
  interviewer-v6-coherent-mouth-proof.moc3
  interviewer-v6-coherent-mouth-proof.cdi3.json
  interviewer-v6-coherent-mouth-proof-base.png
  interviewer-v6-coherent-mouth-proof.2048/texture_00.png
```

V6 구현 시작 시점의 승인된 V5 source와 runtime export SHA-256을 manifest에 기록하고, V6 작업 동안 해당 파일을 byte-for-byte 보존한다.

## 원본 편집 계약

### 편집 입력

- 편집 대상: 기존 `existing-look` 1024x1536 master
- 정렬 기준: `mouthAnchor = { x: 512, y: 585 }`
- 편집 허용 영역: `x=400..624`, `y=530..674`
- 얼굴 정체성 기준: 코끝, 인중, 턱선, 피부 경계, 눈, 헤어, 의상

### 불변 조건

- 허용 영역 밖 RGBA 픽셀은 master와 완전히 같아야 한다.
- 코와 턱 중심선은 이동하거나 변형하지 않는다.
- 입 중심 X는 `512 ± 2px`다.
- 열린 입 폭은 기존 닫힌 입 폭의 95~105%다.
- 좌우 입꼬리 Y 차이는 3px 이하다.
- 입 외곽에 피부색 직사각형, chroma fringe, 검은 seam을 만들지 않는다.
- 생성 결과가 얼굴 비율이나 인상을 바꾸면 파츠 분리 전에 폐기한다.

## 파츠 분리 계약

완성 입을 승인한 뒤 semantic mask를 만든다. 각 anatomy layer는 `mouth-open-coherent.png`의 픽셀과 해당 mask만 사용한다.

| 레이어 | 분리 규칙 |
| --- | --- |
| `mouth-upper-lip` | 상순 외곽과 안쪽 경계만 포함하고 치아, 입안 픽셀을 포함하지 않는다 |
| `mouth-lower-lip` | 하순 외곽과 안쪽 경계만 포함하고 혀, 입안 픽셀을 포함하지 않는다 |
| `mouth-interior` | 입술 안쪽 전체를 채우는 어두운 구강 영역이며 치아와 혀 뒤의 빈 공간을 포함한다 |
| `mouth-upper-teeth` | 상순 안쪽 곡선에 붙은 윗니만 포함한다 |
| `mouth-tongue` | 입안 하단의 혀만 포함하고 입술과 치아 영역을 침범하지 않는다 |
| `mouth-skin-underlay` | 움직이는 입술 뒤의 피부를 채우며 anatomy 원본에는 포함하지 않는다 |

### 접합 조건

- 상순과 하순 mask는 좌우 입꼬리에서 1px 이내로 접하거나 겹친다.
- 치아 mask와 상순 안쪽 경계 사이의 투명 간격은 중앙 치아 폭 전체에서 1px 이하다.
- 입안 mask는 입술 안쪽 opening의 모든 픽셀을 덮는다.
- 혀 mask는 입안 mask 내부에 완전히 포함된다.
- anatomy mask는 서로 역할이 겹치지 않으며, 합집합은 완성 입의 가시 픽셀을 모두 포함한다.
- 다섯 anatomy layer의 alpha 합성은 `mouth-open-coherent.png`의 입 영역과 채널별 최대 1 이내로 일치한다.

## Raster QA 기준

`scripts/audit-coherent-mouth-source.mjs`를 추가해 다음을 검사한다.

- 1024x1536 RGBA와 anchor 계약
- 허용 입 영역 밖 master 픽셀 불변
- 완성 입 alpha bounds의 중심 X와 폭
- 좌우 입꼬리 접점과 Y 차이
- 상순-치아 최대 투명 간격
- 입안 opening coverage
- 혀의 입안 mask 포함 관계
- mask 역할 중복과 누락
- 분리 레이어 재합성 픽셀 일치
- 피부 underlay feather와 master 피부색 연속성
- 0/0.5/1 QA reference가 입 영역 밖을 변경하지 않는지 여부

시각 QA에서는 얼굴 전체, 4배 확대 입 crop, 검정/흰색 배경 합성을 함께 확인한다.

## Cubism 리깅

```text
mouth-align-root
  mouth-root
    mouth-skin-underlay
    mouth-upper-lip-deform
      mouth-upper-lip
    mouth-lower-lip-deform
      mouth-lower-lip
    mouth-interior-deform
      mouth-interior
      mouth-upper-teeth
      mouth-tongue
```

- `mouth-align-root`와 `mouth-root`는 정렬과 계층 구성에만 사용한다.
- 부모 deformer는 `ParamMouthOpenY`에 연결하지 않는다.
- `ParamMouthOpenY`에는 상순, 하순, 입안 하위 deformer만 연결한다.
- 상순과 하순은 반대 방향으로 짧게 이동하고 곡률을 조절한다.
- 양쪽 입꼬리는 세 키폼에서 고정한다.
- 입안, 치아, 혀는 하나의 내부 deformer에서 같은 좌표계를 사용한다.
- 윗니와 혀는 `mouth-interior` ArtMesh로 clipping한다.
- opacity crossfade와 전체 입 frame 교체를 사용하지 않는다.
- 입 열림을 만들기 위한 전체 세로 확대를 사용하지 않는다.

### 키폼

| 값 | 상순 | 하순 | 입안 그룹 |
| --- | --- | --- | --- |
| `0` | 닫힌 입 기준선으로 내려와 입안을 덮음 | 닫힌 입 기준선으로 올라와 입안을 덮음 | 입술 뒤에 완전히 가려짐 |
| `0.5` | 작은 상향 이동과 완만한 곡률 | 작은 하향 이동과 완만한 곡률 | 치아 일부와 얕은 입안 노출 |
| `1` | 승인된 차분한 열린 입 상순 위치 | 승인된 차분한 열린 입 하순 위치 | 승인된 치아 20~25%와 혀 일부 노출 |

## Cubism Core 감사

기존 `scripts/audit-cubism-mouth-rig.mjs`에 manifest 경로 입력을 추가하되 기본 V5 감사 동작은 보존한다. V6 감사에서는 다음을 추가한다.

- 모든 mouth drawable의 center X가 기준에서 `0.001953` model unit 이내
- 0과 1 사이 drawable width 비율이 `0.95..1.05`
- 0과 1 사이 drawable height 비율이 `0.95..1.08`
- 상순과 하순 opacity가 `[1,1]`
- 윗니와 혀의 clipping mask가 V6 `MouthInterior`
- 부모 `mouth-align-root`와 `mouth-root`가 `ParamMouthOpenY` binding 목록에 없는지 확인
- 상순, 하순, 입안 deformer에 0/0.5/1 키폼이 모두 존재하는지 확인

## Runtime 연결

- V6 model URL은 `/interviewer-preview`에서만 사용한다.
- 기존 `LipSyncDriver`의 `mouthOpen: number`와 reduced-motion 계약을 그대로 사용한다.
- RMS analyser를 추가하지 않는다.
- 모델 로드 실패, WebGL 실패, reduced-motion에서는 기존 bounded PNG fallback 또는 rest 상태를 유지한다.
- production `CandidatePages`, `InterviewAvatar`, `LocalInterviewerAvatar`의 renderer 선택은 변경하지 않는다.

## 검증 절차

1. 완성 입 원본을 얼굴 전체와 확대 crop으로 승인한다.
2. semantic mask와 분리 레이어 재합성을 자동 감사한다.
3. 0/0.5/1 raster reference를 검토한다.
4. PSD를 Cubism Editor에 import하고 독립 ArtMesh를 확인한다.
5. `ParamMouthOpenY`를 scrub해 입꼬리, 중심, 치아 접합, clipping을 확인한다.
6. Web R5로 별도 V6 export한다.
7. Cubism Core 감사로 center X, bounds 비율, opacity, clipping, keyform binding을 확인한다.
8. `/interviewer-preview`에서 0/0.5/1, local RMS 2회, reduced-motion을 확인한다.
9. 1280px desktop과 390px mobile에서 overflow와 얼굴 비율을 확인한다.
10. candidate-avatar tests, typecheck, production build, `git diff --check`, Windows Role D 하네스를 실행한다.

## 실패 처리

- 완성 입이 얼굴 중심이나 정체성을 바꾸면 mask 작업을 시작하지 않고 폐기한다.
- 재합성이 원본과 일치하지 않으면 Cubism import를 진행하지 않는다.
- 치아가 상순에서 떨어지거나 입안 coverage가 비면 semantic mask를 수정한다.
- Cubism에서 입꼬리가 이동하거나 height 비율이 상한을 넘으면 keyform을 다시 만든다.
- V6가 시각 기준을 통과하지 못하면 preview는 V5 또는 PNG fallback으로 유지하고 운영 연결을 진행하지 않는다.

## 완료 기준

- V5 source와 runtime 파일이 변경되지 않는다.
- V6 완성 입은 기존 얼굴의 중심, 폭, 정체성을 유지한다.
- 입술, 치아, 입안, 혀가 하나의 완성 입 원본에서 분리된다.
- 입술과 치아 사이에 눈에 보이는 투명 간격이 없다.
- 상순과 하순이 양쪽 입꼬리에서 끊어지지 않는다.
- 분리 레이어 재합성이 완성 입과 픽셀 기준으로 일치한다.
- 0/0.5/1에서 입 중심과 입꼬리가 고정되고 과도한 세로 확대가 없다.
- RMS 2회 재생 후 입이 0/rest로 돌아간다.
- reduced-motion은 입 열림을 0으로 유지한다.
- 1280px와 390px preview에 overflow가 없다.
- 운영 면접 화면은 기존 PNG renderer를 유지한다.

## 소유권과 리뷰

구현 소유자는 D Candidate/Application/Interview다. `assets`와 시각 품질은 PM 리뷰가 필요하고, `docs/superpowers` 변경은 PM 또는 cross-owner review 대상으로 기록한다.

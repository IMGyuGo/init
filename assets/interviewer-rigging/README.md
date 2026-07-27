# 면접관 리깅 에셋 정책

운영 면접 화면은 `frontend/public/assets/interviewer`의 PNG viseme만 사용한다.
Cubism V3-V6 파일은 후속 리깅을 위한 비런타임 자료이며 프런트엔드 배포 산출물에 포함하지 않는다.

## Git에 보존하는 파일

- Cubism 편집 원본인 `.cmo3`와 `.psd`
- 다시 만들기 어려운 입력 PNG와 manifest
- `cubism-proof-archive/`의 검증용 Web export 및 SDK 자료

## 로컬에서 재생성하는 파일

- V5의 `layers/`, `normalized/`, `references/`
- V6의 `masks/`, `normalized/`, `references/`
- V6의 `sources/mouth-open-coherent-generated.png`

위 경로는 용량이 큰 중간 산출물이므로 Git에서 제외한다. 필요한 경우 저장소 루트에서 다음 명령으로 다시 만든다.

```powershell
python scripts\prepare-layered-mouth-v5-assets.py
python scripts\prepare-coherent-mouth-v6-assets.py
node scripts\build-cubism-v6-export.mjs
```

Cubism proof를 브라우저에서 다시 확인하려면 아카이브를 임시로
`frontend/public/assets/interviewer-cubism/`에 복사해야 한다. 운영 코드에서는 이 경로를 import하거나 요청하지 않는다.

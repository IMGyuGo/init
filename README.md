# init 프로젝트 실행 가이드

이 문서는 처음 프로젝트를 실행하는 사람도 따라 할 수 있도록 로컬 개발 환경 실행 순서를 정리한 문서입니다.

## 1. 필요한 프로그램 설치

먼저 아래 프로그램이 설치되어 있어야 합니다.

- Node.js 20 LTS
- npm 10 이상
- Docker Desktop
- Git
- Windows라면 PowerShell

설치 여부는 터미널에서 확인할 수 있습니다.

```powershell
node -v
npm -v
docker --version
git --version
```

이 프로젝트는 Node.js 20 기준입니다. 루트에 `.nvmrc`, `.node-version` 파일이 있으므로 nvm을 쓴다면 Node 20으로 맞춘 뒤 진행합니다.

## 2. 프로젝트 구조 이해하기

주요 폴더는 다음과 같습니다.

```text
frontend       Next.js 프론트엔드
backend/api    NestJS API 서버와 Prisma
backend/common 공통 DTO, enum, error 패키지
backend/worker AI/비동기 worker
infra/local    로컬 PostgreSQL, Redis, Mailpit, LocalStack Docker 설정
scripts        로컬 검증 스크립트
docs           제품/아키텍처/계약 문서
```

현재 로컬 실행에서 주로 사용하는 것은 `backend/common`, `backend/api`, `backend/worker`, `frontend`, `infra/local`입니다.

## 3. 로컬 인프라 실행하기

API 서버와 worker는 PostgreSQL, Redis, Mailpit, LocalStack(SQS/S3)을 사용합니다. Docker Desktop을 켠 뒤 프로젝트 루트에서 아래 명령을 실행합니다.

```powershell
docker compose -f infra/local/docker-compose.yml up -d
```

정상 실행 여부는 아래 명령으로 확인합니다.

```powershell
docker compose -f infra/local/docker-compose.yml ps
```

로컬 서비스 주소는 다음과 같습니다.

```text
PostgreSQL  localhost:5432
Redis       localhost:6379
Mailpit     http://localhost:8025
LocalStack  http://localhost:14566
SQS Queue   http://localhost:14566/000000000000/init-ai-jobs
```

Mailpit은 개발용 메일함입니다. 회원가입이나 비밀번호 재설정 인증 메일은 실제 메일로 가지 않고 Mailpit 화면에서 확인합니다.

LocalStack은 개발용 AWS 호환 서비스입니다. 컨테이너가 준비되면 `init-ai-jobs` SQS queue와 `init-local-assets` S3 bucket을 자동 생성합니다.

## 4. 환경변수 준비하기

루트의 `.env.example`에는 로컬 개발에 필요한 기본 환경변수가 정리되어 있습니다.

처음 실행할 때는 참고용으로 `.env` 파일을 만들어 둘 수 있습니다.

```powershell
Copy-Item .env.example .env
```

다만 현재 API 서버 코드는 `.env` 파일을 자동으로 읽는 구조가 아니라 `process.env` 값을 직접 사용합니다. 그래서 API 서버를 실행하는 PowerShell 터미널에서는 아래처럼 환경변수를 현재 터미널 세션에 로드한 뒤 실행하면 안전합니다.

```powershell
Get-Content .env.example | ForEach-Object {
  if ($_ -and $_ -notmatch '^\s*#') {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
```

위 명령은 현재 PowerShell 창에만 적용됩니다. 새 터미널을 열면 다시 실행해야 합니다.

## 5. 의존성 설치하기

이 저장소는 루트에서 한 번에 설치하는 방식이 아니라 각 패키지 폴더에서 `npm ci`를 실행합니다.

먼저 공통 패키지를 설치하고 빌드합니다.

```powershell
cd backend/common
npm ci
npm run build
```

다음으로 API 서버 의존성을 설치합니다.

```powershell
cd ../api
npm ci
```

다음으로 worker 의존성을 설치합니다.

```powershell
cd ../worker
npm ci
```

마지막으로 프론트엔드 의존성을 설치합니다.

```powershell
cd ../../frontend
npm ci
```

다시 프로젝트 루트로 돌아오려면 아래 명령을 실행합니다.

```powershell
cd ..
```

## 6. DB 마이그레이션과 시드 실행하기

API 서버 폴더로 이동합니다.

```powershell
cd backend/api
```

이 PowerShell 창에서 환경변수를 로드합니다.

```powershell
Get-Content ../../.env.example | ForEach-Object {
  if ($_ -and $_ -notmatch '^\s*#') {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
```

Prisma Client를 생성합니다.

```powershell
npm run prisma:generate
```

DB 테이블을 생성합니다.

```powershell
npm run db:migrate
```

개발용 기본 데이터를 넣습니다.

```powershell
npm run db:seed
```

## 7. API 서버 실행하기

API 서버는 `backend/api` 폴더에서 실행합니다. 앞 단계에서 사용한 터미널을 그대로 쓰면 환경변수가 이미 로드되어 있습니다.

```powershell
npm run dev
```

정상 실행되면 API 서버는 아래 주소를 사용합니다.

```text
http://localhost:3001
```

헬스 체크 주소는 다음과 같습니다.

```text
http://localhost:3001/api/v1/health
```

브라우저에서 열거나, 다른 PowerShell 창에서 아래 명령으로 확인할 수 있습니다.

```powershell
Invoke-WebRequest http://localhost:3001/api/v1/health
```

### Swagger 문서 확인하기

API 서버가 실행 중이면 브라우저에서 Swagger UI를 확인할 수 있습니다.

```text
http://localhost:3001/api-docs
```

OpenAPI JSON 문서는 아래 주소에서 확인할 수 있습니다.

```text
http://localhost:3001/api-docs-json
```

Swagger에는 현재 구현된 API만 문서화되어 있습니다.

## 8. 프론트엔드 실행하기

새 PowerShell 터미널을 하나 더 열고 프로젝트 루트에서 프론트엔드 폴더로 이동합니다.

```powershell
cd frontend
```

프론트엔드가 API 서버 주소를 알 수 있도록 환경변수를 설정합니다.

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001"
```

개발 서버를 실행합니다.

```powershell
npm run dev
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000/login
```

## 9. AI worker 실행하기

AI 요청이 `PENDING`에서 `COMPLETED` 또는 `FAILED`로 전환되려면 worker가 실행 중이어야 합니다. 새 PowerShell 터미널을 하나 더 열고 프로젝트 루트에서 worker 폴더로 이동합니다.

```powershell
cd backend/worker
```

루트 `.env.example` 기준 환경변수를 로드합니다.

```powershell
Get-Content ../../.env.example | ForEach-Object {
  if ($_ -and $_ -notmatch '^\s*#') {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
```

worker를 Prisma repository mode로 실행합니다.

```powershell
$env:WORKER_REPOSITORY_MODE = "prisma"
npm run start:dev
```

worker는 LocalStack SQS의 `init-ai-jobs` queue에서 message를 가져와 처리하고, 같은 PostgreSQL DB의 `ai_process_logs` 상태를 갱신합니다.

## 10. 한 번에 로컬 실행하기

루트의 `start-local.ps1`을 사용하면 Docker infra, API, frontend, worker를 한 번에 실행할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

필요한 서비스만 실행할 수도 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Only Infra
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Only Api
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Only Frontend
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Only Worker
```

Windows에서는 짧은 실행 래퍼인 `fw.ps1`을 사용할 수 있습니다.

```powershell
.\fw.ps1 up       # 전체 실행
.\fw.ps1 f        # frontend만 실행
.\fw.ps1 a        # API만 실행
.\fw.ps1 w        # worker만 실행
.\fw.ps1 i        # Docker infra만 실행
.\fw.ps1 p        # Prisma generate + migrate + seed
.\fw.ps1 down     # 전체 종료
.\fw.ps1 ui       # 키보드 메뉴 열기
```

macOS/Linux에서는 PowerShell 설치 없이 bash 스크립트를 사용합니다.

```bash
bash start-local.sh
bash start-local.sh Frontend
bash start-local.sh Api
bash start-local.sh Worker
bash stop-local.sh
```

macOS/Linux에서도 짧은 래퍼를 사용할 수 있습니다.

```bash
bash fw.sh up
bash fw.sh f
bash fw.sh down
bash fw.sh ui
```

PowerShell 세션에서 매번 `.\fw.ps1`을 입력하지 않으려면 `server.ps1`을 dot-source 해서 alias를 만들 수 있습니다.

```powershell
. .\server.ps1
fw ui
```

bash 세션에서는 `server` 파일을 source 해서 같은 방식으로 사용할 수 있습니다.

```bash
source server
fw ui
```

## 11. 로그인/회원가입 흐름 확인하기

로컬에서 인증 흐름을 확인할 때는 아래 순서로 보면 됩니다.

1. 브라우저에서 `http://localhost:3000/login` 접속
2. 회원가입 화면으로 이동
3. 지원자 또는 기업 회원가입 선택
4. 이메일 인증 코드 요청
5. Mailpit `http://localhost:8025`에서 인증 코드 확인
6. 인증 코드 입력 후 회원가입 완료
7. 로그인 후 화면 진입 확인

Google OAuth는 지원자 계정 전용 정책입니다. 로컬에서 Google OAuth를 실제로 테스트하려면 `.env.example`의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` 값을 실제 Google OAuth 설정에 맞게 채워야 합니다.

## 12. 로컬 검증 실행하기

작업을 마친 뒤에는 프로젝트 루트에서 로컬 하네스를 실행합니다.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A
```

macOS/Linux:

```bash
bash scripts/check-local.sh -Role A
```

담당 역할에 따라 `-Role A` 부분은 `A`, `B`, `C`, `D`, `E`, `PM` 중 하나로 바꿉니다.

## 13. 자주 겪는 문제

### Docker가 실행되지 않는 경우

Docker Desktop이 켜져 있는지 확인합니다. Docker Desktop을 켠 뒤 다시 실행합니다.

```powershell
docker compose -f infra/local/docker-compose.yml up -d
```

### DATABASE_URL 오류가 나는 경우

API 서버를 실행하는 터미널에서 환경변수가 설정되지 않았을 가능성이 큽니다. `backend/api` 폴더에서 아래 명령을 다시 실행합니다.

```powershell
Get-Content ../../.env.example | ForEach-Object {
  if ($_ -and $_ -notmatch '^\s*#') {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
```

### 인증 메일이 오지 않는 경우

실제 이메일함이 아니라 Mailpit을 확인해야 합니다.

```text
http://localhost:8025
```

Mailpit 컨테이너가 켜져 있는지도 확인합니다.

```powershell
docker compose -f infra/local/docker-compose.yml ps
```

### 프론트엔드에서 API 호출이 실패하는 경우

API 서버가 실행 중인지 먼저 확인합니다.

```text
http://localhost:3001/api/v1/health
```

프론트엔드 터미널에서 API 주소 환경변수도 확인합니다.

```powershell
$env:NEXT_PUBLIC_API_BASE_URL
```

값이 비어 있다면 다시 설정합니다.

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001"
```

## 14. 종료 방법

API 서버와 프론트엔드 서버는 각각 실행 중인 터미널에서 `Ctrl + C`를 누르면 종료됩니다.

Docker로 띄운 PostgreSQL, Redis, Mailpit, LocalStack은 프로젝트 루트에서 아래 명령으로 종료합니다.

```powershell
docker compose -f infra/local/docker-compose.yml down
```

DB 데이터까지 완전히 지우고 처음부터 다시 시작하려면 아래 명령을 사용합니다.

```powershell
docker compose -f infra/local/docker-compose.yml down -v
```

`down -v`는 PostgreSQL과 LocalStack 데이터도 삭제하므로 필요한 데이터가 없을 때만 사용하세요.

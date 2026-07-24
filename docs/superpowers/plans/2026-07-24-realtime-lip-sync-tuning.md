# Realtime Lip Sync Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tuning preview's browser TTS with an authenticated, standalone OpenAI Realtime output-only WebRTC session that reuses one connection and sends one exact-script response per playback click.

**Architecture:** Add a contract-first authenticated preview endpoint backed by a shared OpenAI Realtime credential issuer, then generalize the existing WebRTC helper to support receive-only audio without a microphone. A testable playback controller owns connection reuse and Realtime event lifecycle while the React panel supplies the audio element, lip-sync input, tuning controls, and transition history.

**Tech Stack:** Node.js 20 LTS, npm, NestJS 11, React 19, Next.js 16, TypeScript 5.9, OpenAI Realtime WebRTC, Node assert/tsx frontend tests, Jest backend tests.

## Global Constraints

- Keep `OPENAI_API_KEY` on the NestJS server; return only a short-lived Realtime client secret.
- Require `JwtAuthGuard` for candidates, company users, and admins; anonymous access is forbidden.
- Do not create, read, or mutate interview sessions, questions, answers, reports, or Prisma records for tuning.
- Do not request microphone permission or call `getUserMedia` from the tuning page.
- Reuse `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_API_BASE_URL`, and speech speed `0.9` from actual interviews.
- Preserve current mock, recruiting, and public interview Realtime behavior.
- Update `docs/03_contracts` before introducing the route or response shape.
- Add no dependency and preserve unrelated dirty-worktree changes.
- Run the Windows Role D harness before completion.

---

### Task 1: Freeze the standalone Realtime API contract

**Files:**
- Modify: `docs/03_contracts/api-index.md`
- Modify: `docs/03_contracts/api-spec.md`

**Interfaces:**
- Produces: `POST /api/v1/interviewer-preview/realtime-session`
- Produces request: `{ mode?: "realtime-voice"; transport?: "webrtc" }`
- Produces response data: `RealtimePreviewSessionResult` without interview IDs

- [ ] **Step 1: Add the API index entry**

```markdown
| API-097-RT | 면접관 튜닝 | POST | /interviewer-preview/realtime-session | 로그인 사용자용 독립 OpenAI Realtime 립싱크 튜닝 세션 생성 | 로그인 사용자 | N | 200 OK |
```

- [ ] **Step 2: Add the complete API specification**

```markdown
### API-097-RT POST /interviewer-preview/realtime-session

- 관련 화면: 면접관 립싱크 튜닝 화면 (`/interviewer-preview`)
- 인증: 로그인 사용자 (`ADMIN`, `COMPANY`, `CANDIDATE`)
- Request Body:
  - `mode?: "realtime-voice"`
  - `transport?: "webrtc"`
- Response `data`:
  - `accepted: true`
  - `mode: "realtime-voice"`
  - `provider: "openai"`
  - `model: string`
  - `voice: string`
  - `transport: "webrtc"`
  - `clientSecret: string`
  - `clientSecretType: "ephemeral"`
  - `expiresAt: string`
  - `endpoint: string`
- Business Rules:
  - 면접 ID를 요구하거나 반환하지 않고 면접 테이블을 조회·변경하지 않는다.
  - 서버만 OpenAI API key를 사용하며 브라우저에는 ephemeral secret만 반환한다.
  - `AI_INTERVIEWER_REALTIME_PROVIDER=openai`과 `OPENAI_API_KEY`가 필요하다.
  - safety identifier에는 역할과 `userId`만 사용한다.
- Errors: `COMMON_UNAUTHORIZED`, `COMMON_VALIDATION_FAILED`, `COMMON_CONFLICT`, `COMMON_EXTERNAL_SERVICE_FAILED`
- Related Tables: 없음
```

- [ ] **Step 3: Verify documentation integrity**

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-docs.ps1
```

Expected: `[ok] verify-docs passed`.

- [ ] **Step 4: Commit the contract**

```powershell
git add -- docs/03_contracts/api-index.md docs/03_contracts/api-spec.md
git commit -m "docs(candidate): Realtime 튜닝 세션 계약 추가"
```

---

### Task 2: Extract the shared OpenAI Realtime credential issuer

**Files:**
- Create: `backend/api/src/modules/interview/service/realtime-session-credential.service.ts`
- Create: `backend/api/src/modules/interview/service/realtime-session-credential.service.spec.ts`
- Modify: `backend/api/src/modules/interview/interview.runtime.types.ts`
- Modify: `backend/api/src/modules/interview/service/interview.service.ts`
- Modify: `backend/api/src/modules/interview/controller/interview.controller.spec.ts`
- Modify: `backend/api/src/modules/interview/interview.module.ts`
- Modify: `backend/api/src/modules/interview/interview.module.spec.ts`

**Interfaces:**
- Produces: `RealtimeSessionCredentials`
- Produces: `RealtimeSessionCredentialService.issueOpenAi(input)`
- Consumes: `{ instructions: string; safetyIdentifier: string }`
- Preserves: `RealtimeInterviewSessionResult extends RealtimeSessionCredentials`

- [ ] **Step 1: Write issuer request, success, and failure tests**

Create a Jest spec with a fake fetcher:

```ts
const service = new RealtimeSessionCredentialService(async (input, init) => {
  calls.push({ input: String(input), init });
  return new Response(JSON.stringify({
    value: "ephemeral-test-secret",
    expires_at: 1783300000,
  }), { status: 200 });
});

process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "server-test-key";

const result = await service.issueOpenAi({
  instructions: "Stay silent until response.create.",
  safetyIdentifier: "preview-candidate-7",
});

expect(result.provider).toBe("openai");
expect(result.clientSecret).toBe("ephemeral-test-secret");
expect(calls[0]?.input).toBe("https://api.openai.com/v1/realtime/client_secrets");
expect(calls[0]?.init?.headers).toMatchObject({
  Authorization: "Bearer server-test-key",
  "OpenAI-Safety-Identifier": "preview-candidate-7",
});
expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
  session: {
    type: "realtime",
    model: "gpt-realtime-2",
    instructions: "Stay silent until response.create.",
    audio: { output: { voice: "marin", speed: 0.9 } },
  },
});
```

Add cases for mock provider, missing API key, non-2xx provider response, and a
successful response without a client secret. Restore every environment value
and `globalThis.fetch` in `afterEach`.

- [ ] **Step 2: Run the new spec and verify RED**

Run from `backend/api`:

```powershell
npm.cmd test -- --runInBand src/modules/interview/service/realtime-session-credential.service.spec.ts
```

Expected: FAIL because `RealtimeSessionCredentialService` does not exist.

- [ ] **Step 3: Add the shared credential type**

```ts
export interface RealtimeSessionCredentials {
  accepted: true;
  mode: "realtime-voice";
  provider: RealtimeInterviewProvider;
  model: string;
  voice: string;
  transport: "webrtc";
  clientSecret: string;
  clientSecretType: "ephemeral";
  expiresAt: string;
  endpoint: string;
}

export interface RealtimeInterviewSessionResult extends RealtimeSessionCredentials {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
}

export interface RealtimePreviewSessionResult extends RealtimeSessionCredentials {
  provider: "openai";
}
```

- [ ] **Step 4: Implement the credential issuer**

Create this public boundary:

```ts
export interface IssueOpenAiRealtimeCredentialsInput {
  instructions: string;
  safetyIdentifier: string;
}

export const REALTIME_SESSION_FETCH = Symbol("REALTIME_SESSION_FETCH");

@Injectable()
export class RealtimeSessionCredentialService {
  constructor(
    @Optional()
    @Inject(REALTIME_SESSION_FETCH)
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async issueOpenAi(
    input: IssueOpenAiRealtimeCredentialsInput,
  ): Promise<RealtimeSessionCredentials> {
    if (process.env.AI_INTERVIEWER_REALTIME_PROVIDER !== "openai") {
      throw new CandidateDomainError(
        "COMMON_CONFLICT",
        "OpenAI realtime session provider is not configured.",
        409,
        [{ field: "AI_INTERVIEWER_REALTIME_PROVIDER", reason: "provider must be openai" }],
      );
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CandidateDomainError(
        "COMMON_CONFLICT",
        "OpenAI realtime session provider is not configured.",
        409,
        [{ field: "OPENAI_API_KEY", reason: "OPENAI_API_KEY is required" }],
      );
    }
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
    const voice = process.env.OPENAI_REALTIME_VOICE || "marin";
    const baseUrl = (process.env.OPENAI_REALTIME_API_BASE_URL || "https://api.openai.com")
      .replace(/\/+$/, "");
    const response = await this.fetcher(`${baseUrl}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": input.safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: input.instructions,
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                create_response: false,
                interrupt_response: false,
              },
            },
            output: { voice, speed: 0.9 },
          },
        },
      }),
    });
    const rawBody = await response.text();
    let payload: {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
      error?: { message?: string };
    } = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new CandidateDomainError(
        "COMMON_EXTERNAL_SERVICE_FAILED",
        "OpenAI realtime session creation failed.",
        502,
        [{ field: "openai", reason: payload.error?.message ?? rawBody.slice(0, 200) }],
      );
    }
    const clientSecret = payload.value ?? payload.client_secret?.value;
    if (!clientSecret) {
      throw new CandidateDomainError(
        "COMMON_EXTERNAL_SERVICE_FAILED",
        "OpenAI realtime client secret was not returned.",
        502,
        [{ field: "clientSecret", reason: "missing ephemeral client secret" }],
      );
    }
    const expiresAtSeconds = payload.expires_at ?? payload.client_secret?.expires_at;
    return {
      accepted: true,
      mode: "realtime-voice",
      provider: "openai",
      model,
      voice,
      transport: "webrtc",
      clientSecret,
      clientSecretType: "ephemeral",
      expiresAt: Number.isFinite(expiresAtSeconds)
        ? new Date(expiresAtSeconds! * 1000).toISOString()
        : new Date(Date.now() + 120_000).toISOString(),
      endpoint: `${baseUrl}/v1/realtime/calls`,
    };
  }
}
```

Move the complete bounded parsing and expiry fallback logic from
`InterviewService`; do not leave a second provider parser behind.

- [ ] **Step 5: Refactor actual interviews to call the issuer**

Append this optional constructor dependency so direct test construction stays
compatible:

```ts
@Optional()
@Inject(RealtimeSessionCredentialService)
private readonly realtimeCredentials: RealtimeSessionCredentialService =
  new RealtimeSessionCredentialService(),
```

Replace private OpenAI fetching with:

```ts
const credentials = await this.realtimeCredentials.issueOpenAi({
  instructions: this.buildRealtimeInterviewInstructions(session),
  safetyIdentifier: `candidate-${currentUser.candidateId}`,
});
return {
  ...credentials,
  sessionId: session.sessionId,
  applicationId: session.applicationId,
  interviewType: session.interviewType,
};
```

Keep the mock path unchanged. Register the issuer in `InterviewModule` and
assert its presence in the module spec.

- [ ] **Step 6: Verify GREEN and regressions**

```powershell
npm.cmd test -- --runInBand src/modules/interview/service/realtime-session-credential.service.spec.ts src/modules/interview/controller/interview.controller.spec.ts src/modules/interview/interview.module.spec.ts
```

Working directory: `backend/api`. Expected: all selected suites pass, including
existing disabled-VAD, `marin`, speed `0.9`, and exact-question instructions.

- [ ] **Step 7: Commit the issuer refactor**

```powershell
git add -- backend/api/src/modules/interview/service/realtime-session-credential.service.ts backend/api/src/modules/interview/service/realtime-session-credential.service.spec.ts backend/api/src/modules/interview/interview.runtime.types.ts backend/api/src/modules/interview/service/interview.service.ts backend/api/src/modules/interview/controller/interview.controller.spec.ts backend/api/src/modules/interview/interview.module.ts backend/api/src/modules/interview/interview.module.spec.ts
git commit -m "refactor(candidate): Realtime 자격 증명 발급 분리"
```

---

### Task 3: Add the authenticated preview endpoint and frontend client

**Files:**
- Create: `backend/api/src/modules/interview/controller/interviewer-preview.controller.ts`
- Create: `backend/api/src/modules/interview/controller/interviewer-preview.controller.spec.ts`
- Create: `backend/api/src/modules/interview/service/interviewer-preview-realtime.service.ts`
- Create: `backend/api/src/modules/interview/service/interviewer-preview-realtime.service.spec.ts`
- Create: `backend/api/src/modules/interview/service/realtime-session-request.ts`
- Modify: `backend/api/src/modules/interview/service/interview.service.ts`
- Modify: `backend/api/src/modules/interview/interview.module.ts`
- Modify: `backend/api/src/modules/interview/interview.module.spec.ts`
- Modify: `backend/api/src/swagger/swagger-description-enricher.ts`
- Modify: `frontend/src/features/candidate-application-interview/api.ts`
- Modify: `frontend/src/features/candidate-application-interview/contract.spec.ts`

**Interfaces:**
- Produces: `InterviewerPreviewRealtimeService.createSession(dto, currentUser)`
- Produces: `CandidateApiClient.createInterviewerPreviewRealtimeSession(body)`
- Consumes: `RealtimeSessionCredentialService.issueOpenAi`

- [ ] **Step 1: Write failing controller, service, and frontend client tests**

Controller metadata assertions:

```ts
expect(Reflect.getMetadata(PATH_METADATA, InterviewerPreviewController))
  .toBe("interviewer-preview");
expect(Reflect.getMetadata(PATH_METADATA,
  InterviewerPreviewController.prototype.createRealtimeSession))
  .toBe("realtime-session");
expect(Reflect.getMetadata(METHOD_METADATA,
  InterviewerPreviewController.prototype.createRealtimeSession))
  .toBe(RequestMethod.POST);
expect(Reflect.getMetadata(GUARDS_METADATA, InterviewerPreviewController))
  .toContain(JwtAuthGuard);
```

Service assertions:

```ts
const candidate = await service.createSession({}, {
  userId: 7, userType: "CANDIDATE", candidateId: 11, companyId: null,
});
const company = await service.createSession({}, {
  userId: 8, userType: "COMPANY", candidateId: null, companyId: 12,
});
expect(candidate.data).not.toHaveProperty("sessionId");
expect(candidate.data.provider).toBe("openai");
expect(issueCalls[0]?.safetyIdentifier).toBe("preview-candidate-7");
expect(issueCalls[1]?.safetyIdentifier).toBe("preview-company-8");
expect(issueCalls[0]?.instructions).toMatch(/Stay silent until.*response\.create/i);
```

Frontend request assertions:

```ts
const client = createCandidateApiClient({ baseUrl: "https://api.test", fetcher });
await client.createInterviewerPreviewRealtimeSession({
  mode: "realtime-voice",
  transport: "webrtc",
});
assert.equal(requests[0]?.url,
  "https://api.test/api/v1/interviewer-preview/realtime-session");
assert.equal(requests[0]?.init.method, "POST");
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm.cmd test -- --runInBand src/modules/interview/controller/interviewer-preview.controller.spec.ts src/modules/interview/service/interviewer-preview-realtime.service.spec.ts
```

Working directory: `backend/api`.

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/contract.spec.ts
```

Working directory: `frontend`. Expected: both fail because the new APIs do not
exist.

- [ ] **Step 3: Implement the preview service**

```ts
@Injectable()
export class InterviewerPreviewRealtimeService {
  constructor(
    @Inject(RealtimeSessionCredentialService)
    private readonly credentials: RealtimeSessionCredentialService,
  ) {}

  async createSession(dto: CreateRealtimeInterviewSessionDto, user: CurrentUser) {
    assertRealtimeSessionRequest(dto);
    const data = await this.credentials.issueOpenAi({
      instructions: [
        "You provide exact-script Korean speech for authenticated lip-sync tuning.",
        "Stay silent until the browser sends response.create.",
        "Speak only the exact marked script once and say nothing else.",
      ].join(" "),
      safetyIdentifier: `preview-${user.userType.toLowerCase()}-${user.userId}`,
    });
    return {
      data,
      meta: { traceId: crypto.randomUUID(), timestamp: new Date().toISOString() },
    };
  }
}
```

Create and reuse this pure validator in both preview and actual interview
services:

```ts
export function assertRealtimeSessionRequest(
  dto: CreateRealtimeInterviewSessionDto | null | undefined,
): void {
  if (dto?.mode !== undefined && dto.mode !== "realtime-voice") {
    throw new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Realtime session mode is invalid.",
      400,
      [{ field: "mode", reason: "mode must be realtime-voice" }],
    );
  }
  if (dto?.transport !== undefined && dto.transport !== "webrtc") {
    throw new CandidateDomainError(
      "COMMON_VALIDATION_FAILED",
      "Realtime session transport is invalid.",
      400,
      [{ field: "transport", reason: "transport must be webrtc" }],
    );
  }
}
```

- [ ] **Step 4: Implement the guarded controller and module registration**

```ts
@Controller("interviewer-preview")
@UseGuards(JwtAuthGuard)
export class InterviewerPreviewController {
  constructor(
    @Inject(InterviewerPreviewRealtimeService)
    private readonly service: InterviewerPreviewRealtimeService,
  ) {}

  @Post("realtime-session")
  createRealtimeSession(
    @Req() request: Request & { currentUser: CurrentUser },
    @Body() dto: CreateRealtimeInterviewSessionDto,
  ) {
    return this.handle(() => this.service.createSession(dto, request.currentUser));
  }

  private async handle<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof CandidateDomainError) {
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          error.statusCode,
        );
      }
      throw error;
    }
  }
}
```

Register controller/service in `InterviewModule` and add the Swagger summary.

- [ ] **Step 5: Implement the frontend shared types and client method**

```ts
export interface RealtimeSessionCredentials {
  accepted: true;
  mode: "realtime-voice";
  provider: "mock" | "openai";
  model: string;
  voice: string;
  transport: "webrtc";
  clientSecret: string;
  clientSecretType: "ephemeral";
  expiresAt: string;
  endpoint: string;
}

export interface RealtimeInterviewSessionResponse extends RealtimeSessionCredentials {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
}

export type RealtimePreviewSessionResponse = RealtimeSessionCredentials & {
  provider: "openai";
};
```

Add `/api/v1/interviewer-preview/realtime-session` and the authenticated POST
method to `CandidateApiClient` and its implementation.

- [ ] **Step 6: Verify GREEN**

Re-run both Step 2 commands. Expected: all selected tests pass.

- [ ] **Step 7: Commit the endpoint and client**

```powershell
git add -- backend/api/src/modules/interview/controller/interviewer-preview.controller.ts backend/api/src/modules/interview/controller/interviewer-preview.controller.spec.ts backend/api/src/modules/interview/service/interviewer-preview-realtime.service.ts backend/api/src/modules/interview/service/interviewer-preview-realtime.service.spec.ts backend/api/src/modules/interview/service/realtime-session-request.ts backend/api/src/modules/interview/service/interview.service.ts backend/api/src/modules/interview/interview.module.ts backend/api/src/modules/interview/interview.module.spec.ts backend/api/src/swagger/swagger-description-enricher.ts frontend/src/features/candidate-application-interview/api.ts frontend/src/features/candidate-application-interview/contract.spec.ts
git commit -m "feat(candidate): Realtime 튜닝 세션 API 추가"
```

---

### Task 4: Support microphone-free output-only WebRTC

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.ts`
- Modify: `frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/contract.spec.ts`

**Interfaces:**
- Consumes: `RealtimeSessionCredentials`
- Produces: optional `localStream` output-only mode
- Produces: `RealtimeSpeechPurpose` including `lip_sync_tuning`

- [ ] **Step 1: Write failing output-only and tuning-event tests**

Extend the fake peer connection:

```ts
readonly transceivers: Array<{ kind: string; init?: RTCRtpTransceiverInit }> = [];
addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
  this.transceivers.push({ kind, init });
  return {} as RTCRtpTransceiver;
}
```

Test the output-only call:

```ts
const connection = await createRealtimeInterviewWebRtcConnection({
  session: openAiPreviewSession,
  peerConnectionFactory: () => peer,
  fetcher: successfulSdpFetcher,
});
assert.deepEqual(peer.transceivers, [
  { kind: "audio", init: { direction: "recvonly" } },
]);
assert.equal(peer.addedTracks.length, 0);
assert.deepEqual(connection.localAudioTracks, []);
```

Create an event with purpose `lip_sync_tuning` and assert its metadata,
`conversation: "none"`, `output_modalities: ["audio"]`, and exact-script
instructions.

- [ ] **Step 2: Run the WebRTC spec and verify RED**

Run from `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/realtime-webrtc.spec.ts
```

Expected: FAIL because `localStream` is required and tuning purpose is invalid.

- [ ] **Step 3: Generalize the connection input and peer interface**

```ts
export interface CreateRealtimeInterviewWebRtcConnectionInput {
  session: RealtimeSessionCredentials;
  localStream?: MediaStream | null;
  fetcher?: typeof fetch;
  peerConnectionFactory?: () => RealtimePeerConnectionLike;
  remoteAudioElement?: HTMLAudioElement | null;
  onRemoteStream?: (stream: MediaStream) => void;
  onEvent?: (event: unknown) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  onConnectionFailure?: (error: Error) => void;
  readyTimeoutMs?: number;
}

export interface RealtimePeerConnectionLike {
  connectionState: RTCPeerConnectionState;
  onconnectionstatechange: RTCPeerConnection["onconnectionstatechange"];
  ontrack: ((event: RTCTrackEvent) => unknown) | null;
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender;
  addTransceiver(trackOrKind: string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver;
  createDataChannel(label: string): RealtimeDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
}
```

- [ ] **Step 4: Implement the receive-only branch**

```ts
const sourceAudioTracks = localStream
  ? localStream.getAudioTracks().filter((track) => track.readyState === "live")
  : [];

if (localStream && sourceAudioTracks.length === 0) {
  throw new Error("Realtime WebRTC connection requires a live microphone track.");
}

if (localStream) {
  realtimeAudioTracks.forEach((track) => {
    peerConnection.addTrack(track, realtimeAudioStream);
  });
} else {
  peerConnection.addTransceiver("audio", { direction: "recvonly" });
}
```

Keep current microphone cloning and gating when a stream exists. Keep SDP,
remote audio, readiness timeout, data-channel forwarding, and cleanup shared.
Extend `RealtimeInterviewSpeechPurpose` and its parser with
`"lip_sync_tuning"`.

- [ ] **Step 5: Verify GREEN and actual-interview regressions**

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/realtime-webrtc.spec.ts
npx.cmd --no-install tsx src/features/candidate-application-interview/contract.spec.ts
```

Expected: both pass, including existing microphone clone/enable tests.

- [ ] **Step 6: Commit output-only WebRTC**

```powershell
git add -- frontend/src/features/candidate-application-interview/realtime-webrtc.ts frontend/src/features/candidate-application-interview/realtime-webrtc.spec.ts frontend/src/features/candidate-application-interview/contract.spec.ts
git commit -m "feat(candidate): Realtime 출력 전용 WebRTC 지원"
```

---

### Task 5: Expose the active timeline character for Realtime history

**Files:**
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.ts`
- Modify: `frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts`

**Interfaces:**
- Produces: `LipSyncDriverState.sourceCharacterIndex?: number`
- Produces: `getTimelineSourceCharacterIndex(timeline, elapsedMs)`

- [ ] **Step 1: Write failing character-index tests**

```ts
const indexedTimeline = buildKoreanVisemeTimeline("안녕하세요", 900);
assert.equal(getTimelineSourceCharacterIndex(indexedTimeline, 0), 0);
assert.ok((getTimelineSourceCharacterIndex(indexedTimeline, 700) ?? 0) > 0);
assert.equal(getTimelineSourceCharacterIndex(indexedTimeline, 900), undefined);
```

- [ ] **Step 2: Run the driver spec and verify RED**

Run from `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/LipSyncDriver.spec.ts
```

Expected: FAIL because the helper is not exported.

- [ ] **Step 3: Implement the helper and state field**

```ts
export function getTimelineSourceCharacterIndex(
  timeline: VisemeCue[],
  elapsedMs: number,
): number | undefined {
  return timeline.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs)
    ?.sourceCharacterIndex;
}

export interface LipSyncDriverState {
  mouthShape: MouthShape;
  mouthOpen: number;
  sourceCharacterIndex?: number;
}
```

Return `currentTimelineCue?.sourceCharacterIndex` from
`useLipSyncDriverState`; keep mouth shape, pause, RMS, and reduced-motion logic
unchanged.

- [ ] **Step 4: Verify GREEN**

Re-run Step 2. Expected: PASS.

- [ ] **Step 5: Commit timeline character output**

```powershell
git add -- frontend/src/features/candidate-application-interview/LipSyncDriver.ts frontend/src/features/candidate-application-interview/LipSyncDriver.spec.ts
git commit -m "feat(candidate): 립싱크 현재 문자 위치 노출"
```

---

### Task 6: Replace browser TTS with a reusable Realtime tuning controller

**Files:**
- Create: `frontend/src/features/candidate-application-interview/RealtimeLipSyncTuningController.ts`
- Create: `frontend/src/features/candidate-application-interview/RealtimeLipSyncTuningController.spec.ts`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx`
- Modify: `frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `RealtimeLipSyncTuningController.play(text)`, `.stop()`, `.dispose()`
- Emits: `RealtimeLipSyncTuningSnapshot`
- Consumes: preview API, output-only WebRTC, exact-script event helpers

- [ ] **Step 1: Write controller connection-reuse and lifecycle tests**

Use fake API and WebRTC dependencies:

```ts
const controller = new RealtimeLipSyncTuningController({
  createSession: async () => {
    sessionRequests += 1;
    return previewSession;
  },
  connect: async (input) => {
    connectInputs.push(input);
    return fakeConnection;
  },
  remoteAudioElement: fakeAudioElement,
  onSnapshot: (snapshot) => snapshots.push(snapshot),
});

await controller.play("안녕하세요.");
controller.handleEvent(responseCreated("response-1", "1"));
controller.handleEvent(audioStopped("response-1"));
await controller.play("지금부터 시작합니다.");

assert.equal(sessionRequests, 1);
assert.equal(connectInputs.length, 1);
assert.equal(sentEvents.filter((event) => event.type === "response.create").length, 2);
assert.equal(connectInputs[0]?.localStream, undefined);
```

Add separate cases for empty text, stop/cancel/clear, failed connection,
credential expiry before a later playback, failed provider response,
`output_audio_buffer.stopped`, completed transcript mismatch, and disposal
cleanup.

- [ ] **Step 2: Register the spec and verify RED**

Add the spec after `realtime-webrtc.spec.ts` in `test:candidate-avatar`, then
run from `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/RealtimeLipSyncTuningController.spec.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the pure controller**

```ts
export type RealtimeLipSyncTuningStatus =
  | "idle"
  | "connecting"
  | "playing"
  | "error";

export interface RealtimeLipSyncTuningSnapshot {
  status: RealtimeLipSyncTuningStatus;
  message: string;
  remoteStream: MediaStream | null;
  playbackId: number;
  activeResponseId?: string;
}

export interface RealtimeLipSyncTuningDependencies {
  createSession(): Promise<RealtimePreviewSessionResponse>;
  connect: typeof createRealtimeInterviewWebRtcConnection;
  remoteAudioElement: HTMLAudioElement;
  onSnapshot(snapshot: RealtimeLipSyncTuningSnapshot): void;
  now?: () => number;
}
```

`play(text)` trims input, closes expired/broken connections, requests one
session when needed, creates one output-only connection, and sends:

```ts
createRealtimeInterviewSpeechResponseEvent({
  purpose: "lip_sync_tuning",
  text: trimmedText,
  playbackId: ++this.playbackId,
});
```

Treat credentials as expired when
`Date.parse(session.expiresAt) <= (now?.() ?? Date.now()) + 5_000`. The React
adapter unwraps `createInterviewerPreviewRealtimeSession(...).data` so the
controller remains independent of the common API envelope.

`handleEvent` stores the response ID from `response.created`, treats a
non-completed `response.done` as error, and returns idle only when
`getRealtimeAudioCompletedResponseId(event)` matches the active response.
For `response.output_audio_transcript.done`, call
`getRealtimeSpeechTranscriptMatch({ expectedText: this.activeText, transcript,
completed: true })`; a `mismatch` stops the test with the exact-script error
instead of reporting successful playback.
`stop` cancels/clears the active response while keeping a healthy connection;
`dispose` closes it and detaches the audio element.

- [ ] **Step 4: Verify controller GREEN**

Re-run Step 2. Expected: all controller cases pass.

- [ ] **Step 5: Write panel RED assertions**

Add before implementation:

```ts
assert.match(markup, /OpenAI Realtime 립싱크 튜닝/);
assert.match(markup, />Realtime 음성 테스트 시작</);
assert.match(tuningPanelSource, /createInterviewerPreviewRealtimeSession/);
assert.match(tuningPanelSource, /audioSource:\s*remoteAudioElement/);
assert.match(tuningPanelSource, /audioStream:\s*remoteStream/);
assert.doesNotMatch(tuningPanelSource, /speechSynthesis|SpeechSynthesisUtterance/);
```

Run:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
```

Expected: FAIL because the panel still uses browser TTS.

- [ ] **Step 6: Integrate the controller into the panel**

Replace utterance/boundary refs with:

```tsx
const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
const controllerRef = useRef<RealtimeLipSyncTuningController | null>(null);
const [remoteAudioElement, setRemoteAudioElement] = useState<HTMLAudioElement | null>(null);
const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
const [playbackState, setPlaybackState] = useState<RealtimeLipSyncTuningStatus>("idle");
const setRemoteAudioNode = useCallback((element: HTMLAudioElement | null) => {
  remoteAudioRef.current = element;
  setRemoteAudioElement(element);
}, []);
```

Render one hidden audio element:

```tsx
<audio
  aria-label="OpenAI Realtime 튜닝 음성"
  autoPlay
  hidden
  ref={setRemoteAudioNode}
/>
```

Create the controller lazily using `createCandidateApiClient`; update React
state from `onSnapshot`; dispose on unmount. Feed remote audio to lip sync:

```ts
const lipSyncState = useLipSyncDriverState({
  presentationState: playing ? "speaking" : "idle",
  audioSource: remoteAudioElement,
  audioStream: remoteStream,
  speechText,
  reducedMotion,
  tuning: draft,
});
currentCharacterIndexRef.current = lipSyncState.sourceCharacterIndex ?? 0;
```

Disable the button while connecting, start in idle/error, and call `stop()`
while playing. Remove browser TTS only from this panel; keep actual interview
fallback TTS intact.

- [ ] **Step 7: Verify panel GREEN and avatar suite**

Run from `frontend`:

```powershell
npx.cmd --no-install tsx src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx
npm.cmd run test:candidate-avatar
```

Expected: both pass, including controller, avatar, pause, registration, and
WebRTC tests.

- [ ] **Step 8: Commit the UI migration**

```powershell
git add -- frontend/src/features/candidate-application-interview/RealtimeLipSyncTuningController.ts frontend/src/features/candidate-application-interview/RealtimeLipSyncTuningController.spec.ts frontend/src/features/candidate-application-interview/InterviewerLipSyncTuningPanel.tsx frontend/src/features/candidate-application-interview/InterviewerRiggingPreview.spec.tsx frontend/package.json
git commit -m "feat(candidate): 튜닝 음성을 OpenAI Realtime로 전환"
```

---

### Task 7: Verify the integrated production path

**Files:**
- Verify only; restore generated `frontend/next-env.d.ts` with `apply_patch` if Next.js rewrites it

**Interfaces:**
- Confirms every acceptance criterion in `docs/superpowers/specs/2026-07-24-realtime-lip-sync-tuning-design.md`

- [ ] **Step 1: Run focused backend tests**

```powershell
npm.cmd test -- --runInBand src/modules/interview/service/realtime-session-credential.service.spec.ts src/modules/interview/service/interviewer-preview-realtime.service.spec.ts src/modules/interview/controller/interviewer-preview.controller.spec.ts src/modules/interview/controller/interview.controller.spec.ts src/modules/interview/interview.module.spec.ts
```

Working directory: `backend/api`. Expected: zero failed suites and tests.

- [ ] **Step 2: Run focused frontend tests**

```powershell
npm.cmd run test:candidate-avatar
npx.cmd --no-install tsx src/features/candidate-application-interview/contract.spec.ts
```

Working directory: `frontend`. Expected: both commands exit 0.

- [ ] **Step 3: Run type checks and builds**

Run in `backend/api`, then repeat in `frontend`:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected: all four commands exit 0.

- [ ] **Step 4: Run the required Role D harness**

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role D
```

Working directory: repository root. Expected: `[ok] local harness passed`.

- [ ] **Step 5: Perform browser verification**

1. Sign in and open `/interviewer-preview`.
2. Confirm no microphone permission prompt appears.
3. Start once and confirm one credential request plus one WebRTC call.
4. After `output_audio_buffer.stopped`, start again and confirm no second
   credential request but one new `response.create` data-channel event.
5. Stop during playback and confirm the avatar rests and the connection replays.
6. Confirm the Korean sentence drives mouth shapes and character history.
7. Sign out and confirm the credential endpoint returns 401.

- [ ] **Step 6: Inspect the final diff**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned files plus pre-existing mouth
asset/registration work are present.

- [ ] **Step 7: Route any verification failure back to its owning task**

Do not patch behavior in the verification task. Reopen Task 2 for issuer or
existing-interview failures, Task 3 for contract/auth failures, Task 4 for
transport failures, Task 5 for timeline failures, or Task 6 for controller/UI
failures; repeat that task's RED-GREEN cycle and stage only its listed files.

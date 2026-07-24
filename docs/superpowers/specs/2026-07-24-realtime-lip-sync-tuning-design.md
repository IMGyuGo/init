# Realtime Lip Sync Tuning Design

## Objective

Replace the browser `speechSynthesis` playback used by
`/interviewer-preview` with a standalone OpenAI Realtime WebRTC session. The
tuning page must work without an interview session ID or interview database
record, remain available in production to authenticated users, and feed the
received OpenAI audio into the same lip-sync analyser used by real interviews.

## Current State

- The tuning panel creates a `SpeechSynthesisUtterance` and uses browser speech
  boundary events to advance the Korean viseme timeline.
- Real mock and recruiting interviews already request a short-lived OpenAI
  Realtime client secret from the NestJS API, establish a browser WebRTC
  connection, send an exact-script `response.create` event, and analyse the
  remote audio element and stream.
- Existing Realtime session endpoints require an owned interview session in
  `IN_PROGRESS`, so they cannot serve the standalone tuning route.
- The current WebRTC helper requires a live microphone track even though the
  tuning page only needs model audio output.

## Chosen Approach

Add an authenticated, interview-independent Realtime credential endpoint and
extend the existing WebRTC layer with an output-only connection mode.

The page creates one connection lazily on the first playback request and keeps
it for the page lifetime. Every press of the playback button sends a new
exact-script `response.create` event over that connection. The page never sends
microphone audio and never asks for microphone permission.

This approach is preferred over creating synthetic interview rows because it
does not pollute interview data or require session state transitions. It is
preferred over a Next.js-only OpenAI route because the OpenAI API key, model,
voice, endpoint, safety identifier, and error translation remain owned by the
backend.

## Scope

### Included

- Add a production-available endpoint for authenticated users to request a
  tuning-only OpenAI Realtime client secret.
- Reuse the configured OpenAI Realtime model, voice, API base URL, and speech
  speed used by actual interviews.
- Add output-only WebRTC support without a local microphone stream.
- Replace all browser TTS lifecycle code in the tuning panel.
- Send one exact-script `response.create` event per playback button press.
- Reuse the connection until unmount, expiration, or transport failure.
- Drive lip shape and mouth openness from the received Realtime audio.
- Keep the recent character, mouth-shape, and mouth-variant transition history.
- Cancel the active response and clear queued output audio when the user stops
  playback.
- Add contract, backend, WebRTC, component, and regression tests.

### Excluded

- Creating or updating `interview_sessions`, interview questions, answers, or
  reports.
- Sending microphone audio from the tuning page.
- Letting users change the OpenAI model or voice from the browser.
- Persisting tuning test sentences or Realtime transcripts on the server.
- Replacing the actual interview Realtime flow.
- Adding a public or anonymous Realtime credential endpoint.

## API Contract

Add the following authenticated endpoint to the API contract before
implementation:

```text
POST /api/v1/interviewer-preview/realtime-session
```

Authentication is required, but both authenticated candidate and company
users may use the endpoint. The endpoint does not accept or infer an interview
session ID.

Request:

```json
{
  "mode": "realtime-voice",
  "transport": "webrtc"
}
```

Response:

```json
{
  "data": {
    "accepted": true,
    "mode": "realtime-voice",
    "provider": "openai",
    "model": "configured OpenAI Realtime model",
    "voice": "configured OpenAI Realtime voice",
    "transport": "webrtc",
    "clientSecret": "short-lived ephemeral credential",
    "clientSecretType": "ephemeral",
    "expiresAt": "ISO-8601 timestamp",
    "endpoint": "configured /v1/realtime/calls URL"
  },
  "meta": {
    "traceId": "request trace ID",
    "timestamp": "ISO-8601 timestamp"
  }
}
```

The tuning response intentionally omits `sessionId`, `applicationId`, and
`interviewType`. The frontend should depend on a shared Realtime credential
shape rather than pretending that the tuning session is an interview session.

Invalid mode or transport returns the existing common validation error.
Missing OpenAI configuration returns the existing conflict error. Provider
failure or a malformed client-secret response returns the existing external
service failure error. Anonymous callers receive the standard authentication
failure response.

## Backend Architecture

Extract the OpenAI client-secret request from the interview-session-specific
service into a focused Realtime credential issuer. It accepts:

- session instructions;
- a stable, privacy-preserving safety identifier derived from the authenticated
  user ID and role;
- the configured model, voice, speed, API base URL, and API key.

It returns only the shared ephemeral credential fields. Existing mock and
recruiting interview session creation calls this issuer and then adds interview
metadata to its current response. The new preview endpoint calls the same
issuer with tuning-specific instructions and returns no interview metadata.

The tuning session instructions require the model to remain silent until the
client sends `response.create`, speak only the exact marked script once, and
avoid acknowledgements, additions, omissions, paraphrases, or repetition. The
per-playback event retains the existing punctuation pause instructions.

The endpoint always requests OpenAI Realtime when the configured provider is
`openai`. If the deployment is configured for the mock provider, it returns a
configuration conflict instead of returning unusable mock WebRTC credentials.
No Prisma query or database write is performed.

## Frontend Architecture

### Shared Credential Type

Define a shared WebRTC credential interface containing provider, model, voice,
transport, client secret, expiry, and calls endpoint. The current interview
session response extends this interface with interview metadata. The new
preview response uses the shared interface directly.

### Output-Only WebRTC

Generalize the existing connection helper so `localStream` is optional:

- With a live local stream, retain the current actual-interview behavior:
  clone the microphone tracks, attach them to the peer connection, and keep
  them initially disabled.
- Without a local stream, add a receive-only audio transceiver and create the
  same `oai-events` data channel.
- In both modes, attach the remote stream to an audio element, expose it to the
  lip-sync analyser, forward Realtime events, wait for the data channel to
  become ready, and perform the same cleanup.

The output-only path must not call `navigator.mediaDevices.getUserMedia` and
must not require a `MediaStreamTrack` from the browser.

### Tuning Playback Controller

The tuning panel owns:

- one hidden remote audio element;
- one optional remote audio stream;
- one Realtime WebRTC connection;
- the active response ID and monotonically increasing playback ID;
- connection, playback, and user-visible error states.

On the first playback click, the controller requests credentials, creates the
output-only connection, waits for the data channel, then sends a tuning
`response.create`. Later clicks reuse the connection and send another event.
Only one tuning response may be active at a time.

`response.created` captures the provider response ID.
`output_audio_buffer.stopped` marks audible playback complete and returns the
avatar to idle. `response.done` handles provider-side failure and transcript
validation but does not end the visual playback before the audio buffer stops.

The stop action sends `response.cancel` for the active response when known,
sends `output_audio_buffer.clear`, clears playback state, and keeps the
connection ready for the next click. Unmount, credential expiry, or connection
failure closes the peer connection and clears the audio element source.

### Lip-Sync And Transition History

Pass the remote audio element and stream to `useLipSyncDriverState` with the
current test sentence and draft tuning values. Remove browser speech-boundary
state and all `SpeechSynthesisUtterance` references.

Expose the active viseme cue's `sourceCharacterIndex` from the lip-sync driver
state, or provide an equivalent tested timeline helper. The tuning history uses
that index so its character column remains meaningful without browser boundary
events.

## User Interface States

The existing single playback button remains. Its label and status cover:

- `idle`: `Realtime 음성 테스트 시작`;
- `connecting`: button disabled, credentials and WebRTC are being prepared;
- `playing`: `Realtime 음성 테스트 중지`;
- `error`: the connection or provider failure is shown, and the next start
  attempt creates a fresh connection.

The heading changes from browser voice tuning to OpenAI Realtime lip-sync
tuning. The sliders, save/reset behavior, avatar preview, and transition
history remain in their current layout.

## Security And Privacy

- The OpenAI API key remains backend-only.
- Only a short-lived client secret is returned to the authenticated browser.
- The endpoint is unavailable to anonymous users in every environment.
- The safety identifier is stable for abuse monitoring but does not expose
  names, emails, resume text, or interview content.
- Test sentences and generated audio are not stored in application tables or
  logs.
- Provider error details are bounded by the existing external-service error
  translation.

## Error Handling

- Empty sentence: reject locally before requesting credentials.
- Authentication failure: show a login-required message without attempting
  WebRTC.
- Provider set to mock or API key missing: show a configuration message.
- Credential issuance failure: remain idle and allow retry.
- SDP, peer connection, or data-channel failure: close the broken connection,
  clear audio state, and reconnect on the next click.
- Expired credential: close and recreate the session before sending the next
  playback event.
- Realtime response failure or exact-script transcript mismatch: stop the
  current test, show the provider failure, and keep or recreate the connection
  according to its transport state.
- Component unmount: cancel playback, close WebRTC, detach the audio stream,
  and release cloned or remote track references.

## Testing Strategy

### Contract And Backend

- Assert the new route, request, response, authentication requirement, and API
  documentation entry.
- Assert anonymous callers are rejected.
- Assert authenticated candidate and company users can request credentials.
- Assert the OpenAI client-secret request uses the configured model, voice,
  speed, tuning instructions, and privacy-preserving safety identifier.
- Assert no interview session lookup or database write is required.
- Assert missing configuration and provider errors use the documented errors.
- Re-run existing mock, recruiting, and public Realtime session tests to prove
  the extracted issuer preserves their behavior.

### WebRTC

- Verify output-only mode adds a receive-only audio transceiver and does not
  require or attach microphone tracks.
- Verify actual interview mode still clones and attaches live microphone
  tracks.
- Verify both modes attach remote audio, wait for the data channel, forward
  events, handle timeout/failure, and clean up.
- Verify one exact-script event is created per playback ID.
- Verify cancel and output-buffer-clear events target the active response.

### Tuning Panel

- Assert no browser `speechSynthesis` or `SpeechSynthesisUtterance` path remains.
- Assert the first click creates one credential request and connection.
- Assert subsequent clicks reuse the open connection and send one new
  `response.create` each.
- Assert connecting, playing, stopped, completed, error, expiry, and unmount
  states.
- Assert no microphone permission API is called.
- Assert remote audio and draft tuning settings feed the lip-sync driver.
- Assert transition history uses the timeline character index.

### Project Verification

- Run candidate avatar and Realtime frontend tests.
- Run backend interview controller and service tests.
- Run frontend and backend type checks and production builds.
- Run `git diff --check`.
- Run the Windows Role D local harness.
- Manually replay the default Korean sentence several times in
  `/interviewer-preview` and confirm that the network shows one credential
  request per connection and one `response.create` per button press.

## Acceptance Criteria

- The tuning page uses OpenAI Realtime audio and contains no browser TTS
  playback path.
- It works without an interview session ID or interview database record.
- Anonymous users cannot issue Realtime credentials.
- No microphone permission is requested by the tuning page.
- The first playback creates one output-only WebRTC connection; later playback
  requests reuse it until it expires or fails.
- Every playback press sends exactly one exact-script `response.create` event.
- Realtime remote audio drives the same RMS and viseme pipeline used in actual
  interviews.
- Stop, completion, error, expiry, and unmount leave no active response or
  leaked peer connection.
- Existing actual interview Realtime behavior remains unchanged.
- The feature is available in production when OpenAI Realtime is configured.

## Ownership And Review

This is Role D candidate-interview work. The new API contract and authenticated
route require contract-first documentation and Auth/Common review. Refactoring
the shared Realtime credential issuer affects existing mock, recruiting, and
public interview paths, so those regression tests are mandatory. Changes under
`docs/superpowers` require PM or cross-owner review under the repository rules.

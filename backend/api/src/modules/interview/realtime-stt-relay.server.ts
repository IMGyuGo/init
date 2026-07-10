import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { Logger } from "@nestjs/common";
import jwt from "jsonwebtoken";
import WebSocket, { WebSocketServer } from "ws";
import type { JwtPayload } from "../auth/auth.types";
import { resolveCurrentCandidate, type CurrentCandidateUser } from "../candidate";
import {
  PUBLIC_INTERVIEW_TOKEN_TYPE,
  type PublicInterviewAccess,
} from "./public/public-interview-access-token.service";
import { InterviewService } from "./service/interview.service";

type RelayMode = "mock" | "recruiting";

type RelayRoute = {
  mode: RelayMode;
  sessionId: number;
  publicRoute: boolean;
};

type AttachRealtimeSttRelayOptions = {
  interviewService: InterviewService;
};

type RelayIncomingMessage = IncomingMessage & {
  realtimeSttRoute?: RelayRoute;
  realtimeSttCurrentUser?: CurrentCandidateUser;
};

type OpenAiRealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  session?: {
    type?: string;
  };
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

const logger = new Logger("RealtimeSttRelay");
const DEFAULT_REALTIME_STT_MODEL = "gpt-realtime-whisper";
const DEFAULT_REALTIME_STT_LANGUAGE = "ko";
const DEFAULT_REALTIME_API_BASE_URL = "https://api.openai.com";
const OPENAI_REALTIME_STT_PATH = "/v1/realtime";
const OPENAI_REALTIME_TRANSCRIPTION_INTENT = "transcription";
const MAX_PENDING_AUDIO_CHUNKS = 1200;

export function attachRealtimeSttRelayServer(
  server: { on(event: "upgrade", listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown },
  options: AttachRealtimeSttRelayOptions,
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const route = parseRelayRoute(request.url);
    if (!route) return;

    void authenticateRelayRequest(request, route, options.interviewService)
      .then((currentUser) => {
        wss.handleUpgrade(request, socket, head, (client) => {
          const relayRequest = request as RelayIncomingMessage;
          relayRequest.realtimeSttRoute = route;
          relayRequest.realtimeSttCurrentUser = currentUser;
          wss.emit("connection", client, relayRequest);
        });
      })
      .catch((error) => {
        logger.warn(`Realtime STT relay rejected: ${error instanceof Error ? error.message : String(error)}`);
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
      });
  });

  wss.on("connection", (client, request: RelayIncomingMessage) => {
    if (!request.realtimeSttRoute || !request.realtimeSttCurrentUser) {
      client.close(1011, "Realtime STT relay request context is missing.");
      return;
    }
    connectOpenAiRealtimeTranscription(client, request.realtimeSttRoute, request.realtimeSttCurrentUser);
  });
}

async function authenticateRelayRequest(
  request: IncomingMessage,
  route: RelayRoute,
  interviewService: InterviewService,
): Promise<CurrentCandidateUser> {
  const url = toRequestUrl(request.url);
  const accessToken = url.searchParams.get("accessToken");
  const publicAccessToken = url.searchParams.get("publicAccessToken");

  if (route.publicRoute) {
    const access = verifyPublicInterviewToken(publicAccessToken);
    if (access.sessionId !== route.sessionId) {
      throw new Error("public interview token session mismatch");
    }
    return {
      userId: access.userId,
      userType: "CANDIDATE",
      candidateId: access.candidateId,
    };
  }

  const accessPayload = verifyAccessToken(accessToken);
  const currentUser = resolveCurrentCandidate({
    userId: accessPayload.sub,
    userType: accessPayload.userType,
    companyId: accessPayload.companyId,
    candidateId: accessPayload.candidateId,
  });
  if (route.mode === "mock") {
    await interviewService.listMockQuestions(route.sessionId, currentUser);
  } else {
    await interviewService.listRecruitingQuestions(route.sessionId, currentUser);
  }
  return currentUser;
}

function connectOpenAiRealtimeTranscription(
  client: WebSocket,
  route: RelayRoute,
  currentUser: CurrentCandidateUser,
) {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_PROVIDER_API_KEY;
  if (!apiKey || isPlaceholderSecret(apiKey)) {
    sendClientEvent(client, {
      type: "error",
      message: "OpenAI realtime STT provider is not configured.",
    });
    client.close(1011, "OpenAI realtime STT provider is not configured.");
    return;
  }

  const model = process.env.OPENAI_REALTIME_STT_MODEL || DEFAULT_REALTIME_STT_MODEL;
  const language = process.env.OPENAI_STT_LANGUAGE || DEFAULT_REALTIME_STT_LANGUAGE;
  const delay = process.env.OPENAI_REALTIME_STT_DELAY || "low";
  const upstream = new WebSocket(openAiRealtimeWebSocketUrl(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Safety-Identifier": `candidate-${currentUser.candidateId}`,
    },
  });

  let upstreamOpen = false;
  let transcriptionSessionReady = false;
  let clientClosed = false;
  let commitRequested = false;
  const pendingAudio: string[] = [];
  let accumulatedTranscript = "";

  upstream.on("open", () => {
    upstreamOpen = true;
    upstream.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000,
              },
              transcription: {
                model,
                language,
                delay,
              },
              turn_detection: null,
            },
          },
        },
      }),
    );
  });

  upstream.on("message", (raw) => {
    const event = parseOpenAiEvent(raw);
    if (!event?.type) return;

    if (event.type === "session.updated" && event.session?.type === "transcription") {
      transcriptionSessionReady = true;
      flushPendingAudio(upstream, pendingAudio);
      if (commitRequested) commitAudio(upstream);
      sendClientEvent(client, {
        type: "relay.ready",
        mode: route.mode,
        sessionId: route.sessionId,
        model,
      });
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) {
      accumulatedTranscript += event.delta;
      sendClientEvent(client, {
        type: "transcript.delta",
        delta: event.delta,
        transcript: accumulatedTranscript,
      });
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = event.transcript?.trim() || accumulatedTranscript.trim();
      sendClientEvent(client, {
        type: "transcript.final",
        transcript,
      });
      return;
    }

    if (event.type === "error") {
      sendClientEvent(client, {
        type: "error",
        stage: "openai_event",
        code: event.error?.code,
        message: event.error?.message ?? "OpenAI realtime STT failed.",
        model,
        upstreamOpen,
        transcriptionSessionReady,
      });
    }
  });

  upstream.on("error", (error) => {
    sendClientEvent(client, {
      type: "error",
      stage: "openai_upstream",
      message: error.message,
      model,
      upstreamOpen,
      transcriptionSessionReady,
    });
  });

  upstream.on("close", (code, reason) => {
    if (!clientClosed && client.readyState === WebSocket.OPEN) {
      sendClientEvent(client, {
        type: "relay.closed",
        code,
        reason: reason.toString(),
        model,
        upstreamOpen,
        transcriptionSessionReady,
        transcriptLength: accumulatedTranscript.length,
      });
    }
  });

  client.on("message", (data, isBinary) => {
    if (isBinary) {
      const audio = binaryMessageToBase64(data);
      if (!audio) return;
      if (transcriptionSessionReady && upstream.readyState === WebSocket.OPEN) {
        appendAudio(upstream, audio);
      } else {
        pendingAudio.push(audio);
        if (pendingAudio.length > MAX_PENDING_AUDIO_CHUNKS) {
          pendingAudio.shift();
        }
      }
      return;
    }

    const message = parseClientMessage(data);
    if (message?.type === "commit") {
      commitRequested = true;
      if (transcriptionSessionReady && upstream.readyState === WebSocket.OPEN) {
        commitAudio(upstream);
      }
    }
  });

  client.on("close", () => {
    clientClosed = true;
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
  });
}

function parseRelayRoute(rawUrl: string | undefined): RelayRoute | null {
  const pathname = toRequestUrl(rawUrl).pathname;
  const patterns: Array<{ regex: RegExp; mode: RelayMode; publicRoute: boolean }> = [
    { regex: /^\/api\/v1\/candidate\/mock-interviews\/(\d+)\/realtime-stt-relay$/, mode: "mock", publicRoute: false },
    { regex: /^\/api\/v1\/candidate\/interviews\/(\d+)\/realtime-stt-relay$/, mode: "recruiting", publicRoute: false },
    { regex: /^\/api\/v1\/public\/interviews\/(\d+)\/realtime-stt-relay$/, mode: "recruiting", publicRoute: true },
  ];

  for (const pattern of patterns) {
    const match = pathname.match(pattern.regex);
    if (!match) continue;
    const sessionId = Number(match[1]);
    if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
    return {
      mode: pattern.mode,
      publicRoute: pattern.publicRoute,
      sessionId,
    };
  }

  return null;
}

function verifyAccessToken(token: string | null): JwtPayload {
  if (!token) throw new Error("access token is required");
  const payload = jwt.verify(token, jwtSecret()) as Partial<JwtPayload>;
  if (payload.tokenType !== "access") throw new Error("access token type mismatch");
  return {
    sub: Number(payload.sub),
    userType: payload.userType as JwtPayload["userType"],
    companyId: payload.companyId ?? null,
    candidateId: payload.candidateId ?? null,
    tokenType: "access",
  };
}

function verifyPublicInterviewToken(token: string | null): PublicInterviewAccess {
  if (!token) throw new Error("public interview access token is required");
  const payload = jwt.verify(token, publicInterviewJwtSecret()) as Partial<PublicInterviewAccess>;
  if (payload.tokenType !== PUBLIC_INTERVIEW_TOKEN_TYPE) {
    throw new Error("public interview token type mismatch");
  }

  const applicationId = Number(payload.applicationId);
  const sessionId = Number(payload.sessionId);
  const candidateId = Number(payload.candidateId);
  const userId = Number(payload.userId);
  if (![applicationId, sessionId, candidateId, userId].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("public interview token payload is invalid");
  }

  return {
    tokenType: PUBLIC_INTERVIEW_TOKEN_TYPE,
    applicationId,
    sessionId,
    candidateId,
    userId,
  };
}

function appendAudio(upstream: WebSocket, audio: string) {
  upstream.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
}

function commitAudio(upstream: WebSocket) {
  upstream.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
}

function flushPendingAudio(upstream: WebSocket, pendingAudio: string[]) {
  while (pendingAudio.length > 0) {
    const audio = pendingAudio.shift();
    if (audio) appendAudio(upstream, audio);
  }
}

function sendClientEvent(client: WebSocket, event: Record<string, unknown>) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(event));
  }
}

function parseOpenAiEvent(raw: WebSocket.RawData): OpenAiRealtimeEvent | null {
  try {
    return JSON.parse(raw.toString()) as OpenAiRealtimeEvent;
  } catch {
    return null;
  }
}

function parseClientMessage(raw: WebSocket.RawData): { type?: string } | null {
  try {
    return JSON.parse(raw.toString()) as { type?: string };
  } catch {
    return null;
  }
}

function binaryMessageToBase64(data: WebSocket.RawData): string | null {
  if (Buffer.isBuffer(data)) return data.toString("base64");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("base64");
  if (Array.isArray(data)) return Buffer.concat(data).toString("base64");
  return null;
}

function openAiRealtimeWebSocketUrl(): string {
  const baseUrl = (process.env.OPENAI_REALTIME_API_BASE_URL || DEFAULT_REALTIME_API_BASE_URL).replace(/\/+$/, "");
  const url = new URL(OPENAI_REALTIME_STT_PATH, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("intent", OPENAI_REALTIME_TRANSCRIPTION_INTENT);
  return url.toString();
}

function toRequestUrl(rawUrl: string | undefined): URL {
  return new URL(rawUrl ?? "/", "http://localhost");
}

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me";
}

function publicInterviewJwtSecret(): string {
  return process.env.PUBLIC_INTERVIEW_ACCESS_TOKEN_SECRET ?? jwtSecret();
}

function isPlaceholderSecret(value: string): boolean {
  return ["local-dev-placeholder", "replace-with-secret"].includes(value);
}

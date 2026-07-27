import { buildPublicInterviewBridgeResult } from "./public-interview-bridge";

const bridgeResult = buildPublicInterviewBridgeResult(7, {
  applicationId: 7,
  sessionId: 3,
  interviewStatus: "READY",
  interviewSessionStatus: "READY",
  runtimePath: "/public/applications/7/interview/runtime?sessionId=3",
  publicAccessToken: "public-token",
});

if (bridgeResult.runtimePath !== "/public/applications/7/interview/runtime?sessionId=3") {
  throw new Error("Bridge should use D runtimePath after public start API succeeds.");
}

if (bridgeResult.publicAccessToken !== "public-token") {
  throw new Error("Bridge should persist D publicAccessToken for the runtime page.");
}

try {
  buildPublicInterviewBridgeResult(7, {
    applicationId: 8,
    sessionId: 3,
    interviewStatus: "READY",
    interviewSessionStatus: "READY",
    runtimePath: "/public/applications/8/interview/runtime?sessionId=3",
    publicAccessToken: "wrong-token",
  });
  throw new Error("Bridge should reject a start response for a different application.");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("지원서 정보와 일치하지 않습니다")) {
    throw error;
  }
}

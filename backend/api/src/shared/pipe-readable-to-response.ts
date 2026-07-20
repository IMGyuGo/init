import type { Response } from "express";
import type { Readable } from "stream";

export function pipeReadableToResponse(body: Readable, response: Response): void {
  if (response.destroyed || response.writableEnded) {
    body.destroy();
    return;
  }

  function stopWatchingResponseClose(): void {
    response.off("close", destroyBodyOnPrematureClose);
  }

  function destroyBodyOnPrematureClose(): void {
    response.off("finish", stopWatchingResponseClose);
    if (!response.writableFinished && !body.destroyed) {
      body.destroy();
    }
  }

  response.once("close", destroyBodyOnPrematureClose);
  response.once("finish", stopWatchingResponseClose);

  body.once("error", (error) => {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }

    response.removeHeader("Content-Length");
    response.removeHeader("Content-Range");
    response.status(502).end();
  });
  body.pipe(response);
}

import type { Response } from "express";
import { once } from "events";
import { PassThrough, Writable } from "stream";

import { pipeReadableToResponse } from "./pipe-readable-to-response";

describe("pipeReadableToResponse", () => {
  it("destroys the source immediately when the response is already closed", async () => {
    const body = new PassThrough();
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const closed = once(response, "close");
    response.destroy();
    await closed;

    pipeReadableToResponse(body, response as unknown as Response);

    expect(body.destroyed).toBe(true);
  });

  it("returns 502 without range headers when the source fails before headers are sent", () => {
    const body = new PassThrough();
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & Pick<Response, "end" | "headersSent" | "removeHeader" | "status">;
    response.status = jest.fn().mockReturnValue(response);
    response.removeHeader = jest.fn();
    response.end = jest.fn().mockReturnValue(response);
    response.headersSent = false;

    pipeReadableToResponse(body, response as unknown as Response);
    body.emit("error", new Error("source failed"));

    expect(response.removeHeader).toHaveBeenCalledWith("Content-Length");
    expect(response.removeHeader).toHaveBeenCalledWith("Content-Range");
    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.end).toHaveBeenCalledTimes(1);

    response.emit("finish");
    body.destroy();
  });

  it("destroys the response with the source error after headers are sent", () => {
    const body = new PassThrough();
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & Pick<Response, "destroy" | "headersSent">;
    response.destroy = jest.fn().mockReturnValue(response);
    response.headersSent = true;
    const error = new Error("source failed");

    pipeReadableToResponse(body, response as unknown as Response);
    body.emit("error", error);

    expect(response.destroy).toHaveBeenCalledWith(error);

    response.emit("finish");
    body.destroy();
  });

  it("does not destroy the source after the response has already finished", () => {
    const body = new PassThrough();
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    pipeReadableToResponse(body, response as unknown as Response);
    response.emit("finish");
    response.emit("close");

    expect(body.destroyed).toBe(false);
    body.destroy();
  });
});

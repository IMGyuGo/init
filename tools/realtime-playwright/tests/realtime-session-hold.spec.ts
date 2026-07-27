import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type TokenRow = {
  rowNumber: number;
  applicationId: string;
  magicToken: string;
};

type RealtimeState = {
  status: string | null;
  provider: string | null;
  connectionState: string | null;
  dataChannelState: string | null;
  eventCount: string | null;
  remoteAudio: string | null;
};

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://init-jungle.cloud";
const csvPath = resolve(process.env.PLAYWRIGHT_CSV_PATH ?? "interview_tokens.csv");
const holdSeconds = readPositiveInt("PLAYWRIGHT_HOLD_SECONDS", 300);
const readyTimeoutMs = readPositiveInt("PLAYWRIGHT_REALTIME_READY_TIMEOUT_MS", 90_000);
const pollIntervalMs = readPositiveInt("PLAYWRIGHT_HOLD_POLL_INTERVAL_MS", 10_000);

const tokenRows = selectTokenRows(readTokenRows(csvPath));

if (tokenRows.length === 0) {
  throw new Error("No token rows selected. Check PLAYWRIGHT_TOKEN_ROW_START/END and the CSV file.");
}

test.describe.configure({ mode: "parallel" });

for (const row of tokenRows) {
  test(`row ${row.rowNumber} application ${row.applicationId} keeps realtime session`, async ({
    page,
    context,
  }, testInfo) => {
    testInfo.setTimeout(Math.max(holdSeconds * 1000 + readyTimeoutMs + 120_000, 180_000));

    const apiFailures: Array<{ status: number; method: string; url: string }> = [];
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/") && response.status() >= 400) {
        apiFailures.push({
          status: response.status(),
          method: response.request().method(),
          url: stripTokenQuery(url),
        });
      }
    });

    page.on("pageerror", (error) => {
      testInfo.attach(`page-error-row-${row.rowNumber}`, {
        body: error.stack ?? error.message,
        contentType: "text/plain",
      });
    });

    await context.grantPermissions(["camera", "microphone"], {
      origin: new URL(baseUrl).origin,
    });

    await openInterviewEntry(page, row);
    await completeDeviceSetupIfNeeded(page);

    const realtimeStage = page.locator("[data-realtime-session-status]").first();
    await expect(realtimeStage).toBeVisible({ timeout: 60_000 });
    await waitForRealtimeReady(page, realtimeStage, readyTimeoutMs);

    const initialState = await readRealtimeState(realtimeStage);
    await testInfo.attach("realtime-initial-state", {
      body: JSON.stringify({ rowNumber: row.rowNumber, applicationId: row.applicationId, ...initialState }, null, 2),
      contentType: "application/json",
    });

    const samples = await holdRealtimeSession(page, realtimeStage, holdSeconds, pollIntervalMs);
    await testInfo.attach("realtime-hold-samples", {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });

    const serverFailures = apiFailures.filter((failure) => failure.status >= 500);
    if (apiFailures.length > 0) {
      await testInfo.attach("api-failures", {
        body: JSON.stringify(apiFailures, null, 2),
        contentType: "application/json",
      });
    }

    expect(serverFailures).toEqual([]);
  });
}

async function openInterviewEntry(page: Page, row: TokenRow) {
  const entryUrl = new URL(
    `/public/applications/${encodeURIComponent(row.applicationId)}/interview`,
    baseUrl,
  );
  entryUrl.searchParams.set("token", row.magicToken);

  await page.goto(entryUrl.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const entryResult = await page
    .waitForFunction(
      () => {
        if (document.querySelector(".candidate-device-setup, [data-realtime-session-status]")) {
          return "ready";
        }

        const pageText = (document.body?.textContent ?? "").toLowerCase();
        if (pageText.includes("magic") || pageText.includes("token")) {
          return "invalid-magic-token";
        }
        if (pageText.includes("error") || pageText.includes("not found")) {
          return "interview-entry-error";
        }

        return null;
      },
      null,
      { timeout: 120_000 },
    )
    .then((handle) => handle.jsonValue());

  if (entryResult !== "ready") {
    const pageText = await page
      .locator("body")
      .innerText({ timeout: 1000 })
      .catch(() => "");
    throw new Error(
      [
        `Interview entry failed for CSV row ${row.rowNumber}, application ${row.applicationId}: ${entryResult}`,
        `URL: ${stripTokenQuery(page.url())}`,
        `Page text: ${pageText.slice(0, 500)}`,
        "Regenerate interview_tokens.csv because magic tokens live in Redis and can expire or disappear.",
      ].join("\n"),
    );
  }
}

async function completeDeviceSetupIfNeeded(page: Page) {
  const deviceSetup = page.locator(".candidate-device-setup").first();
  if (!(await isVisible(deviceSetup))) {
    return;
  }

  // The browser uses fake camera/mic devices. This clicks the app's own device-check button.
  await deviceSetup.locator(".candidate-device-controls button.btn").last().click({ timeout: 30_000 });

  const startButton = deviceSetup.locator(".candidate-device-setup__head .toolbar .btn.primary").first();
  await expect(startButton).toBeEnabled({ timeout: 60_000 });
  await startButton.click({ timeout: 30_000 });
}

async function waitForRealtimeReady(page: Page, realtimeStage: Locator, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readRealtimeState(realtimeStage);

    if (state.status === "failed") {
      throw new Error(`Realtime session failed before ready: ${JSON.stringify(state)}`);
    }

    if (state.status === "ready") {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Realtime session was not ready within ${timeoutMs}ms`);
}

async function holdRealtimeSession(page: Page, realtimeStage: Locator, seconds: number, intervalMs: number) {
  const samples: Array<RealtimeState & { elapsedSeconds: number }> = [];
  const deadline = Date.now() + seconds * 1000;

  while (Date.now() < deadline) {
    if (!(await isVisible(realtimeStage))) {
      throw new Error("Realtime stage disappeared while holding the session.");
    }

    const state = await readRealtimeState(realtimeStage);
    const elapsedSeconds = seconds - Math.ceil((deadline - Date.now()) / 1000);
    samples.push({ elapsedSeconds, ...state });

    if (page.url().includes("/complete")) {
      throw new Error("Interview moved to complete page before the hold time ended.");
    }

    if (state.status === "failed") {
      throw new Error(`Realtime session failed while holding: ${JSON.stringify(state)}`);
    }

    if (["failed", "closed"].includes(state.connectionState ?? "")) {
      throw new Error(`Realtime connection closed while holding: ${JSON.stringify(state)}`);
    }

    if (["closing", "closed"].includes(state.dataChannelState ?? "")) {
      throw new Error(`Realtime data channel closed while holding: ${JSON.stringify(state)}`);
    }

    await page.waitForTimeout(Math.min(intervalMs, Math.max(deadline - Date.now(), 0)));
  }

  return samples;
}

async function readRealtimeState(realtimeStage: Locator): Promise<RealtimeState> {
  return {
    status: await realtimeStage.getAttribute("data-realtime-session-status"),
    provider: await realtimeStage.getAttribute("data-realtime-provider"),
    connectionState: await realtimeStage.getAttribute("data-realtime-connection-state"),
    dataChannelState: await realtimeStage.getAttribute("data-realtime-data-channel-state"),
    eventCount: await realtimeStage.getAttribute("data-realtime-event-count"),
    remoteAudio: await realtimeStage.getAttribute("data-realtime-remote-audio"),
  };
}

function readTokenRows(path: string): TokenRow[] {
  const csv = readFileSync(path, "utf8").trim();
  const [header, ...lines] = csv.split(/\r?\n/);

  if (header.trim() !== "applicationId,magicToken") {
    throw new Error(`Unexpected CSV header: ${header}`);
  }

  return lines
    .map((line, index) => {
      const [applicationId, ...tokenParts] = line.split(",");
      return {
        rowNumber: index + 1,
        applicationId: applicationId.trim(),
        magicToken: tokenParts.join(",").trim(),
      };
    })
    .filter((row) => row.applicationId.length > 0 && row.magicToken.length > 0);
}

function selectTokenRows(rows: TokenRow[]) {
  const start = readPositiveInt("PLAYWRIGHT_TOKEN_ROW_START", 1);
  const end = readPositiveInt("PLAYWRIGHT_TOKEN_ROW_END", rows.length);
  const maxRows = readOptionalPositiveInt("PLAYWRIGHT_MAX_ROWS");

  const selected = rows.filter((row) => row.rowNumber >= start && row.rowNumber <= end);
  return typeof maxRows === "number" ? selected.slice(0, maxRows) : selected;
}

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer. Current value: ${raw}`);
  }

  return value;
}

function readOptionalPositiveInt(name: string) {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer. Current value: ${raw}`);
  }

  return value;
}

async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 1000 }).catch(() => false);
}

function stripTokenQuery(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.delete("token");
  return parsed.toString();
}

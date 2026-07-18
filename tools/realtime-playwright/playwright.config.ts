import { defineConfig, devices } from "@playwright/test";

const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? "1");

export default defineConfig({
  testDir: "./tests",
  timeout: 8 * 60 * 1000,
  expect: {
    timeout: 30 * 1000,
  },
  workers,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://init-jungle.cloud",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["camera", "microphone"],
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  },
});

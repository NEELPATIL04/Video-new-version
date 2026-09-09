import { defineConfig, devices } from "@playwright/test";

// Real two-browser-context e2e coverage for the call flow — see
// e2e/two-user-call.spec.ts. Needs the backend, Postgres, and the
// self-hosted LiveKit server (infra/livekit/docker-compose.yml) already
// running; this only starts the Next.js dev server.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Fake devices instead of real camera/mic — makes getUserMedia()
    // resolve immediately with a synthetic stream in CI/headless runs,
    // so the LiveKitRoom publish path is exercised for real rather than
    // being skipped.
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

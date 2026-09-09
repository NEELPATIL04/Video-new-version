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
    //
    // --force-webrtc-ip-handling-policy: Chrome hides local ICE
    // candidates behind mDNS ".local" hostnames by default. mDNS
    // resolution routinely fails in headless/automated browser instances
    // (no responder reachable in that process context) — with no TURN
    // server configured (WEBRTC_LIVEKIT.md #6, not needed for local dev),
    // that leaves ICE with zero usable candidates and the peer connection
    // never establishes. Forcing direct IPs fixes it. This is why a real
    // desktop Chrome window (the manual two-window test) worked fine but
    // this automated run didn't — it's an automation-mode quirk, not an
    // app bug.
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--force-webrtc-ip-handling-policy=default_public_and_private_interfaces",
      ],
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

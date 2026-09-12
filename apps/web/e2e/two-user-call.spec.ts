import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { RoomServiceClient, TrackType } from "livekit-server-sdk";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Derived from the SDK's own return type rather than importing
// @livekit/protocol directly — that package is only a transitive
// dependency here (livekit-server-sdk depends on it), and this keeps the
// test in sync with whatever version actually gets resolved.
type ParticipantInfo = Awaited<ReturnType<RoomServiceClient["listParticipants"]>>[number];
type TrackInfo = ParticipantInfo["tracks"][number];

// The real question this suite answers: are two people who join the same
// room actually IN THE SAME LiveKit room together, not just two people who
// each independently got a "success" response? Two isolated browser
// contexts (separate cookie jars, like two real people on two real
// devices) is what makes this a genuine test rather than the two-tabs
// approach we tried manually first, which shares cookies for the same
// origin and can't cleanly simulate two independent sessions.

// Must match apps/web/.env's NEXT_PUBLIC_API_URL — playwright.config.ts
// only starts the Next.js dev server, not the backend, so this talks to
// it directly for registration and setup (see beforeAll below).
const API_URL = "http://localhost:3001";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e-test.local`;
}

// Serial + a single shared join in beforeAll (not a fresh room per test):
// a real host doesn't rejoin the call from scratch before every single
// button they click, and re-registering/re-joining per test also meant
// re-triggering the app's own silent-refresh flow (POST /auth/refresh) far
// more than a normal user session would in a minute — which is exactly
// what /auth/refresh's own brute-force throttle (10/min) exists to catch.
// One join for the whole suite keeps the traffic pattern realistic and
// lets the 4 checks run as the natural sequence of one live call: see who
// joined, confirm a guest has no admin UI, mute them, then remove them
// (removal ends B's connection, so it has to run last).
test.describe.serial("call flow", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let roomId: string;
  const password = "TestPass1!";
  const nameA = "E2E User A";
  const nameB = "E2E User B";

  test.beforeAll(async ({ browser, request }) => {
    // `next dev` compiles each route on its first hit. Raw HTTP GETs (not
    // page.goto) force that server-side compile without running any
    // client-side JS — a real page load would fire useAuthInit's
    // /auth/refresh call even while anonymous, burning refresh's own
    // throttle budget for no reason during warm-up.
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const registerViaApi = async (name: string, email: string): Promise<StorageState> => {
      const context = await browser.newContext();
      const res = await context.request.post(`${API_URL}/auth/register`, {
        data: { name, email, password },
      });
      if (!res.ok()) {
        throw new Error(`Setup failed: could not register ${email} (${res.status()} ${await res.text()})`);
      }
      const state = await context.storageState();
      await context.close();
      return state;
    };

    const [stateA, stateB] = await Promise.all([
      registerViaApi(nameA, uniqueEmail("usera")),
      registerViaApi(nameB, uniqueEmail("userb")),
    ]);

    contextA = await browser.newContext({ storageState: stateA });
    contextB = await browser.newContext({ storageState: stateB });
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    // Both users are already authenticated via the httpOnly refresh
    // cookie carried over in storageState — landing on /rooms triggers
    // the same silent-refresh flow a real returning user hits on load.
    // Generous timeout: this is the first REAL page load of the run, and
    // next dev still has to compile the client bundle even though the
    // warm-up above already compiled the server-rendered HTML for it.
    await pageA.goto("/rooms");
    await expect(pageA.getByRole("button", { name: "Start instant meeting" })).toBeVisible({ timeout: 20_000 });

    // User A (host) creates the room and joins it.
    await pageA.getByPlaceholder("Meeting name").fill("E2E Two User Call");
    await pageA.getByRole("button", { name: "Start instant meeting" }).click();
    await pageA.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    const roomUrl = pageA.url();
    roomId = new URL(roomUrl).pathname.split("/").pop()!;

    // Wait for A's own LiveKit connection to actually establish — the
    // control bar (mic/camera/leave) only renders once connected, not while
    // still on the "Joining meeting..." placeholder.
    await expect(pageA.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // User B (participant) joins the SAME room via the URL A ended up on —
    // the real-world equivalent of A sharing the meeting link with B. Any
    // non-host now lands in the waiting room first (see waiting-room.spec.ts
    // for that flow in detail) — the host has to admit them before they
    // reach the actual call.
    await pageB.goto(roomUrl);
    await expect(pageB.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    // Scoped to the waiting-room panel specifically (data-testid) rather
    // than a bare listitem — HostControls renders its own <li> list too,
    // and once B is admitted and connects, both could momentarily show
    // B's name at once, making an unscoped listitem locator ambiguous.
    const waitingPanel = pageA.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameB })).toBeVisible({ timeout: 10_000 });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameB }).getByRole("button", { name: "Admit" }).click();
    await expect(pageB.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    // beforeAll can throw before these are ever assigned (e.g. hitting
    // /auth/register's throttle) — afterAll still runs in that case, and
    // without the guard it throws its own confusing "undefined" error on
    // top of the real one.
    await contextA?.close();
    await contextB?.close();
  });

  test("two independent users joining the same room both see each other as connected participants", async () => {
    // The actual proof of a shared room: each participant's rendered name
    // tag should show up on BOTH pages, not just their own. If A and B had
    // each connected to their own isolated session, each page would only
    // ever show one name.
    await expect(pageA.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });
    await expect(pageB.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });

    // Scoped to the LiveKit-rendered name tag specifically — a bare
    // getByText(nameB) also matches HostControls' own participant list on
    // pageA (A is host), which shows the same name and makes the locator
    // ambiguous (Playwright strict mode rejects it).
    await expect(pageA.locator(".lk-participant-name", { hasText: nameA })).toBeVisible();
    await expect(pageA.locator(".lk-participant-name", { hasText: nameB })).toBeVisible();
    await expect(pageB.locator(".lk-participant-name", { hasText: nameA })).toBeVisible();
    await expect(pageB.locator(".lk-participant-name", { hasText: nameB })).toBeVisible();
  });

  test("a non-host participant is never shown host controls", async () => {
    // B is a regular participant, not the host — HostControls must not
    // render for them at all, regardless of what the host sees. Runs
    // before the mute/remove tests below since remove ends B's connection.
    await expect(pageB.getByText("Host controls")).not.toBeVisible();
  });

  test("host can mute a participant's published audio track", async () => {
    // CallRoom deliberately never auto-publishes audio/video (see its own
    // comment on why), so B has to actually turn their mic on first —
    // otherwise there's no track for the host to mute at all. LiveKit's
    // control bar renders this as an icon-only button with no visible
    // text or aria-label, so we target it via the `data-lk-source`
    // attribute the SDK itself sets (@livekit/components-react's
    // useTrackToggle hook), rather than guessing at an accessible name.
    await pageB.locator('button[data-lk-source="microphone"]').click();

    // Give LiveKit a moment to register the newly published track before
    // asserting against its server-side state below.
    const roomService = new RoomServiceClient("http://localhost:7880", "devkey", "secret");
    await expect
      .poll(
        async () => {
          const participants = await roomService.listParticipants(roomId);
          const guest = participants.find((p: ParticipantInfo) => p.name === nameB);
          return guest?.tracks.some((t: TrackInfo) => t.type === TrackType.AUDIO);
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // Host mutes B through the actual HostControls UI. Scoped to the
    // host-controls panel (data-testid) rather than a bare listitem —
    // WaitingRoomHostPanel's own <li> list is empty by this point (B is
    // long admitted), but staying scoped keeps this robust regardless.
    await pageA
      .getByTestId("host-controls")
      .getByRole("listitem")
      .filter({ hasText: nameB })
      .getByRole("button", { name: "Mute" })
      .click();

    // The real proof: query LiveKit's own server-side state directly,
    // rather than trust a DOM icon that may or may not reflect reality.
    // This is source-of-truth verification, not a UI-appearance check.
    await expect
      .poll(
        async () => {
          const participants = await roomService.listParticipants(roomId);
          const guest = participants.find((p: ParticipantInfo) => p.name === nameB);
          const audioTrack = guest?.tracks.find((t: TrackInfo) => t.type === TrackType.AUDIO);
          return audioTrack?.muted;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test("host can remove a participant, who is then disconnected from the call", async () => {
    await pageA
      .getByTestId("host-controls")
      .getByRole("listitem")
      .filter({ hasText: nameB })
      .getByRole("button", { name: "Remove" })
      .click();

    // B's onDisconnected handler (CallRoom) pushes back to /rooms once
    // LiveKit actually terminates their connection — this only passes if
    // the removal genuinely took effect server-side, not just that our
    // API returned 200.
    await expect(pageB).toHaveURL(/\/rooms$/, { timeout: 10_000 });
  });
});

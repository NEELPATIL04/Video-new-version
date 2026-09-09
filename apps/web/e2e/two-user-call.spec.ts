import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { RoomServiceClient, TrackType } from "livekit-server-sdk";

// Derived from the SDK's own return type rather than importing
// @livekit/protocol directly — that package is only a transitive
// dependency here (livekit-server-sdk depends on it), and this keeps the
// test in sync with whatever version actually gets resolved.
type ParticipantInfo = Awaited<ReturnType<RoomServiceClient["listParticipants"]>>[number];
type TrackInfo = ParticipantInfo["tracks"][number];

// The real question this test answers: are two people who join the same
// room actually IN THE SAME LiveKit room together, not just two people who
// each independently got a "success" response? Two isolated browser
// contexts (separate cookie jars, like two real people on two real
// devices) is what makes this a genuine test rather than the two-tabs
// approach we tried manually first, which shares cookies for the same
// origin and can't cleanly simulate two independent sessions.

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e-test.local`;
}

async function registerAndLandOnRooms(page: Page, name: string, email: string, password: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/rooms$/);
}

test.describe("call flow", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let roomId: string;
  const password = "TestPass1!";
  const nameA = "E2E User A";
  const nameB = "E2E User B";

  test.beforeEach(async ({ browser }) => {
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await registerAndLandOnRooms(pageA, nameA, uniqueEmail("usera"), password);
    await registerAndLandOnRooms(pageB, nameB, uniqueEmail("userb"), password);

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
    // the real-world equivalent of A sharing the meeting link with B.
    await pageB.goto(roomUrl);
    await expect(pageB.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async () => {
    await contextA.close();
    await contextB.close();
  });

  test("two independent users joining the same room both see each other as connected participants", async () => {
    // The actual proof of a shared room: each participant's rendered name
    // tag should show up on BOTH pages, not just their own. If A and B had
    // each connected to their own isolated session, each page would only
    // ever show one name.
    await expect(pageA.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });
    await expect(pageB.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });

    await expect(pageA.getByText(nameA)).toBeVisible();
    await expect(pageA.getByText(nameB)).toBeVisible();
    await expect(pageB.getByText(nameA)).toBeVisible();
    await expect(pageB.getByText(nameB)).toBeVisible();
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

    // Host mutes B through the actual HostControls UI.
    await pageA.getByRole("listitem").filter({ hasText: nameB }).getByRole("button", { name: "Mute" }).click();

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
    await pageA.getByRole("listitem").filter({ hasText: nameB }).getByRole("button", { name: "Remove" }).click();

    // B's onDisconnected handler (CallRoom) pushes back to /rooms once
    // LiveKit actually terminates their connection — this only passes if
    // the removal genuinely took effect server-side, not just that our
    // API returned 200.
    await expect(pageB).toHaveURL(/\/rooms$/, { timeout: 10_000 });
  });

  test("a non-host participant is never shown host controls", async () => {
    // B is a regular participant, not the host — HostControls must not
    // render for them at all, regardless of what the host sees.
    await expect(pageB.getByText("Host controls")).not.toBeVisible();
  });
});

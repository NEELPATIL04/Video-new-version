import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { RoomServiceClient } from "livekit-server-sdk";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: when the host splits guests into
// breakout rooms, do they actually end up in two SEPARATE LiveKit rooms
// (RoomServiceClient.createRoom() under the hood, per
// BreakoutRoomsService.createBreakoutRooms), or just two differently
// labeled views of the same underlying call? And when the host ends
// breakouts, does an ALREADY-CONNECTED guest's client actually learn about
// it and reconnect to the main room on its own — the polling mechanism
// documented in BreakoutRoomAwareCallRoom.tsx — rather than just leaving
// them stranded in a room that no longer exists from the host's point of
// view. Verified against LiveKit's own server-side participant lists
// (RoomServiceClient), the same source-of-truth approach
// two-user-call.spec.ts uses for mute/remove, not just DOM appearances.

const API_URL = "http://localhost:3001";
const password = "TestPass1!";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e-test.local`;
}

async function registerViaApi(
  browser: import("@playwright/test").Browser,
  name: string,
  email: string,
): Promise<StorageState> {
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
}

test.describe.serial("breakout rooms", () => {
  let hostContext: BrowserContext;
  let guestAContext: BrowserContext;
  let guestBContext: BrowserContext;
  let hostPage: Page;
  let guestAPage: Page;
  let guestBPage: Page;
  const nameHost = "BR Host";
  const nameGuestA = "BR Guest A";
  const nameGuestB = "BR Guest B";
  let roomUrl: string;
  let roomId: string;
  let breakoutRoomIdA: string;
  let breakoutRoomIdB: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestAState, guestBState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("br-host")),
      registerViaApi(browser, nameGuestA, uniqueEmail("br-guesta")),
      registerViaApi(browser, nameGuestB, uniqueEmail("br-guestb")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestAContext = await browser.newContext({ storageState: guestAState });
    guestBContext = await browser.newContext({ storageState: guestBState });
    hostPage = await hostContext.newPage();
    guestAPage = await guestAContext.newPage();
    guestBPage = await guestBContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Breakout Rooms Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    roomId = new URL(roomUrl).pathname.split("/").pop()!;
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");

    // Guest A joins and is admitted.
    await guestAPage.goto(roomUrl);
    await expect(guestAPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA }).getByRole("button", { name: "Admit" }).click();
    await expect(guestAPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    // Guest B joins and is admitted.
    await guestBPage.goto(roomUrl);
    await expect(guestBPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB }).getByRole("button", { name: "Admit" }).click();
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    // Sanity: all three genuinely share the main LiveKit room before the
    // split — otherwise the "separate rooms" assertions below would be
    // meaningless.
    await expect(hostPage.locator(".lk-participant-name")).toHaveCount(3, { timeout: 15_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestAContext?.close();
    await guestBContext?.close();
  });

  test("the breakout rooms panel is host-only", async () => {
    await expect(hostPage.getByTestId("breakout-rooms-host-panel")).toBeVisible({ timeout: 5_000 });
    await expect(guestAPage.getByTestId("breakout-rooms-host-panel")).not.toBeVisible();
    await expect(guestBPage.getByTestId("breakout-rooms-host-panel")).not.toBeVisible();
  });

  test("host splits guests into two separate breakout rooms, each a genuinely distinct LiveKit room", async () => {
    const panel = hostPage.getByTestId("breakout-rooms-host-panel");

    // Default room count is already 2 — assign guest A to Room 1, guest B
    // to Room 2.
    await panel.getByRole("listitem").filter({ hasText: nameGuestA }).getByRole("button", { name: "Room 1" }).click();
    await panel.getByRole("listitem").filter({ hasText: nameGuestB }).getByRole("button", { name: "Room 2" }).click();

    const [createResponse] = await Promise.all([
      hostPage.waitForResponse(
        (res) => res.url().endsWith("/breakout-rooms") && res.request().method() === "POST",
      ),
      panel.getByRole("button", { name: "Create breakout rooms" }).click(),
    ]);
    const created = (await createResponse.json()) as {
      id: string;
      label: string;
      participantUserIds: string[];
    }[];
    breakoutRoomIdA = created.find((r) => r.label === "Room 1")!.id;
    breakoutRoomIdB = created.find((r) => r.label === "Room 2")!.id;
    expect(breakoutRoomIdA).toBeTruthy();
    expect(breakoutRoomIdB).toBeTruthy();
    expect(breakoutRoomIdA).not.toBe(breakoutRoomIdB);

    // Both ALREADY-CONNECTED guests' clients pick this up via their
    // my-assignment poll (every 3s — see BreakoutRoomAwareCallRoom.tsx)
    // and reconnect on their own, with no action needed on their part.
    await expect(guestAPage.getByTestId("breakout-room-banner")).toHaveText(/Room 1/, { timeout: 15_000 });
    await expect(guestBPage.getByTestId("breakout-room-banner")).toHaveText(/Room 2/, { timeout: 15_000 });

    // The real proof: query LiveKit's own server-side state for each
    // breakout room AND the main room directly, rather than trust the
    // banner label alone. If the backend had silently reused a single
    // LiveKit room labeled two different ways, or moved both guests into
    // the same room, one of these three checks would fail.
    const roomService = new RoomServiceClient("http://localhost:7880", "devkey", "secret");

    await expect
      .poll(
        async () => {
          const parts = await roomService.listParticipants(breakoutRoomIdA);
          return parts.map((p) => p.name);
        },
        { timeout: 20_000 },
      )
      .toEqual([nameGuestA]);

    await expect
      .poll(
        async () => {
          const parts = await roomService.listParticipants(breakoutRoomIdB);
          return parts.map((p) => p.name);
        },
        { timeout: 20_000 },
      )
      .toEqual([nameGuestB]);

    // Both guests genuinely left the MAIN LiveKit room — only the host is
    // still connected there. (If the "breakout" were just a relabeled
    // view of the same room, both guests would still show up here too.)
    await expect
      .poll(
        async () => {
          const parts = await roomService.listParticipants(roomId);
          return parts.map((p) => p.name);
        },
        { timeout: 20_000 },
      )
      .toEqual([nameHost]);
  });

  test("ending breakout rooms brings both guests back to the main room on their own", async () => {
    const panel = hostPage.getByTestId("breakout-rooms-host-panel");
    await panel.getByRole("button", { name: "End breakout rooms" }).click();

    // Neither guest does anything here — this is entirely their client's
    // poll noticing the assignment cleared and reconnecting to the main
    // room by itself (see BreakoutRoomAwareCallRoom.tsx's own comment on
    // why this has to be polling, not a fire-and-forget signal).
    await expect(guestAPage.getByTestId("breakout-room-banner")).not.toBeVisible({ timeout: 15_000 });
    await expect(guestBPage.getByTestId("breakout-room-banner")).not.toBeVisible({ timeout: 15_000 });
    await expect(guestAPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Source-of-truth check again: all three are back together in the
    // actual main LiveKit room.
    const roomService = new RoomServiceClient("http://localhost:7880", "devkey", "secret");
    await expect
      .poll(
        async () => {
          const parts = await roomService.listParticipants(roomId);
          return parts.map((p) => p.name).sort();
        },
        { timeout: 20_000 },
      )
      .toEqual([nameGuestA, nameGuestB, nameHost].sort());
  });
});

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does the analytics endpoint report
// REAL attendance data recorded from an actual LiveKit call (two genuine
// participants, one of whom genuinely left), not just data a mocked
// backend would return? A host-only view over join/leave history is only
// meaningful if the join/leave history it reads is itself real — this
// drives a full two-browser-context call through the same join/admit flow
// as two-user-call.spec.ts / waiting-room.spec.ts, then reads the
// analytics page back and checks the numbers against what actually
// happened.

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

test.describe.serial("meeting analytics", () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;
  const nameHost = "MA Host";
  const nameGuest = "MA Guest";
  // Deliberately doesn't contain the word "Analytics" — the room-name link
  // and the "Analytics" link both render inside the same <li>, and a room
  // named "...Analytics..." would make getByRole("link", { name:
  // "Analytics" }) match both (substring accessible-name matching),
  // tripping Playwright's strict mode.
  const roomName = "E2E Attendance Test";
  let roomUrl: string;
  let roomId: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("ma-host")),
      registerViaApi(browser, nameGuest, uniqueEmail("ma-guest")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestContext = await browser.newContext({ storageState: guestState });
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill(roomName);
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    roomId = new URL(roomUrl).pathname.split("/").pop()!;
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // The guest joins, lands in the waiting room, and gets admitted — the
    // same real join flow every other call-flow spec exercises.
    await guestPage.goto(roomUrl);
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuest })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuest }).getByRole("button", { name: "Admit" }).click();
    await expect(guestPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    // The guest actually leaves the call (via the host removing them, the
    // one path currently wired in the UI to set Participant.leftAt — see
    // RoomsService.removeParticipant) so the analytics view below has a
    // genuine "joined then left" participant to report, not just two
    // participants who are both still connected.
    await hostPage
      .getByTestId("host-controls")
      .getByRole("listitem")
      .filter({ hasText: nameGuest })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(guestPage).toHaveURL(/\/rooms$/, { timeout: 10_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  test("the room list shows an Analytics link to the host, reachable while the meeting is still live", async () => {
    await hostPage.goto("/rooms");
    const roomRow = hostPage.getByRole("listitem").filter({ hasText: roomName });
    await expect(roomRow.getByRole("link", { name: "Analytics" })).toBeVisible({ timeout: 10_000 });
    await roomRow.getByRole("link", { name: "Analytics" }).click();
    await expect(hostPage).toHaveURL(new RegExp(`/rooms/${roomId}/analytics$`));
  });

  test("the host sees real attendance data: both participants counted, one still in call, one with a real leave time", async () => {
    await expect(hostPage.getByTestId("meeting-analytics")).toBeVisible({ timeout: 10_000 });

    // Two unique participants (host + guest) actually joined this room.
    await expect(hostPage.getByTestId("analytics-total-participants")).toHaveText("2");

    // Still live — RoomStatus hasn't reached 'ended', so the duration tile
    // reads "so far" rather than a final total.
    await expect(hostPage.getByText("Duration so far — still in progress")).toBeVisible();

    const rows = hostPage.getByTestId("analytics-participant-row");
    await expect(rows).toHaveCount(2);

    // The host is still connected — their row must say so, not show a left
    // timestamp.
    const hostRow = rows.filter({ hasText: nameHost });
    await expect(hostRow.getByText("Still in call")).toBeVisible();

    // The guest was removed above — their row must show a REAL left
    // timestamp (not "Still in call") and a non-zero duration, proving the
    // backend actually read Participant.leftAt rather than defaulting
    // everyone to "still connected".
    const guestRow = rows.filter({ hasText: nameGuest });
    await expect(guestRow.getByText("Still in call")).not.toBeVisible();
    const guestCells = await guestRow.locator("td").allTextContents();
    // [name, role, joinedAt, leftAt, duration] — leftAt (index 3) must be a
    // real, non-empty timestamp string once the guest has left.
    expect(guestCells[3]).not.toBe("");
    expect(guestCells[3]).not.toBe("Still in call");
    expect(guestCells[4]).toMatch(/^\d+:\d{2}$/); // e.g. "0:03" — mm:ss
  });

  test("a non-host is refused when trying to view this meeting's analytics", async () => {
    // The guest is no longer even a listed member of this room (their own
    // Participant row now has leftAt set, so RoomsService.listMyRooms
    // excludes it) — the real test is that navigating straight to the
    // analytics URL is refused server-side, not just hidden from a menu.
    // RoomHostGuard rejects it before RoomsService.getMeetingAnalytics'
    // own (defense-in-depth) host check ever runs, so the message seen
    // here is the guard's ("Only the host can perform this action"), not
    // the service method's own — both exist, but the guard is first in
    // the chain for every request that reaches this route.
    await guestPage.goto(`/rooms/${roomId}/analytics`);
    await expect(guestPage.getByText("Only the host can perform this action")).toBeVisible({
      timeout: 10_000,
    });
    await expect(guestPage.getByTestId("meeting-analytics")).not.toBeVisible();
  });
});

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// MeetingLockControl renders directly inside the "More" dropdown itself
// (not behind a drawer section — see CallSidePanel.tsx), and nothing
// closes that dropdown except picking a section or clicking the toggle
// again. A blind, unconditional toggle click is therefore NOT idempotent
// here (unlike the toggle+section pattern other specs use, which always
// ends with the dropdown closed): if a previous test left it open, a
// second blind click would close it. Check first, open only if needed.
async function ensureMoreMenuOpen(page: Page) {
  const isOpen = await page.getByTestId("more-menu").isVisible().catch(() => false);
  if (!isOpen) {
    await page.getByTestId("more-menu-toggle").click();
  }
}

// The real question this suite answers: does locking a meeting actually
// block the join REQUEST at the backend (a genuinely new joiner never
// reaches the call, gets told why), while still letting someone who's
// already a member of the room back in — not just show a "locked" label
// in the UI while the backend hands out access regardless. Every guest
// join here is a real navigation through RoomCallPage's join flow, the
// same one two-user-call.spec.ts and waiting-room.spec.ts exercise.

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

test.describe.serial("meeting lock", () => {
  let hostContext: BrowserContext;
  let guestAContext: BrowserContext;
  let hostPage: Page;
  let guestAPage: Page;
  const nameHost = "ML Host";
  const nameGuestA = "ML Guest A";
  const nameGuestB = "ML Guest B";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestAState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("ml-host")),
      registerViaApi(browser, nameGuestA, uniqueEmail("ml-guesta")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestAContext = await browser.newContext({ storageState: guestAState });
    hostPage = await hostContext.newPage();
    guestAPage = await guestAContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Meeting Lock Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Guest A joins and gets admitted — this is the "already a member"
    // participant used later to prove the lock doesn't affect reconnects.
    await guestAPage.goto(roomUrl);
    await expect(guestAPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    // Behind the tray's "More" menu's People section now, not a
    // permanently-visible rail icon (see CallSidePanel.tsx).
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA }).getByRole("button", { name: "Admit" }).click();
    await expect(guestAPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestAContext?.close();
  });

  test("the lock toggle is host-only and starts unlocked", async () => {
    // Its accessible name lost its emoji prefix when it moved to a real
    // lucide icon — see MeetingLockControl.tsx.
    await ensureMoreMenuOpen(hostPage);
    await expect(
      hostPage.getByTestId("meeting-lock-control").getByRole("button", { name: "Lock meeting" }),
    ).toBeVisible({ timeout: 5_000 });
    // Guest A is not the host — no lock control on their page at all.
    await expect(guestAPage.getByTestId("meeting-lock-control")).not.toBeVisible();
  });

  test("locking blocks a brand-new guest from joining, with a clear reason — they never reach the call", async ({
    browser,
  }) => {
    await ensureMoreMenuOpen(hostPage);
    await hostPage.getByTestId("meeting-lock-control").getByRole("button", { name: "Lock meeting" }).click();
    await expect(
      hostPage.getByTestId("meeting-lock-control").getByRole("button", { name: "Unlock meeting" }),
    ).toBeVisible({ timeout: 5_000 });

    const guestBState = await registerViaApi(browser, nameGuestB, uniqueEmail("ml-guestb"));
    const guestBContext = await browser.newContext({ storageState: guestBState });
    const guestBPage = await guestBContext.newPage();

    await guestBPage.goto(roomUrl);

    // A locked meeting gets a specific, honest reason — not a generic
    // "not found" — and guest B must never reach the call UI at all.
    await expect(guestBPage.getByText("This meeting is locked")).toBeVisible({ timeout: 10_000 });
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).not.toBeVisible();
    await expect(guestBPage.getByText("Waiting for the host to let you in")).not.toBeVisible();

    await guestBContext.close();
  });

  test("an already-admitted participant can still reconnect while the meeting is locked", async () => {
    // Simulate a network drop / reconnect: leave the LiveKit call (which
    // routes back to /rooms via onDisconnected) and navigate back in,
    // hitting joinRoom again under the SAME identity that's already an
    // admitted member of this room.
    await guestAPage.getByRole("button", { name: /Leave/i }).click();
    await guestAPage.waitForURL(/\/rooms$/);

    await guestAPage.goto(roomUrl);

    // Straight back into the call — no waiting room, no lock rejection,
    // because guest A already has a Participant row from earlier.
    await expect(guestAPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
    await expect(guestAPage.getByText("This meeting is locked")).not.toBeVisible();
    await expect(guestAPage.getByText("Waiting for the host to let you in")).not.toBeVisible();
  });

  test("unlocking allows a new guest to join again (through the normal waiting room)", async ({ browser }) => {
    await ensureMoreMenuOpen(hostPage);
    await hostPage.getByTestId("meeting-lock-control").getByRole("button", { name: "Unlock meeting" }).click();
    await expect(
      hostPage.getByTestId("meeting-lock-control").getByRole("button", { name: "Lock meeting" }),
    ).toBeVisible({ timeout: 5_000 });

    const guestBState = await registerViaApi(browser, nameGuestB + " 2", uniqueEmail("ml-guestb2"));
    const guestBContext = await browser.newContext({ storageState: guestBState });
    const guestBPage = await guestBContext.newPage();

    await guestBPage.goto(roomUrl);

    // Unlocked again — a brand-new guest reaches the normal waiting room
    // (still gated by the host, unrelated to the lock) instead of being
    // rejected outright.
    await expect(guestBPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    // The dropdown is already open from ensureMoreMenuOpen above (a
    // section click never touched it in between) — clicking the toggle
    // again here would close it before "People" could be picked, so this
    // goes straight to the section item.
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB + " 2" })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel
      .getByRole("listitem")
      .filter({ hasText: nameGuestB + " 2" })
      .getByRole("button", { name: "Admit" })
      .click();
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    await guestBContext.close();
  });
});

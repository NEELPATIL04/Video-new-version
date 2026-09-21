import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers is the one FEATURES.md's Research
// notes flags explicitly for this feature: does a participant who joins
// AFTER strokes have already been drawn actually see them, or a blank
// canvas? A pure LiveKit data-channel broadcast (as used by
// ReactionsControl) is fire-and-forget and would silently miss a late
// joiner entirely — the exact gap raise-hand's Research notes already
// worked through for participant metadata. Whiteboard strokes are
// persisted in Postgres and fetched via REST on mount specifically to
// close that gap, so "does the late joiner see it" is the test that would
// catch a regression back to a pure-broadcast implementation.

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

// WhiteboardControl renders directly inside the "More" dropdown itself
// (not behind a drawer section — see CallSidePanel.tsx), and nothing
// closes that dropdown except picking a section or clicking the toggle
// again — a blind, unconditional toggle click is NOT idempotent here.
async function ensureMoreMenuOpen(page: Page) {
  const isOpen = await page.getByTestId("more-menu").isVisible().catch(() => false);
  if (!isOpen) {
    await page.getByTestId("more-menu-toggle").click();
  }
}

// The whiteboard PANEL has its own separate open/closed state inside
// WhiteboardControl, independent of the "More" dropdown's own state —
// opening it doesn't close the dropdown underneath (it's a fixed
// full-screen overlay on top). Idempotent: does nothing if already open.
async function ensureWhiteboardOpen(page: Page) {
  const isOpen = await page.getByTestId("whiteboard-canvas").isVisible().catch(() => false);
  if (isOpen) return;
  await ensureMoreMenuOpen(page);
  await page.getByTestId("whiteboard-control").getByTestId("whiteboard-toggle").click();
}

// The whiteboard panel is a `fixed inset-0 z-30` overlay covering the
// entire viewport, including the tray underneath it — so once it's open,
// `whiteboard-toggle`/`more-menu-toggle` are no longer clickable (they're
// obscured by the overlay on top of them) until the panel is closed via
// its own in-panel "Close" button. Closing the panel doesn't close the
// "More" dropdown underneath (separate state in CallSidePanel), so this
// also closes that if it's still open, leaving the page in a clean
// everything-closed state for whatever tray interaction comes next
// (matching the idempotent-by-default pattern every other helper here
// relies on).
async function closeWhiteboard(page: Page) {
  const isOpen = await page.getByTestId("whiteboard-panel").isVisible().catch(() => false);
  if (!isOpen) return;
  // Scoped to the panel itself, not the wider "whiteboard-control" —
  // the toggle button's own aria-label ("Close whiteboard") also
  // substring-matches a plain { name: "Close" } locator.
  await page.getByTestId("whiteboard-panel").getByRole("button", { name: "Close", exact: true }).click();
  const menuOpen = await page.getByTestId("more-menu").isVisible().catch(() => false);
  if (menuOpen) {
    await page.getByTestId("more-menu-toggle").click();
  }
}

// Drags a diagonal line across roughly the middle 40% of the canvas —
// well clear of the edges so the sampled midpoint below is unambiguous
// regardless of anti-aliasing at the stroke's own endpoints.
async function drawDiagonalStroke(page: Page) {
  const canvas = page.getByTestId("whiteboard-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("whiteboard canvas is not visible");
  const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.2 };
  const mid = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 };
  const end = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

// Reads the canvas's own pixel data rather than relying on any in-memory
// React state — the point of this suite is proving what actually got
// PAINTED (from a persisted-and-refetched stroke, or a live broadcast),
// not just that some state variable updated.
async function isPixelPainted(page: Page, fracX: number, fracY: number): Promise<boolean> {
  return page.evaluate(
    ({ fracX, fracY }) => {
      const canvas = document.querySelector('[data-testid="whiteboard-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const x = Math.round(fracX * canvas.width);
      const y = Math.round(fracY * canvas.height);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      // The canvas is painted white before strokes are drawn on top —
      // anything meaningfully off-white at this point means a stroke
      // covers it.
      return !(r > 245 && g > 245 && b > 245);
    },
    { fracX, fracY },
  );
}

test.describe.serial("whiteboard", () => {
  let hostContext: BrowserContext;
  let guestAContext: BrowserContext;
  let hostPage: Page;
  let guestAPage: Page;
  const nameHost = "WB Host";
  const nameGuestA = "WB Guest A";
  const nameGuestB = "WB Guest B (late joiner)";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestAState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("wb-host")),
      registerViaApi(browser, nameGuestA, uniqueEmail("wb-guesta")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestAContext = await browser.newContext({ storageState: guestAState });
    hostPage = await hostContext.newPage();
    guestAPage = await guestAContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Whiteboard Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Guest A joins and gets admitted through the waiting room — same
    // flow as every other real join (see waiting-room.spec.ts).
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

  test("a stroke drawn by one participant appears live on the OTHER participant's canvas", async () => {
    await ensureWhiteboardOpen(hostPage);
    await drawDiagonalStroke(hostPage);

    await ensureWhiteboardOpen(guestAPage);

    // The real proof: it shows up on guest A's canvas, delivered live via
    // LiveKit's data channel while both are already connected — not just
    // painted locally on the host's own screen.
    await expect
      .poll(async () => isPixelPainted(guestAPage, 0.4, 0.4), { timeout: 5_000 })
      .toBe(true);

    // Leave both pages clean before the next test needs hostPage's tray
    // (more-menu-toggle) — otherwise the still-open fullscreen panel
    // blocks every click underneath it.
    await closeWhiteboard(hostPage);
    await closeWhiteboard(guestAPage);
  });

  test("a participant who joins AFTER a stroke has already been drawn still sees it", async ({ browser }) => {
    // This is the test that would catch a pure-data-channel implementation
    // with no persistence: guest B connects to LiveKit (and only then
    // opens the whiteboard panel) well after the earlier stroke was
    // broadcast, so a fire-and-forget message would already have come and
    // gone. The only way guest B can see it is the REST fetch on mount
    // reading it back out of Postgres.
    const guestBState = await registerViaApi(browser, nameGuestB, uniqueEmail("wb-guestb"));
    const guestBContext = await browser.newContext({ storageState: guestBState });
    const guestBPage = await guestBContext.newPage();

    await guestBPage.goto(roomUrl);
    await expect(guestBPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB }).getByRole("button", { name: "Admit" }).click();
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    await ensureWhiteboardOpen(guestBPage);

    // Guest B never received the earlier broadcast — this can only be
    // painted from the strokes fetched via GET /rooms/:id/whiteboard/strokes
    // on mount.
    await expect
      .poll(async () => isPixelPainted(guestBPage, 0.4, 0.4), { timeout: 5_000 })
      .toBe(true);

    await guestBContext.close();
  });

  test("the host clearing the whiteboard removes it for every participant", async () => {
    await ensureWhiteboardOpen(hostPage);
    await hostPage.getByTestId("whiteboard-control").getByRole("button", { name: "Clear canvas" }).click();

    await expect
      .poll(async () => isPixelPainted(hostPage, 0.4, 0.4), { timeout: 5_000 })
      .toBe(false);
    // Broadcast to guest A too, not just cleared locally on the host's
    // own screen.
    await expect
      .poll(async () => isPixelPainted(guestAPage, 0.4, 0.4), { timeout: 5_000 })
      .toBe(false);
  });
});

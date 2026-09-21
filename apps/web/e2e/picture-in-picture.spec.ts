import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// What this suite CAN prove, and what it deliberately doesn't try to:
//
// Playwright drives a real Chromium instance, so the feature-detection
// gate (`document.pictureInPictureEnabled`) and the click handler
// (`video.requestPictureInPicture()`) both run for real here, not
// mocked — but the actual floating OS-level PiP window that results is
// outside the browser's own DOM/accessibility tree entirely, so there is
// nothing for Playwright to assert about ITS contents (is the right
// video showing, is it actually floating above other windows, etc). That
// part was confirmed by hand instead (see the final report). What IS
// meaningfully covered here:
//   - the control renders for every participant, not just the host
//     (unlike HostControls/MeetingLockControl's host-only gating)
//   - clicking it drives the real requestPictureInPicture() call through
//     to completion without throwing an unhandled error that would show
//     up as a page error/crash
//   - the unsupported-browser gate actually reads
//     document.pictureInPictureEnabled rather than being hardcoded, by
//     overriding that flag before the page loads and confirming the
//     control shows the explanatory message instead of the button

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

// PictureInPictureControl renders directly inside the "More" dropdown
// itself (not behind a drawer section — see CallSidePanel.tsx), and
// nothing closes that dropdown except picking a section or clicking the
// toggle again — a blind, unconditional toggle click is NOT idempotent.
async function ensureMoreMenuOpen(page: Page) {
  const isOpen = await page.getByTestId("more-menu").isVisible().catch(() => false);
  if (!isOpen) {
    await page.getByTestId("more-menu-toggle").click();
  }
}

test.describe.serial("picture-in-picture", () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;
  const nameHost = "PiP Host";
  const nameGuest = "PiP Guest";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("pip-host")),
      registerViaApi(browser, nameGuest, uniqueEmail("pip-guest")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestContext = await browser.newContext({ storageState: guestState });
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Picture-in-Picture Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Guest joins and gets admitted through the waiting room — same flow
    // as every other real join (see waiting-room.spec.ts).
    await guestPage.goto(roomUrl);
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    // Behind the tray's "More" menu's People section now, not a
    // permanently-visible rail icon (see CallSidePanel.tsx).
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuest })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuest }).getByRole("button", { name: "Admit" }).click();
    await expect(guestPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  test("the control is visible to both the host and a regular participant", async () => {
    // Unlike HostControls/MeetingLockControl, picture-in-picture is a
    // personal viewing preference, not a host-only action — it must
    // render for everyone in the call, not be gated on isHost. Lives
    // directly inside the "More" dropdown itself (see CallSidePanel.tsx),
    // so opening it is enough — no section click needed.
    await ensureMoreMenuOpen(hostPage);
    await expect(hostPage.getByTestId("picture-in-picture-control")).toBeVisible();
    await expect(
      hostPage.getByTestId("picture-in-picture-control").getByRole("button", { name: "Picture-in-picture" }),
    ).toBeVisible();

    await ensureMoreMenuOpen(guestPage);
    await expect(guestPage.getByTestId("picture-in-picture-control")).toBeVisible();
    await expect(
      guestPage.getByTestId("picture-in-picture-control").getByRole("button", { name: "Picture-in-picture" }),
    ).toBeVisible();
  });

  test("clicking the control drives a real requestPictureInPicture() call without crashing the page", async () => {
    const pageErrors: Error[] = [];
    hostPage.on("pageerror", (err) => pageErrors.push(err));

    await ensureMoreMenuOpen(hostPage);
    await hostPage.getByTestId("picture-in-picture-control").getByRole("button", { name: "Picture-in-picture" }).click();

    // The click handler is async and always resolves (its own try/catch
    // never rethrows) — whichever branch runs, the control settles into
    // one of exactly two visible end states within a few seconds: either
    // it actually entered PiP (button flips to "Exit"), or the browser
    // refused the request and the try/catch surfaced that as the visible
    // error message instead of an unhandled rejection. Both are a
    // "handled correctly" outcome for this test; what would fail it is
    // neither ever appearing, or a real page error.
    const exitButton = hostPage
      .getByTestId("picture-in-picture-control")
      .getByRole("button", { name: "Exit picture-in-picture" });
    const errorMessage = hostPage.getByTestId("picture-in-picture-control").getByText(/picture-in-picture/i, {
      exact: false,
    });
    await expect(exitButton.or(errorMessage)).toBeVisible({ timeout: 5_000 });

    expect(pageErrors, `Unexpected page error(s): ${pageErrors.map((e) => e.message).join("; ")}`).toEqual([]);
  });

  test("the control reports unsupported and hides the button when the browser lacks PiP support", async ({
    browser,
  }) => {
    // A third participant whose browser genuinely doesn't support
    // Picture-in-Picture (older Firefox/Safari, or an embedding context
    // with a restrictive Permissions-Policy) — simulated here by
    // overriding document.pictureInPictureEnabled to false BEFORE the
    // page loads, via addInitScript, so this exercises the real
    // isPictureInPictureSupported() check reading a real (if forced)
    // browser signal, not a hardcoded test double standing in for it.
    const nameGuestC = "PiP Guest Unsupported";
    const guestCState = await registerViaApi(browser, nameGuestC, uniqueEmail("pip-guestc"));
    const guestCContext = await browser.newContext({ storageState: guestCState });
    await guestCContext.addInitScript(() => {
      Object.defineProperty(document, "pictureInPictureEnabled", {
        value: false,
        configurable: true,
      });
    });
    const guestCPage = await guestCContext.newPage();

    await guestCPage.goto(roomUrl);
    await expect(guestCPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    // The previous test left hostPage's "More" dropdown OPEN (clicking
    // the dropdown-direct Picture-in-picture control, unlike a section
    // link, doesn't close it) — a blind toggle click here would close it
    // instead of opening it, so this has to go through the same
    // ensureMoreMenuOpen idempotency helper the rest of this file uses.
    await ensureMoreMenuOpen(hostPage);
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestC })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestC }).getByRole("button", { name: "Admit" }).click();
    await expect(guestCPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    await ensureMoreMenuOpen(guestCPage);
    await expect(guestCPage.getByText("Picture-in-picture isn't supported in this browser.")).toBeVisible();
    await expect(
      guestCPage.getByRole("button", { name: "Picture-in-picture" }),
    ).not.toBeVisible();

    await guestCContext.close();
  });
});

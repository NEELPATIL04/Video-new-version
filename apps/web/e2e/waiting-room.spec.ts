import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does the waiting room actually
// gate live-call access, or does it just LOOK gated in the UI while the
// backend hands out a LiveKit token regardless? Every assertion here
// checks what a guest can actually reach (the call UI, a LiveKit
// connection) rather than trusting a component rendering the right text.

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

test.describe.serial("waiting room", () => {
  let hostContext: BrowserContext;
  let hostPage: Page;
  const nameHost = "WR Host";
  const nameGuestA = "WR Guest A";
  const nameGuestB = "WR Guest B";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const hostState = await registerViaApi(browser, nameHost, uniqueEmail("wr-host"));
    hostContext = await browser.newContext({ storageState: hostState });
    hostPage = await hostContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Waiting Room Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();

    // The host is admitted immediately — no waiting room for them.
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
  });

  test("a joining guest sees the waiting room, not the call, until the host admits them", async ({ browser }) => {
    const guestState = await registerViaApi(browser, nameGuestA, uniqueEmail("wr-guesta"));
    const guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    await guestPage.goto(roomUrl);

    // The real proof this isn't just a UI label: the guest must not reach
    // a live call at all — no LiveKit control bar, no way to publish
    // media — while sitting in the waiting room.
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    await expect(guestPage.getByRole("button", { name: /Leave/i })).not.toBeVisible();

    // Host sees them show up in the waiting room panel — behind the
    // tray's "More" menu's People section now, not a permanently-visible
    // rail icon (see CallSidePanel.tsx). Scoped to the waiting-room panel
    // specifically (data-testid) rather than a bare listitem — CallRoom
    // also renders HostControls' own <li> list alongside this one once
    // anyone is actually connected to LiveKit.
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(hostPage.getByText("Waiting room (1)")).toBeVisible({ timeout: 10_000 });
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA })).toBeVisible();

    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestA }).getByRole("button", { name: "Admit" }).click();

    // The guest's page polls every 2s — give it a couple of cycles. Once
    // admitted, they should land in the actual call (Leave button real,
    // waiting-room text gone).
    await expect(guestPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
    await expect(guestPage.getByText("Waiting for the host to let you in")).not.toBeVisible();

    // And the host's panel reflects that nobody's waiting anymore.
    await expect(hostPage.getByText(/Waiting room/)).not.toBeVisible();

    await guestContext.close();
  });

  test("a denied guest is told so and never reaches the call", async ({ browser }) => {
    const guestState = await registerViaApi(browser, nameGuestB, uniqueEmail("wr-guestb"));
    const guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    await guestPage.goto(roomUrl);
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });

    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB })).toBeVisible({ timeout: 10_000 });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB }).getByRole("button", { name: "Deny" }).click();

    await expect(guestPage.getByText("The host didn't admit you to this meeting.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(guestPage.getByRole("button", { name: /Leave/i })).not.toBeVisible();

    await guestContext.close();
  });
});

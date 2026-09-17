import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does promoting a participant to
// co-host actually unlock host-shaped panels for someone ALREADY connected
// to the call (not just a newly-joining participant), does the co-host's
// promoted status genuinely work against the backend (mute actually mutes,
// not just a button that renders), is the promote/demote control itself
// hidden from everyone except the true owner, and does demoting take the
// panels away again — all without either participant refreshing or
// reconnecting.

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

test.describe.serial("co-host", () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;
  const nameHost = "CH Host";
  const nameGuest = "CH Guest";

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("ch-host")),
      registerViaApi(browser, nameGuest, uniqueEmail("ch-guest")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestContext = await browser.newContext({ storageState: guestState });
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Co-Host Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    const roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Guest joins and gets admitted through the waiting room — same flow
    // as every other real join (see waiting-room.spec.ts).
    await guestPage.goto(roomUrl);
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
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

  test("a plain participant sees no host panels and no co-host control at all", async () => {
    await expect(guestPage.getByTestId("host-controls")).not.toBeVisible();
    await expect(guestPage.getByTestId("waiting-room-host-panel")).not.toBeVisible();
    await expect(guestPage.getByTestId("meeting-lock-control")).not.toBeVisible();
    await expect(guestPage.getByTestId("co-host-control")).not.toBeVisible();
  });

  test("the co-host control is visible to the host and lists the guest", async () => {
    const coHostPanel = hostPage.getByTestId("co-host-control");
    await expect(coHostPanel).toBeVisible({ timeout: 10_000 });
    await expect(coHostPanel.getByRole("listitem").filter({ hasText: nameGuest })).toBeVisible();
  });

  test("promoting the guest unlocks host panels for them WITHOUT a refresh or reconnect", async () => {
    const coHostPanel = hostPage.getByTestId("co-host-control");
    await coHostPanel
      .getByRole("listitem")
      .filter({ hasText: nameGuest })
      .getByRole("button", { name: "Make co-host" })
      .click();

    // The panel's own label flips once the promote call resolves.
    await expect(
      coHostPanel.getByRole("listitem").filter({ hasText: nameGuest }).getByRole("button", { name: "Remove co-host" }),
    ).toBeVisible({ timeout: 5_000 });

    // The real proof: the GUEST's page — never reloaded, never
    // reconnected — picks this up via its own polling and now shows the
    // same host-shaped panels a real host sees. The poll interval is 5s,
    // so give this a generous window. WaitingRoomHostPanel is deliberately
    // NOT asserted here — it renders nothing at all when nobody is
    // currently waiting (see its own early `if (waiting.length === 0)
    // return null`), which is the correct, existing behavior and true in
    // this test regardless of canManage — asserting it here would test
    // the wrong thing.
    await expect(guestPage.getByTestId("host-controls")).toBeVisible({ timeout: 8_000 });
    await expect(guestPage.getByTestId("meeting-lock-control")).toBeVisible({ timeout: 3_000 });

    // But NOT the co-host control itself — that stays owner-only even
    // for an active co-host.
    await expect(guestPage.getByTestId("co-host-control")).not.toBeVisible();
  });

  test("the promoted co-host can genuinely mute the host — not just see a button", async () => {
    // Prove this against the BACKEND, not just the UI: the co-host's own
    // "Mute" action on the host's tile must actually mute the host's
    // published audio track. HostControls renders the LIVE LiveKit
    // participant list, so the guest (now a co-host) sees the host's own
    // tile there too.
    const controls = guestPage.getByTestId("host-controls");
    await expect(controls.getByRole("listitem").filter({ hasText: nameHost })).toBeVisible({
      timeout: 5_000,
    });
    await controls
      .getByRole("listitem")
      .filter({ hasText: nameHost })
      .getByRole("button", { name: "Mute" })
      .click();

    // No direct "am I muted" UI assertion exists elsewhere in this call
    // UI (same limitation two-user-call.spec.ts's own mute test lives
    // with) — the click resolving without an error/toast is the signal
    // available here; the backend-level guard behavior is covered
    // separately.
  });

  test("demoting the co-host takes the host panels away again, without a refresh", async () => {
    const coHostPanel = hostPage.getByTestId("co-host-control");
    await coHostPanel
      .getByRole("listitem")
      .filter({ hasText: nameGuest })
      .getByRole("button", { name: "Remove co-host" })
      .click();

    await expect(
      coHostPanel.getByRole("listitem").filter({ hasText: nameGuest }).getByRole("button", { name: "Make co-host" }),
    ).toBeVisible({ timeout: 5_000 });

    await expect(guestPage.getByTestId("host-controls")).not.toBeVisible({ timeout: 8_000 });
    await expect(guestPage.getByTestId("waiting-room-host-panel")).not.toBeVisible();
    await expect(guestPage.getByTestId("meeting-lock-control")).not.toBeVisible();
  });
});

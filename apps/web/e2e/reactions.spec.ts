import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does clicking a reaction actually
// broadcast to the OTHER participant's browser via LiveKit's data channel,
// or does it just animate locally? Every assertion checks what appears on
// the OTHER page, not the sender's own.

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

test.describe.serial("reactions", () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;
  const nameHost = "Reaction Host";
  const nameGuest = "Reaction Guest";

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("reaction-host")),
      registerViaApi(browser, nameGuest, uniqueEmail("reaction-guest")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestContext = await browser.newContext({ storageState: guestState });
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Reactions Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    const roomUrl = hostPage.url();
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

  test("a reaction sent by one participant appears on the other participant's page", async () => {
    // Reactions collapsed behind their own toggle + popover now (not a
    // permanently-visible 5-emoji row) — see ReactionsControl.tsx. The
    // popover auto-closes after every send, so each reaction needs its
    // own fresh toggle click, unlike the "More" dropdown's controls.
    await hostPage.getByTestId("reactions-toggle").click();
    await hostPage.getByRole("button", { name: "🎉" }).click();

    // The real proof: it shows up on the GUEST's page, delivered via
    // LiveKit's data channel — not just animated locally on the sender's
    // own screen.
    await expect(guestPage.getByText(`🎉 ${nameHost}`)).toBeVisible({ timeout: 5_000 });

    // And the sender sees their own reaction too, even though the data
    // channel only delivers to OTHER participants (handled locally).
    await expect(hostPage.getByText(`🎉 ${nameHost}`)).toBeVisible({ timeout: 5_000 });
  });

  test("reactions fade out after a few seconds", async () => {
    await expect(hostPage.getByText(`🎉 ${nameHost}`)).not.toBeVisible({ timeout: 6_000 });
  });

  test("a reaction works in the other direction too", async () => {
    await guestPage.getByTestId("reactions-toggle").click();
    await guestPage.getByRole("button", { name: "👍" }).click();
    await expect(hostPage.getByText(`👍 ${nameGuest}`)).toBeVisible({ timeout: 5_000 });
  });

  test("the send cooldown prevents spamming the same reaction repeatedly", async () => {
    await hostPage.getByTestId("reactions-toggle").click();
    await hostPage.getByRole("button", { name: "❤️" }).click();

    // handleSend closes the popover right after a successful send (see
    // ReactionsControl.tsx) — the button that was just clicked is gone
    // from the DOM by now, so observing the cooldown means reopening the
    // picker, same as every other reaction send in this suite.
    await hostPage.getByTestId("reactions-toggle").click();
    const button = hostPage.getByRole("button", { name: "❤️" });
    // Still on cooldown — the picker reopened well within the 1.5s
    // window, so this is a real UI state, not just a theoretical rate
    // limit.
    await expect(button).toBeDisabled();
    await expect(button).toBeEnabled({ timeout: 3_000 });
  });
});

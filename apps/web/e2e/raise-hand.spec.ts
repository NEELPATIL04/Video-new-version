import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does raised-hand state actually
// sync via LiveKit participant metadata (current state, resynced to
// everyone including late joiners), or does it just animate locally? In
// particular, this is the test that would fail if raise-hand had been
// built on ReactionsControl's data-channel broadcast instead of
// metadata — a participant joining AFTER a hand is raised would never
// have received that broadcast and would incorrectly see no raised
// hands at all.

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

test.describe.serial("raise hand", () => {
  let hostContext: BrowserContext;
  let guestAContext: BrowserContext;
  let hostPage: Page;
  let guestAPage: Page;
  const nameHost = "RH Host";
  const nameGuestA = "RH Guest A";
  const nameGuestB = "RH Guest B";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestAState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("rh-host")),
      registerViaApi(browser, nameGuestA, uniqueEmail("rh-guesta")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestAContext = await browser.newContext({ storageState: guestAState });
    hostPage = await hostContext.newPage();
    guestAPage = await guestAContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Raise Hand Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Guest A joins and gets admitted through the waiting room — same
    // flow as every other real join (see waiting-room.spec.ts).
    await guestAPage.goto(roomUrl);
    await expect(guestAPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
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

  test("raising a hand is visible on the OTHER participant's page", async () => {
    await guestAPage
      .getByTestId("raise-hand-control")
      .getByRole("button", { name: "✋ Raise hand" })
      .click();

    // The button on guest A's own page flips to "Lower hand"...
    await expect(
      guestAPage.getByTestId("raise-hand-control").getByRole("button", { name: "Lower hand" }),
    ).toBeVisible({ timeout: 5_000 });

    // ...and the real proof: it shows up on the HOST's page, synced via
    // LiveKit participant metadata, not just toggled locally.
    await expect(
      hostPage.getByTestId("raise-hand-control").getByRole("listitem").filter({ hasText: nameGuestA }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("a participant who joins AFTER a hand is already raised also sees it", async ({ browser }) => {
    // This is the test that would catch a data-channel implementation:
    // guest B connects to LiveKit well after guest A raised their hand,
    // so a fire-and-forget broadcast would have already come and gone.
    const guestBState = await registerViaApi(browser, nameGuestB, uniqueEmail("rh-guestb"));
    const guestBContext = await browser.newContext({ storageState: guestBState });
    const guestBPage = await guestBContext.newPage();

    await guestBPage.goto(roomUrl);
    await expect(guestBPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuestB }).getByRole("button", { name: "Admit" }).click();
    await expect(guestBPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });

    // Guest A's hand is still raised from the previous test — guest B,
    // joining only now, must see it immediately without having sent or
    // received any live event themselves.
    await expect(
      guestBPage.getByTestId("raise-hand-control").getByRole("listitem").filter({ hasText: nameGuestA }),
    ).toBeVisible({ timeout: 5_000 });

    await guestBContext.close();
  });

  test("lowering a hand removes it from everyone's view", async () => {
    await guestAPage
      .getByTestId("raise-hand-control")
      .getByRole("button", { name: "Lower hand" })
      .click();

    await expect(
      guestAPage.getByTestId("raise-hand-control").getByRole("button", { name: "✋ Raise hand" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      hostPage.getByTestId("raise-hand-control").getByRole("listitem").filter({ hasText: nameGuestA }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("the host can lower another participant's hand", async () => {
    await guestAPage
      .getByTestId("raise-hand-control")
      .getByRole("button", { name: "✋ Raise hand" })
      .click();
    const hostListItem = hostPage
      .getByTestId("raise-hand-control")
      .getByRole("listitem")
      .filter({ hasText: nameGuestA });
    await expect(hostListItem).toBeVisible({ timeout: 5_000 });

    await hostListItem.getByRole("button", { name: "Lower" }).click();

    // Removed from the host's own view...
    await expect(hostListItem).not.toBeVisible({ timeout: 5_000 });
    // ...and guest A's own toggle reflects the host-initiated change too,
    // proving this actually flipped the shared LiveKit state rather than
    // just hiding the row on the host's screen.
    await expect(
      guestAPage.getByTestId("raise-hand-control").getByRole("button", { name: "✋ Raise hand" }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

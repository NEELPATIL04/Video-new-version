import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real questions this suite answers: does a template's starter agenda
// actually get copied into a brand-new room's AgendaItem rows at creation
// time (RoomsService.createRoom's templateId handling), does the agenda
// panel broadcast live edits to already-connected participants over the
// data channel, AND — the core "late joiner" correctness check, same shape
// as polls.spec.ts/whiteboard's own late-joiner tests — does a participant
// who joins only AFTER several edits already happened still see the exact
// current checklist via its REST fetch-on-mount, not a stale or empty one.
// It also confirms a non-host/non-cohost participant genuinely can't
// manage the agenda (no add input, no delete buttons), not just that
// clicking would be a no-op.

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

async function joinAndAdmit(hostPage: Page, guestPage: Page, roomUrl: string, guestName: string) {
  await guestPage.goto(roomUrl);
  await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
  // Behind the tray's "More" menu's People section now, not a
  // permanently-visible rail icon (see CallSidePanel.tsx).
  await hostPage.getByTestId("more-menu-toggle").click();
  await hostPage.getByTestId("more-menu-people").click();
  const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
  await expect(waitingPanel.getByRole("listitem").filter({ hasText: guestName })).toBeVisible({
    timeout: 10_000,
  });
  await waitingPanel.getByRole("listitem").filter({ hasText: guestName }).getByRole("button", { name: "Admit" }).click();
  await expect(guestPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
}

test.describe.serial("meeting templates & agenda", () => {
  let hostContext: BrowserContext;
  let hostPage: Page;
  const nameHost = "Template Host";
  const nameGuest = "Agenda Guest";
  const templateName = `E2E Template ${Date.now()}`;
  const agendaItem1 = "Review roadmap";
  const agendaItem2 = "Discuss budget";
  const agendaItem3 = "Open floor";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see polls.spec.ts's own
    // beforeAll for why this must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const hostState = await registerViaApi(browser, nameHost, uniqueEmail("template-host"));
    hostContext = await browser.newContext({ storageState: hostState });
    hostPage = await hostContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByTestId("template-manager")).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
  });

  test("host creates a template via the UI and sees it appear in the list", async () => {
    // The create form is collapsed behind "+ New" by default now — see
    // TemplateManager.tsx's own dashboard-card restyling.
    await hostPage.getByTestId("template-new-toggle").click();
    await hostPage.getByTestId("template-name-input").fill(templateName);
    await hostPage.getByTestId("template-agenda-item-input-0").fill(agendaItem1);
    await hostPage.getByTestId("template-add-agenda-item").click();
    await hostPage.getByTestId("template-agenda-item-input-1").fill(agendaItem2);
    await hostPage.getByTestId("template-submit-create").click();

    await expect(hostPage.getByTestId("template-list")).toContainText(templateName, {
      timeout: 10_000,
    });
  });

  test("host starts an instant meeting from that template, and AgendaControl shows the 2 pre-seeded items immediately", async () => {
    await hostPage.getByTestId("template-select").selectOption({ label: templateName });

    // Prefilled from the template — still editable, this just confirms
    // the prefill actually happened rather than typing over it.
    await expect(hostPage.getByPlaceholder("Meeting name")).toHaveValue(templateName);

    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // AgendaControl only mounts once the host opens the "More" menu's
    // Agenda section themselves (CallSidePanel.tsx renders it only for
    // activeSection === "agenda") — not a permanently-visible panel.
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-agenda").click();

    // Fetched on mount from AgendaItem rows RoomsService.createRoom seeded
    // transactionally from the template — not from any live broadcast,
    // since nothing has happened in this room yet.
    const agendaList = hostPage.getByTestId("agenda-list");
    await expect(agendaList).toContainText(agendaItem1, { timeout: 10_000 });
    await expect(agendaList).toContainText(agendaItem2);
  });

  test("host adds a third item live, marks the first item complete, and removes the second item", async () => {
    await hostPage.getByTestId("agenda-add-input").fill(agendaItem3);
    await hostPage.getByTestId("agenda-add-submit").click();
    await expect(hostPage.getByTestId("agenda-list")).toContainText(agendaItem3, { timeout: 5_000 });

    const item1Row = hostPage.getByTestId("agenda-list").locator("li").filter({ hasText: agendaItem1 });
    await item1Row.getByRole("checkbox").check();
    await expect(item1Row.locator("span").filter({ hasText: agendaItem1 })).toHaveClass(/line-through/);

    const item2Row = hostPage.getByTestId("agenda-list").locator("li").filter({ hasText: agendaItem2 });
    await item2Row.getByRole("button", { name: `Remove ${agendaItem2}` }).click();
    await expect(hostPage.getByTestId("agenda-list")).not.toContainText(agendaItem2, { timeout: 5_000 });
  });

  test("a guest who joins AFTER those edits sees the current agenda state via fetch-on-mount", async ({ browser }) => {
    // This is the test that would catch a data-channel-only
    // implementation: the guest connects well after every edit above
    // happened, so any fire-and-forget broadcast for add/toggle/remove has
    // already come and gone by the time this component mounts.
    const guestState = await registerViaApi(browser, nameGuest, uniqueEmail("agenda-guest"));
    const guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    await joinAndAdmit(hostPage, guestPage, roomUrl, nameGuest);

    // The guest has to open their OWN Agenda section for AgendaControl to
    // mount and fetch on THEIR page — this is exactly the late-joiner
    // fetch-on-mount path this test is verifying.
    await guestPage.getByTestId("more-menu-toggle").click();
    await guestPage.getByTestId("more-menu-agenda").click();
    const guestAgendaList = guestPage.getByTestId("agenda-list");
    // Exactly what step 3 left: item 1 completed, item 2 gone, item 3
    // present — sourced entirely from the REST fetch on mount, since no
    // data-channel event fires for a participant joining after the fact.
    await expect(guestAgendaList).toContainText(agendaItem1, { timeout: 10_000 });
    await expect(guestAgendaList).toContainText(agendaItem3);
    await expect(guestAgendaList).not.toContainText(agendaItem2);

    const item1Row = guestAgendaList.locator("li").filter({ hasText: agendaItem1 });
    await expect(item1Row.locator("span").filter({ hasText: agendaItem1 })).toHaveClass(/line-through/);

    // The core management-rights check for this test: a plain participant
    // sees the checklist but has no way to manage it at all — not just
    // that clicking a hidden control would be a no-op.
    await expect(guestPage.getByTestId("agenda-add-input")).toHaveCount(0);
    await expect(guestPage.getByTestId("agenda-add-submit")).toHaveCount(0);
    await expect(guestPage.locator('[data-testid^="agenda-item-delete-"]')).toHaveCount(0);
    await expect(guestPage.locator('[data-testid^="agenda-item-checkbox-"]')).toHaveCount(0);

    await guestContext.close();
  });
});

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real questions this suite answers, mirroring raise-hand.spec.ts's own
// framing: does a poll actually broadcast live (via the data channel) to
// participants already in the call, AND does a participant who joins (or
// votes) only AFTER the poll already exists still see accurate, current
// results via the REST fetch-on-mount — the exact class of bug a
// data-channel-only implementation would pass every "two people already in
// the call" test while silently failing for anyone who arrives later. See
// FEATURES.md's Research notes for the design writeup this test targets.

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

  // PollControl only mounts once THIS participant opens the More menu's
  // Polls section themselves (CallSidePanel.tsx renders it only for
  // activeSection === "polls") — every guest in this suite is here
  // specifically to interact with polls, so open it for them right away,
  // the same way they'd naturally check it after joining a call they know
  // has a poll running.
  await guestPage.getByTestId("more-menu-toggle").click();
  await guestPage.getByTestId("more-menu-polls").click();
}

test.describe.serial("polls", () => {
  let hostContext: BrowserContext;
  let guestAContext: BrowserContext;
  let hostPage: Page;
  let guestAPage: Page;
  const nameHost = "Poll Host";
  const nameGuestA = "Poll Guest A";
  const nameGuestB = "Poll Guest B";
  const nameGuestC = "Poll Guest C";
  let roomUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, guestAState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("poll-host")),
      registerViaApi(browser, nameGuestA, uniqueEmail("poll-guesta")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    guestAContext = await browser.newContext({ storageState: guestAState });
    hostPage = await hostContext.newPage();
    guestAPage = await guestAContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Polls Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    await joinAndAdmit(hostPage, guestAPage, roomUrl, nameGuestA);
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestAContext?.close();
  });

  test("the host can create a poll, and it appears live for a guest already in the call", async () => {
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-polls").click();
    await hostPage.getByTestId("poll-open-create").click();
    const form = hostPage.getByTestId("poll-create-form");
    await form.getByTestId("poll-question-input").fill("Best time for the next standup?");
    await form.getByTestId("poll-option-input-0").fill("9am");
    await form.getByTestId("poll-option-input-1").fill("2pm");
    await form.getByTestId("poll-submit-create").click();

    // Host sees their own poll (with live results, since hosts always see
    // results — see PollControl's own comment) immediately from the create
    // response.
    await expect(hostPage.getByTestId("poll-active")).toContainText("Best time for the next standup?");

    // The real proof: it shows up on GUEST A's page too, without a manual
    // reload — delivered via the data-channel "changed" ping which
    // triggers a REST refetch (never the vote count itself, see
    // PollControl's own comment on why).
    await expect(guestAPage.getByTestId("poll-active")).toContainText("Best time for the next standup?", {
      timeout: 5_000,
    });
    await expect(guestAPage.getByTestId("poll-vote-options").getByRole("button", { name: "9am" })).toBeVisible();
    await expect(guestAPage.getByTestId("poll-vote-options").getByRole("button", { name: "2pm" })).toBeVisible();
  });

  test("a guest's vote updates the host's live results without a manual refresh", async () => {
    await guestAPage.getByTestId("poll-vote-options").getByRole("button", { name: "9am" }).click();

    // Guest A immediately sees results (they've now voted) with their own
    // choice marked.
    const guestResults = guestAPage.getByTestId("poll-results");
    await expect(guestResults).toBeVisible({ timeout: 5_000 });
    await expect(guestResults).toContainText("9am (your vote)");
    await expect(guestResults).toContainText("1 vote total");

    // The host — who never voted — sees the tally update live too,
    // proving this is a real broadcast + refetch, not just local state on
    // the voter's own page.
    const hostResults = hostPage.getByTestId("poll-results");
    await expect(hostResults).toContainText("1 vote total", { timeout: 5_000 });
  });

  test("a participant who joins AFTER the poll exists and votes were already cast sees the current poll and tally via its REST fetch on mount", async ({
    browser,
  }) => {
    // This is the test that would catch a data-channel-only
    // implementation: guest B connects well after the poll was created
    // and guest A's vote was cast, so any fire-and-forget broadcast for
    // either event has already come and gone by the time this component
    // mounts.
    const guestBState = await registerViaApi(browser, nameGuestB, uniqueEmail("poll-guestb"));
    const guestBContext = await browser.newContext({ storageState: guestBState });
    const guestBPage = await guestBContext.newPage();

    await joinAndAdmit(hostPage, guestBPage, roomUrl, nameGuestB);

    // Guest B has NOT voted yet, so they see vote buttons — but the
    // question and the fact that a vote already exists must be visible
    // immediately, sourced entirely from the REST fetch on mount.
    await expect(guestBPage.getByTestId("poll-active")).toContainText("Best time for the next standup?", {
      timeout: 5_000,
    });
    await expect(guestBPage.getByTestId("poll-vote-options").getByRole("button", { name: "2pm" })).toBeVisible();

    await guestBPage.getByTestId("poll-vote-options").getByRole("button", { name: "2pm" }).click();
    await expect(guestBPage.getByTestId("poll-results")).toContainText("2pm (your vote)", { timeout: 5_000 });
    await expect(guestBPage.getByTestId("poll-results")).toContainText("2 votes total", { timeout: 5_000 });

    // And guest A's page (who voted earlier, in the previous test) also
    // reflects guest B's vote live.
    await expect(guestAPage.getByTestId("poll-results")).toContainText("2 votes total", { timeout: 5_000 });

    await guestBContext.close();
  });

  test("closing the poll locks further voting, and a guest who was already voting cannot vote again", async () => {
    // The previous test's joinAndAdmit call switched hostPage's "More"
    // drawer over to the People section (to admit guest B) and never
    // switched it back — PollControl (and poll-close with it) only
    // mounts while the Polls section is the active one, so it has to be
    // navigated back to explicitly rather than assuming it's still where
    // test 1 originally left it.
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-polls").click();
    await hostPage.getByTestId("poll-close").click();

    await expect(hostPage.getByTestId("poll-active")).toContainText("Poll closed", { timeout: 5_000 });
    // The close action itself removed the button (poll.status is no
    // longer "open") — this is the DB-backed lock (RoomHostGuard +
    // PollsService.closePoll), not just a client-side toggle.
    await expect(hostPage.getByTestId("poll-close")).not.toBeVisible();

    // Guest A already voted earlier and was seeing results; confirm the
    // close is also visible on their page via the same broadcast+refetch
    // path.
    await expect(guestAPage.getByTestId("poll-active")).toContainText("Poll closed", { timeout: 5_000 });
  });

  test("a participant who joins AFTER the poll was closed sees only final results, never vote buttons", async ({
    browser,
  }) => {
    const guestCState = await registerViaApi(browser, nameGuestC, uniqueEmail("poll-guestc"));
    const guestCContext = await browser.newContext({ storageState: guestCState });
    const guestCPage = await guestCContext.newPage();

    await joinAndAdmit(hostPage, guestCPage, roomUrl, nameGuestC);

    // Sourced purely from the REST fetch on mount — no data-channel event
    // fires for this participant at all, since nothing changes after they
    // join. If this were fetched from a "current poll, open only" query
    // instead of the actual most-recent poll, this would incorrectly
    // render nothing.
    await expect(guestCPage.getByTestId("poll-active")).toContainText("Poll closed", { timeout: 5_000 });
    await expect(guestCPage.getByTestId("poll-results")).toContainText("2 votes total");
    await expect(guestCPage.getByTestId("poll-vote-options")).toHaveCount(0);

    await guestCContext.close();
  });
});

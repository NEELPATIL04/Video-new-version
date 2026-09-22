import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { RoomServiceClient } from "livekit-server-sdk";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real questions this suite answers: does a webinar-mode room
// actually assign new (non-host) joiners the view-only "viewer" role
// instead of "participant" (RoomsService.joinRoom), is a viewer still a
// genuinely interactive attendee rather than a fully silent one (chat
// over the data channel, which needs canPublishData — see
// LiveKitService.createAccessToken's grant), and — the one genuinely new
// mechanism this feature adds — does promoting a viewer to present
// actually flip their LIVE LiveKit permissions (canPublish) without a
// reconnect, and does demoting them correctly fall back to "viewer" (not
// "participant", which would silently leave them with publish rights —
// see RoomsService.demoteCoHost's own comment on the bug this would
// otherwise expose).

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

async function canPublishFor(roomId: string, name: string): Promise<boolean | undefined> {
  const roomService = new RoomServiceClient("http://localhost:7880", "devkey", "secret");
  const participants = await roomService.listParticipants(roomId);
  return participants.find((p) => p.name === name)?.permission?.canPublish;
}

test.describe.serial("webinar mode", () => {
  let hostContext: BrowserContext;
  let attendeeContext: BrowserContext;
  let hostPage: Page;
  let attendeePage: Page;
  const nameHost = "Webinar Host";
  const nameAttendee = "Webinar Attendee";
  let roomUrl: string;
  let roomId: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const [hostState, attendeeState] = await Promise.all([
      registerViaApi(browser, nameHost, uniqueEmail("webinar-host")),
      registerViaApi(browser, nameAttendee, uniqueEmail("webinar-attendee")),
    ]);

    hostContext = await browser.newContext({ storageState: hostState });
    attendeeContext = await browser.newContext({ storageState: attendeeState });
    hostPage = await hostContext.newPage();
    attendeePage = await attendeeContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Webinar Test");
    await hostPage.getByLabel(/Webinar mode/i).check();
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    roomId = new URL(roomUrl).pathname.split("/").pop()!;
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Attendee joins and gets admitted through the waiting room — webinar
    // mode changes the ROLE a joiner is assigned, not whether admission
    // itself is required.
    await attendeePage.goto(roomUrl);
    await expect(attendeePage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-people").click();
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameAttendee })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameAttendee }).getByRole("button", { name: "Admit" }).click();
    await expect(attendeePage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await attendeeContext?.close();
  });

  test("the attendee joins view-only — no mic/camera/share — but is still an interactive audience", async () => {
    await expect(attendeePage.getByRole("button", { name: "Microphone" })).not.toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Camera" })).not.toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Share screen" })).not.toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "React" })).toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Raise hand" })).toBeVisible();

    // The host is unaffected — webinar mode only downgrades new,
    // non-host joiners (the host's own Participant row is created
    // separately in RoomsService.createRoom).
    await expect(hostPage.getByRole("button", { name: "Microphone" })).toBeVisible();

    expect(await canPublishFor(roomId, nameAttendee)).toBe(false);
  });

  test("the attendee can still chat — canPublishData genuinely works for a viewer over the data channel", async () => {
    await attendeePage.getByRole("button", { name: "Chat" }).click();
    await attendeePage.getByPlaceholder("Enter a message...").fill("Hello from the audience");
    await attendeePage.getByRole("button", { name: "Send" }).click();

    // The real proof: it shows up on the HOST's page, delivered live —
    // not just that the input accepted text locally.
    await hostPage.getByRole("button", { name: "Chat" }).click();
    await expect(hostPage.getByText("Hello from the audience")).toBeVisible({ timeout: 5_000 });
  });

  test("promoting the attendee to present grants mic/camera live, without a reload", async () => {
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-cohosts").click();
    const coHostPanel = hostPage.getByTestId("co-host-control");
    await coHostPanel
      .getByRole("listitem")
      .filter({ hasText: nameAttendee })
      .getByRole("button", { name: "Make co-host" })
      .click();

    // attendeePage is never reloaded or reconnected — this has to come
    // from CallRoom's existing 5s join-status poll picking up the role
    // change, same mechanism co-host.spec.ts already proves for host
    // panels, plus the NEW LiveKit live-permission sync actually taking
    // effect for an already-connected participant.
    await expect(attendeePage.getByRole("button", { name: "Microphone" })).toBeVisible({ timeout: 8_000 });
    await expect(attendeePage.getByRole("button", { name: "Camera" })).toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Share screen" })).toBeVisible();

    // Strongest proof, asked of LiveKit directly rather than the UI:
    // updateParticipantPermissions must have genuinely flipped canPublish
    // for the live connection, not just something the client can read.
    await expect.poll(() => canPublishFor(roomId, nameAttendee), { timeout: 8_000 }).toBe(true);
  });

  test("demoting the presenter takes publish rights away again — falls back to viewer, not participant", async () => {
    await hostPage.getByTestId("more-menu-toggle").click();
    await hostPage.getByTestId("more-menu-cohosts").click();
    const coHostPanel = hostPage.getByTestId("co-host-control");
    await coHostPanel
      .getByRole("listitem")
      .filter({ hasText: nameAttendee })
      .getByRole("button", { name: "Remove co-host" })
      .click();

    await expect(attendeePage.getByRole("button", { name: "Microphone" })).not.toBeVisible({ timeout: 8_000 });
    await expect(attendeePage.getByRole("button", { name: "Camera" })).not.toBeVisible();
    await expect(attendeePage.getByRole("button", { name: "Share screen" })).not.toBeVisible();

    // This is the regression test for the bug this feature would
    // otherwise expose: demoteCoHost used to hardcode 'participant'
    // regardless of context, which would leave a demoted webinar
    // presenter with canPublish still true.
    await expect.poll(() => canPublishFor(roomId, nameAttendee), { timeout: 8_000 }).toBe(false);

    // Still interactive even after demotion — only publish rights were
    // ever revoked, never chat/react/raise-hand.
    await expect(attendeePage.getByRole("button", { name: "Chat" })).toBeVisible();
  });
});

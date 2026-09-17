import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: is the encryption key actually
// confined to the URL fragment and never sent to the backend (the entire
// reason this is genuinely end-to-end rather than backend-visible), does
// a participant who has the correct link actually get to a working,
// visibly-encrypted call, and does every path that CAN'T carry a key
// (join-by-code, a link with the fragment stripped) fail with a clear
// reason instead of silently connecting unencrypted?

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

test.describe.serial("end-to-end encryption", () => {
  let hostContext: BrowserContext;
  let hostPage: Page;
  let guestContext: BrowserContext;
  const nameHost = "E2EE Host";
  const nameGuest = "E2EE Guest";
  let roomUrlWithKey: string;
  let requestedUrls: string[];
  let requestedBodies: string[];

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const hostState = await registerViaApi(browser, nameHost, uniqueEmail("e2ee-host"));
    hostContext = await browser.newContext({ storageState: hostState });
    hostPage = await hostContext.newPage();

    // Capture every request this context makes for the duration of the
    // suite so the key-never-leaves-the-browser assertion below is
    // checking the real, complete traffic — not a hand-picked subset.
    requestedUrls = [];
    requestedBodies = [];
    hostPage.on("request", (req) => {
      requestedUrls.push(req.url());
      const data = req.postDataJSON();
      if (data) requestedBodies.push(JSON.stringify(data));
    });

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Encryption Test");

    // This checkbox only renders once isE2EESupported() resolves true on
    // this browser — Playwright's Chromium supports Insertable Streams,
    // so if this ever stops being visible, that's the real signal to
    // investigate, not a reason to relax the timeout.
    await expect(
      hostPage.getByRole("checkbox", { name: "Enable end-to-end encryption" }),
    ).toBeVisible({ timeout: 10_000 });
    await hostPage.getByRole("checkbox", { name: "Enable end-to-end encryption" }).check();
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();

    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+#key=.+/);
    roomUrlWithKey = hostPage.url();
    await expect(hostPage.getByText("🔒 Encrypted")).toBeVisible({ timeout: 15_000 });

    // The guest used across the rest of this suite — admitted once here
    // via the full link (proving the normal path works), then reused in
    // the final test to prove the OPPOSITE: the same already-admitted
    // guest, opening a link with no key, is refused rather than silently
    // let in unencrypted.
    const guestState = await registerViaApi(browser, nameGuest, uniqueEmail("e2ee-guest"));
    guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    await guestPage.goto(roomUrlWithKey);
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
    const waitingPanel = hostPage.getByTestId("waiting-room-host-panel");
    await expect(waitingPanel.getByRole("listitem").filter({ hasText: nameGuest })).toBeVisible({
      timeout: 10_000,
    });
    await waitingPanel.getByRole("listitem").filter({ hasText: nameGuest }).getByRole("button", { name: "Admit" }).click();

    // The real proof this isn't cosmetic: the guest independently parsed
    // the SAME fragment, called setKey() with it, and LiveKit accepted
    // the connection as encrypted — not just "the page didn't crash".
    await expect(guestPage.getByText("🔒 Encrypted")).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 10_000 });
    await guestPage.close();
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  test("the room URL carries a real key in its fragment, generated client-side", async () => {
    const key = new URL(roomUrlWithKey).hash.replace("#key=", "");
    // Not empty and not trivially short — just confirming this is a real
    // generated value sitting where only the browser (never a server
    // response body) could have put it.
    expect(key.length).toBeGreaterThan(20);
  });

  test("the key never appears in any request URL or JSON body sent to the backend", async () => {
    const key = new URL(roomUrlWithKey).hash.replace("#key=", "");
    for (const url of requestedUrls) {
      expect(url).not.toContain(key);
    }
    for (const body of requestedBodies) {
      expect(body).not.toContain(key);
    }
  });

  test("joining via the meeting code is refused with a clear reason, not a silent unencrypted join", async ({
    browser,
  }) => {
    const codeGuestState = await registerViaApi(browser, "E2EE Code Guest", uniqueEmail("e2ee-code-guest"));
    const codeGuestContext = await browser.newContext({ storageState: codeGuestState });
    const codeGuestPage = await codeGuestContext.newPage();

    await hostPage.goto("/rooms");
    const codeText = await hostPage.getByText(/^Code: \d{3} \d{3} \d{3}$/).first().textContent();
    const joinCode = codeText!.replace("Code: ", "");

    await codeGuestPage.goto("/rooms");
    await expect(codeGuestPage.getByPlaceholder("Enter meeting code")).toBeVisible({ timeout: 20_000 });
    await codeGuestPage.getByPlaceholder("Enter meeting code").fill(joinCode);
    await codeGuestPage.getByRole("button", { name: "Join with code" }).click();

    await expect(
      codeGuestPage.getByText(
        "This meeting is end-to-end encrypted — ask the host for the full link instead.",
      ),
    ).toBeVisible({ timeout: 10_000 });
    // Never navigated away from /rooms at all — this fails before any
    // join attempt, not after a failed one.
    await expect(codeGuestPage).toHaveURL(/\/rooms$/);

    await codeGuestContext.close();
  });

  test("an admitted participant opening the link with the key fragment stripped is refused, not silently connected unencrypted", async () => {
    // Reuses the FIRST guest's session — they're already an admitted
    // Participant row for this room, so re-visiting the bare room URL
    // (no waiting room this time) resolves straight to "admitted",
    // which is exactly the scenario the page-level e2ee gate exists for:
    // someone genuinely allowed into this room whose current tab simply
    // has no key (e.g. a link pasted somewhere that stripped the
    // fragment). Refusing to connect here — rather than joining with
    // encryption silently disabled — is the entire point.
    const bareRoomUrl = roomUrlWithKey.split("#")[0];
    const page = await guestContext.newPage();

    await page.goto(bareRoomUrl);

    await expect(
      page.getByText(
        "This meeting is end-to-end encrypted — you need the full meeting link the host shared, not the join code.",
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Leave/i })).not.toBeVisible();

    await page.close();
  });
});

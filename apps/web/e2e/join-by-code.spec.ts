import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real question this suite answers: does entering a meeting code
// actually resolve to the correct room and go through the SAME join flow
// as a link (waiting room included), or is it some separate, possibly
// under-guarded shortcut? And does an unknown code fail cleanly instead
// of navigating somewhere unexpected?

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

test.describe.serial("join by code", () => {
  let hostContext: BrowserContext;
  let hostPage: Page;
  let guestContext: BrowserContext;
  const nameHost = "Code Host";
  const nameGuest = "Code Guest";
  let roomUrl: string;
  let joinCode: string;

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's server-side compile ahead of the timed navigations
    // below, without running any client JS (see two-user-call.spec.ts for
    // why this matters and why it must NOT be a page.goto).
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const hostState = await registerViaApi(browser, nameHost, uniqueEmail("code-host"));
    hostContext = await browser.newContext({ storageState: hostState });
    hostPage = await hostContext.newPage();

    await hostPage.goto("/rooms");
    await expect(hostPage.getByRole("button", { name: "Start instant meeting" })).toBeVisible({
      timeout: 20_000,
    });
    await hostPage.getByPlaceholder("Meeting name").fill("E2E Join By Code Test");
    await hostPage.getByRole("button", { name: "Start instant meeting" }).click();
    await hostPage.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    roomUrl = hostPage.url();
    await expect(hostPage.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // Back to the meetings list to read the code the exact way a real
    // host would — off the RoomList UI, not a direct API call — so this
    // test also proves the code is actually displayed correctly, not
    // just that the backend generates one.
    await hostPage.goto("/rooms");
    const codeText = await hostPage.getByText(/^Code: \d{3} \d{3} \d{3}$/).first().textContent();
    joinCode = codeText!.replace("Code: ", "");
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  test("entering a valid join code takes a guest into the same room's waiting room", async ({ browser }) => {
    const guestState = await registerViaApi(browser, nameGuest, uniqueEmail("code-guest"));
    guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    await guestPage.goto("/rooms");
    await expect(guestPage.getByPlaceholder("Enter meeting code")).toBeVisible({ timeout: 20_000 });
    await guestPage.getByPlaceholder("Enter meeting code").fill(joinCode);
    await guestPage.getByRole("button", { name: "Join with code" }).click();

    // Lands on the SAME room the host created...
    await expect(guestPage).toHaveURL(roomUrl, { timeout: 10_000 });
    // ...and, since they're not the host, in its waiting room — proving
    // this reuses the real join flow (with all its gating) rather than
    // some code-specific shortcut into the call.
    await expect(guestPage.getByText("Waiting for the host to let you in")).toBeVisible({ timeout: 10_000 });
  });

  test("an unknown code shows an error instead of navigating anywhere", async () => {
    // Reuses the guest session from the previous test (same storageState)
    // rather than registering a fresh account — this is just re-checking
    // the error path, not exercising anything account-specific.
    const page = await guestContext.newPage();
    await page.goto("/rooms");
    await page.getByPlaceholder("Enter meeting code").fill("000000000");
    await page.getByRole("button", { name: "Join with code" }).click();

    await expect(page.getByText("No meeting found with that code")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/rooms$/);
    await page.close();
  });
});

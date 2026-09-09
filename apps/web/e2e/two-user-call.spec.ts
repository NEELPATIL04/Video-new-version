import { test, expect, type Page } from "@playwright/test";

// The real question this test answers: are two people who join the same
// room actually IN THE SAME LiveKit room together, not just two people who
// each independently got a "success" response? Two isolated browser
// contexts (separate cookie jars, like two real people on two real
// devices) is what makes this a genuine test rather than the two-tabs
// approach we tried manually first, which shares cookies for the same
// origin and can't cleanly simulate two independent sessions.

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e-test.local`;
}

async function registerAndLandOnRooms(page: Page, name: string, email: string, password: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/rooms$/);
}

test("two independent users joining the same room both see each other as connected participants", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const password = "TestPass1!";
  const nameA = "E2E User A";
  const nameB = "E2E User B";

  await registerAndLandOnRooms(pageA, nameA, uniqueEmail("usera"), password);
  await registerAndLandOnRooms(pageB, nameB, uniqueEmail("userb"), password);

  // User A creates the room and joins it.
  await pageA.getByPlaceholder("Meeting name").fill("E2E Two User Call");
  await pageA.getByRole("button", { name: "Start instant meeting" }).click();
  await pageA.waitForURL(/\/rooms\/[0-9a-f-]+$/);
  const roomUrl = pageA.url();

  // Wait for A's own LiveKit connection to actually establish — the
  // control bar (mic/camera/leave) only renders once connected, not while
  // still on the "Joining meeting..." placeholder.
  await expect(pageA.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

  // User B joins the SAME room via the URL A ended up on — this is the
  // real-world equivalent of A sharing the meeting link with B.
  await pageB.goto(roomUrl);
  await expect(pageB.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

  // The actual proof of a shared room: each participant's rendered name
  // tag should show up on BOTH pages, not just their own. If A and B had
  // each connected to their own isolated session, each page would only
  // ever show one name.
  await expect(pageA.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });
  await expect(pageB.locator(".lk-participant-name")).toHaveCount(2, { timeout: 15_000 });

  await expect(pageA.getByText(nameA)).toBeVisible();
  await expect(pageA.getByText(nameB)).toBeVisible();
  await expect(pageB.getByText(nameA)).toBeVisible();
  await expect(pageB.getByText(nameB)).toBeVisible();

  await contextA.close();
  await contextB.close();
});

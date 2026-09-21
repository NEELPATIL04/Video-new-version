import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { RoomServiceClient } from "livekit-server-sdk";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// The real bug this suite proves is fixed: today, the SAME account joining
// the SAME room from a second device/tab silently kicks the first one —
// LiveKit's own duplicate-identity handling, with zero explanation on
// either side. Two isolated BrowserContexts sharing the SAME storageState
// (not two different registered accounts, unlike two-user-call.spec.ts) is
// what genuinely simulates "one person, two devices" rather than two
// independent people.

// Must match apps/web/.env's NEXT_PUBLIC_API_URL — playwright.config.ts
// only starts the Next.js dev server, not the backend.
const API_URL = "http://localhost:3001";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@e2e-test.local`;
}

test.describe.serial("multi-device join", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let roomId: string;
  const password = "TestPass1!";
  const name = "E2E Multi Device";

  test.beforeAll(async ({ browser, request }) => {
    // Force next dev's route compile before any real client JS runs — same
    // warm-up two-user-call.spec.ts uses, to avoid the first real page load
    // burning /auth/refresh's own throttle budget on a slow compile.
    await request.get("/");
    await request.get("/login");
    await request.get("/rooms");

    const email = uniqueEmail("multidevice");
    const registerContext = await browser.newContext();
    const res = await registerContext.request.post(`${API_URL}/auth/register`, {
      data: { name, email, password },
    });
    if (!res.ok()) {
      throw new Error(`Setup failed: could not register (${res.status()} ${await res.text()})`);
    }
    await registerContext.close();

    // Two SEPARATE logins, not one shared storageState — refresh tokens
    // rotate on use (see schema.prisma's RefreshToken.replacedByTokenId),
    // so cloning one context's cookie into another means whichever device
    // refreshes first invalidates the other's copy, tripping the reuse-
    // detection logic that revokes the whole chain (confirmed by hand:
    // sharing one storageState logs BOTH contexts out). Two real logins is
    // also the actually-honest simulation of "one person, two devices" —
    // each device authenticates independently, exactly like Room.
    const loginOnNewContext = async (): Promise<StorageState> => {
      const context = await browser.newContext();
      const loginRes = await context.request.post(`${API_URL}/auth/login`, {
        data: { email, password },
      });
      if (!loginRes.ok()) {
        throw new Error(`Setup failed: could not log in (${loginRes.status()} ${await loginRes.text()})`);
      }
      const state = await context.storageState();
      await context.close();
      return state;
    };

    const [stateA, stateB] = await Promise.all([loginOnNewContext(), loginOnNewContext()]);
    contextA = await browser.newContext({ storageState: stateA });
    contextB = await browser.newContext({ storageState: stateB });
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await pageA.goto("/rooms");
    await expect(pageA.getByRole("button", { name: "Start instant meeting" })).toBeVisible({ timeout: 20_000 });

    // Device A creates the room and joins first — as the room's host, so
    // both this device AND the second one auto-admit with no waiting room,
    // isolating this suite to the duplicate-identity behavior alone.
    await pageA.getByPlaceholder("Meeting name").fill("E2E Multi Device Test");
    await pageA.getByRole("button", { name: "Start instant meeting" }).click();
    await pageA.waitForURL(/\/rooms\/[0-9a-f-]+$/);
    const roomUrl = pageA.url();
    roomId = new URL(roomUrl).pathname.split("/").pop()!;
    await expect(pageA.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test("joining the same room from a second device prompts instead of silently kicking the first", async () => {
    // Same account, same room, from what Playwright treats as a genuinely
    // separate device — this must hit the new "already-connected" branch,
    // not silently reconnect or silently kick device A.
    await pageB.goto(`/rooms/${roomId}`);
    await expect(pageB.getByText("This account is already connected to this meeting.")).toBeVisible({
      timeout: 10_000,
    });

    // Device A must still be completely unaffected at this point — no
    // token was minted for B yet, so nothing about A's live connection
    // should have changed.
    await expect(pageA.getByRole("button", { name: /Leave/i })).toBeVisible();
  });

  test("continuing on the second device disconnects the first, with an honest explanation", async () => {
    await pageB.getByRole("button", { name: "Continue here" }).click();
    await expect(pageB.getByRole("button", { name: /Leave/i })).toBeVisible({ timeout: 15_000 });

    // The real proof, not just a UI transition: device A should see the
    // new, honest explanation for why it was disconnected — not a silent
    // bounce back to the dashboard with no context.
    await expect(
      pageA.getByText("You joined this meeting from another device or browser tab"),
    ).toBeVisible({ timeout: 15_000 });

    // And the strongest proof of all: ask LiveKit's own server-side state
    // directly, not the UI. Exactly one live connection should remain for
    // this account — device A's old connection must actually be gone from
    // LiveKit's perspective, not just hidden in the UI.
    const roomService = new RoomServiceClient("http://localhost:7880", "devkey", "secret");
    await expect
      .poll(async () => (await roomService.listParticipants(roomId)).length, { timeout: 10_000 })
      .toBe(1);
    const participants = await roomService.listParticipants(roomId);
    expect(participants[0].name).toBe(name);
  });

  test("the device that won the switch still has host-only controls", async () => {
    // Role lives on the one shared Participant row, never per-device — the
    // forced join must carry the SAME host role, not silently downgrade
    // whichever device ends up connected.
    await expect(pageB.getByTestId("more-menu-toggle")).toBeVisible();
    await pageB.getByTestId("more-menu-toggle").click();
    await expect(pageB.getByTestId("more-menu-people")).toBeVisible();
  });
});

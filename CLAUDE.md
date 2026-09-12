# Project Instructions — Video Conferencing App

Read this before doing any work in this repo. Full detail lives in the docs below — this file is the standing summary Claude should always follow without being reminded.

## Reference docs (source of truth — don't re-decide what's already decided here)

- [TECH_STACK.md](./TECH_STACK.md) — frozen stack: Next.js/React Native frontend, NestJS backend, LiveKit (Go) for media, Postgres + Redis, Clerk/Auth0 auth
- [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md) — LiveKit deployment, tokens/grants, codecs, recording, TURN
- [FEATURES.md](./FEATURES.md) — scoped feature tiers v1 (MVP) → v4 (AI-driven), plus a Tier 5 deferred backlog for items that need their own dedicated design/decision time (SSO, recurring meetings, recording, real calendar sync, notifications, mobile). Build strictly in tier order.
- [DEV_STANDARDS.md](./DEV_STANDARDS.md) — design principles, patterns, naming, API versioning, security checklist, packages

## Non-negotiable rules

1. **Don't re-litigate the stack.** If asked "should we use X instead," check `TECH_STACK.md` first — only revisit if the user explicitly asks to reconsider a specific decision.
2. **Security is not optional, especially:**
   - Every endpoint that fetches a resource by ID must verify ownership/access **at the database query level**, not just via a route guard (Broken Object Level Authorization is the single most common real API vulnerability — see `DEV_STANDARDS.md` §6).
   - Every request body/query needs a DTO with `class-validator`, `whitelist: true`. Never read raw `req.body` unvalidated.
   - Never hardcode secrets, API keys, or tokens. Never log tokens or credentials.
   - Never disable DTO validation, Helmet, or CORS restrictions to "get something working quickly."
3. **Follow the folder structure in `DEV_STANDARDS.md` §3.1:**
   - NestJS: feature-based modules (controller + service + DTOs + tests together per feature)
   - Next.js: `app/` is routing only — business logic goes in `features/<domain>/`, never in route files
4. **Naming:** kebab-case files, PascalCase classes/components, camelCase variables, plural-noun REST routes. See `DEV_STANDARDS.md` §4.
5. **Design principles:** SOLID, constructor-based DI, Guards for auth (never scattered role checks), Repository pattern (never call Prisma directly from a controller). Don't build abstractions for a hypothetical second use case — three similar lines beat a premature abstraction.
6. **Build in tier order.** Do not implement Tier 2/3/4 features (`FEATURES.md`) while Tier 1 is incomplete.
7. **Before marking any feature done:**
   - Run lint + type-check + tests
   - Use the `verify` skill to actually run the app and confirm behavior — passing tests isn't the same as a working feature
   - For UI changes, use `run` or the browser tools to visually confirm before reporting done
8. **Before merging any non-trivial change**, invoke the `production-readiness-guardian` subagent (`.claude/agents/production-readiness-guardian.md`) to check security, patterns, folder placement, simplicity, and production-readiness.

## Workflow shortcuts

- `/code-review` before merging a feature branch (`ultra` for major releases)
- `security-review` on any auth, payment, or LiveKit token/signaling code
- `/simplify` after a feature works, before merge
- `production-readiness-guardian` agent for the full standards check (see above)

## Current phase

Monorepo scaffolded (`apps/web`, `apps/backend`, `packages/shared`, Turborepo + pnpm). Backend has: custom auth (argon2, rotating refresh tokens), Room/Meeting CRUD with per-resource authorization guards, LiveKit token issuance wired into the join flow, host-only admin actions (mute participant audio, remove participant) backed by `RoomServiceClient`, and a host-admit waiting room (`Participant.admittedAt` — null until the host admits; a LiveKit token is only ever issued once it's set). Auth is **custom-built**, not Clerk/Auth0 (reversed from the original `TECH_STACK.md` plan — see §5 there for why). LiveKit is **self-hosted locally** via `infra/livekit/docker-compose.yml` (`--dev` mode), not Cloud.

Frontend has a working call UI (`CallRoom` wrapping `@livekit/components-react`'s `VideoConference` prefab), a `HostControls` panel for muting/removing participants mid-call, and a `WaitingRoomHostPanel` for admitting/denying joiners — both host-only, both rendered together in `CallRoom` (disambiguated in tests via `data-testid`). A non-host joiner sees `WaitingRoom`, which polls `GET /rooms/:id/join-status` every 2s until the host acts. Covered end-to-end by Playwright: `two-user-call.spec.ts`, `waiting-room.spec.ts`, and `join-by-code.spec.ts`. `playwright.config.ts` runs with `workers: 1` — multiple spec files registering real accounts in parallel workers trips the backend's own `/auth/register` throttle; even serialized, a full run across all spec files needs ~60s between attempts to stay under the register/login throttle budgets.

Scheduled meetings and join-by-code are both done: `CreateRoomForm` has a "Schedule for later" toggle (backend rejects a past `scheduledFor`, checked at the service layer not just client-side); scheduled meetings show "Add to Google Calendar" / "Add to Outlook" / "Download .ics" links (`calendarLinks.ts` — pure client-side URL/`.ics` generation, no OAuth, no stored tokens; see FEATURES.md's Research notes for why the full calendar-API-sync version is separately scoped and much bigger). Every room also gets a `joinCode` (9 random digits, e.g. "482 913 657") generated at creation and resolved via `GET /rooms/by-code/:code`, throttled tighter than the global default (15/min) since a 9-digit code is a much smaller keyspace (~30 bits) than the UUID room IDs (122 bits) and is otherwise a realistic brute-force/enumeration target. Reminder emails are deliberately NOT built yet — decided to skip email infrastructure until a provider is chosen (Postal self-hosted needs a domain + DNS control the project doesn't have configured yet; Resend/SES flagged as the faster managed alternative) rather than build against a stub.

**To run locally:** Postgres running with `DATABASE_URL` in `apps/backend/.env`; `docker compose -f infra/livekit/docker-compose.yml up -d` for LiveKit; `pnpm --filter backend run start:dev`; `pnpm --filter web run dev`. E2E: `pnpm --filter web exec playwright test` (needs backend + LiveKit + Postgres running; leave ~60s between runs — `/auth/register` and `/auth/refresh` are both throttled and the suite runs close to those limits).

**Tier 1 is complete** — the remaining originally-v1 items (recording/Egress, recurring meetings, real calendar OAuth sync, email/push notifications & reminders, SSO, mobile) each needed their own dedicated design/decision time rather than being a natural extension of existing code, so they've been moved to FEATURES.md's **Tier 5 — Deferred** section.

**Tier 2 has started:** virtual backgrounds + background blur are done, via LiveKit's own `@livekit/track-processors` package (MediaPipe selfie-segmentation, entirely client-side — no backend involvement, since it's a per-participant local video effect). `BackgroundEffectsControl` renders for every participant (not host-gated, unlike `HostControls`), dynamic-imported with `ssr:false` in `CallRoom` since the package pulls in a large WASM bundle and touches browser-only APIs at import time. The segmentation model loads from a CDN at runtime (`@mediapipe/tasks-vision`'s WASM/model files) — a real, user-visible failure mode (blocked network, corporate proxy) that's now wrapped in try/catch with a visible error message, and an unsupported browser shows an explanation rather than the control just vanishing.

Noise cancellation is also done — but deliberately **not** via LiveKit's own `@livekit/krisp-noise-filter`: researched it first and confirmed (LiveKit's docs + a GitHub issue closed "not planned" by their maintainers) that Krisp is locked to LiveKit Cloud accounts, which doesn't work for this project's self-hosted setup. Used RNNoise instead (`@sapphi-red/web-noise-suppressor`, genuinely open-source) via a custom `NoiseCancellationProcessor` modeled directly on `@livekit/track-processors`' own `GainAudioProcessor` reference implementation. Its AudioWorklet script + WASM binaries are copied from `node_modules` into `apps/web/public/rnnoise/` at install time (`scripts/copy-rnnoise-assets.mjs`, wired to `postinstall`) since Next.js has no Vite-style `?url` import for this — the copied output is gitignored, not committed. See FEATURES.md's Research notes for the full Krisp-vs-RNNoise writeup.

Reactions/emojis are also done, via LiveKit's own data channel (`useDataChannel`, topic `"reactions"`) — chosen after an explicit alternatives comparison against a new NestJS WebSocket gateway, third-party realtime SaaS, and a self-hosted broker (see FEATURES.md's Research notes for the full comparison table). **Standing rule going forward, not just for this feature**: before defaulting to a platform's own built-in mechanism, compare real alternatives on two criteria — new security surface, and genuine open-source licensing (a commercial SaaS free tier doesn't count). Verified with a real cross-participant Playwright test (`reactions.spec.ts`) rather than manual browser checking, since this feature is specifically about whether the OTHER person's browser receives the broadcast — exactly what isolated browser contexts are good at proving and a single manual session can't.

Raise hand is also done, via LiveKit **participant metadata**, not the data channel reactions used — the two solve different problems (metadata is resynced by LiveKit to a participant who joins later; a data-channel broadcast is fire-and-forget and would silently miss late joiners entirely). `RaiseHandControl` renders for every participant (not host-gated) and calls `localParticipant.setMetadata()` directly, client-side, for a participant raising/lowering their OWN hand — safe because the LiveKit access token's `canUpdateOwnMetadata` grant (new, added to `createAccessToken`'s `VideoGrant`) is enforced server-side by LiveKit to only ever touch the caller's own metadata, so there's no backend round trip and no way to forge someone else's state. A host lowering ANOTHER participant's hand is a real backend endpoint instead (`POST /rooms/:id/participants/:userId/lower-hand`, `RoomsService.lowerParticipantHand`), guarded by the same `RoomHostGuard` + `assertActiveNonSelfParticipant` DB-level check as mute/remove. No new DB field — raised-hand state lives entirely in LiveKit, not Postgres, since it's live call state with no need for history (see FEATURES.md's Research notes for the fuller metadata-vs-data-channel writeup). Verified with `raise-hand.spec.ts`, which specifically covers a participant joining AFTER a hand is already raised — the scenario that would have caught a wrong (data-channel) transport choice.

**Not yet built (Tier 5, deferred):** recording/Egress, recurring meetings, real calendar OAuth sync (Google Calendar API / Microsoft Graph — see FEATURES.md), email/push notifications & reminders (blocked on an email provider decision), SSO, mobile. Also not yet built: screen-share-specific controls beyond the SDK default. Flagged but not actioned: annotation/whiteboard (Tier 2, in-app only — see FEATURES.md Research notes for why cross-tab/cross-app annotation isn't a web-app feature at all).

Git workflow in use: feature branches off `dev` (e.g. `feature/auth`, `feature/rooms`, `feature/livekit`), merged back into `dev`, pushed to `origin`. `master`/`main` is never touched or pushed.

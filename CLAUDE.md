# Project Instructions — Video Conferencing App

Read this before doing any work in this repo. Full detail lives in the docs below — this file is the standing summary Claude should always follow without being reminded.

## Reference docs (source of truth — don't re-decide what's already decided here)

- [TECH_STACK.md](./TECH_STACK.md) — frozen stack: Next.js/React Native frontend, NestJS backend, LiveKit (Go) for media, Postgres + Redis, Clerk/Auth0 auth
- [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md) — LiveKit deployment, tokens/grants, codecs, recording, TURN
- [FEATURES.md](./FEATURES.md) — scoped feature tiers v1 (MVP) → v4 (AI-driven). Build strictly in tier order.
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

Monorepo scaffolded (`apps/web`, `apps/backend`, `packages/shared`, Turborepo + pnpm). Backend has: custom auth (argon2, rotating refresh tokens), Room/Meeting CRUD with per-resource authorization guards, LiveKit token issuance wired into the join flow, and host-only admin actions (mute participant audio, remove participant) backed by `RoomServiceClient`. Auth is **custom-built**, not Clerk/Auth0 (reversed from the original `TECH_STACK.md` plan — see §5 there for why). LiveKit is **self-hosted locally** via `infra/livekit/docker-compose.yml` (`--dev` mode), not Cloud.

Frontend has a working call UI (`CallRoom` wrapping `@livekit/components-react`'s `VideoConference` prefab) and a `HostControls` panel (host-only, live participant list via `useParticipants`) for muting/removing participants mid-call. Covered end-to-end by Playwright (`apps/web/e2e/two-user-call.spec.ts`): two isolated browser contexts joining the same room, host mute verified against LiveKit's own server-side state (not DOM), and host remove verified by the removed participant's page actually navigating away.

**To run locally:** Postgres running with `DATABASE_URL` in `apps/backend/.env`; `docker compose -f infra/livekit/docker-compose.yml up -d` for LiveKit; `pnpm --filter backend run start:dev`; `pnpm --filter web run dev`. E2E: `pnpm --filter web exec playwright test` (needs backend + LiveKit + Postgres running).

**Not yet built:** recording/Egress, host-admit waiting room, screen-share-specific controls beyond the SDK default, mobile.

Git workflow in use: feature branches off `dev` (e.g. `feature/auth`, `feature/rooms`, `feature/livekit`), merged back into `dev`, pushed to `origin`. `master`/`main` is never touched or pushed.

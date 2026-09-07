# Development Standards, Automation & Packages

**Status:** Researched and drafted
**Date:** 2026-09-08
**Related:** [TECH_STACK.md](./TECH_STACK.md), [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md), [FEATURES.md](./FEATURES.md)

Purpose: how we actually write code from day one — automation setup (Claude Code agents/skills/hooks), coding standards (principles, patterns, naming, versioning, security), production-readiness checklist, and the concrete package list for backend/frontend/mobile including linting.

---

## 1. Automating the coding workflow with Claude Code

### 1.1 `CLAUDE.md` — the project's standing instructions
Create a `CLAUDE.md` at the repo root once the project is scaffolded. This file is auto-loaded into every Claude Code session in this repo, so it's the single place to encode:
- The architecture decisions from `TECH_STACK.md` (so Claude never suggests re-deciding the stack)
- Naming conventions and folder structure rules (section 3 below)
- "Always run lint + tests before considering a task done"
- Security rules that must never be bypassed (e.g. "never disable DTO validation," "never log tokens/secrets")

Without this file, every new session re-derives context from scratch — with it, standards are enforced automatically rather than repeated manually each time.

### 1.2 Skills to use throughout the build (already available in this environment)
| Skill | When to use |
|---|---|
| `/code-review` | Run on every feature branch before merging — catches correctness bugs and reuse/simplification issues at a chosen effort level. Use `/code-review ultra` for a deep multi-agent pass before major releases |
| `security-review` | Run specifically on auth, payment, token-handling, and any LiveKit signaling code — this is the highest-risk surface area in this app |
| `/simplify` | Run after a feature works, before merging — cleans up reuse/efficiency issues without hunting for bugs (pairs with code-review, not a replacement) |
| `verify` | Use before marking any feature "done" — actually runs the app and checks the behavior instead of trusting that tests passing = feature working |
| `/run` | Launch and screenshot the app during UI work, so frontend changes are visually confirmed, not just type-checked |

### 1.3 Hooks — configured and live

`.claude/settings.json` (repo root) is set up with a `PostToolUse` hook on `Write|Edit` that runs `.claude/hooks/lint-on-save.js` after every file edit:
- Matches `.ts`/`.tsx`/`.js`/`.jsx` files only
- Checks `node_modules/.bin/` for `eslint`/`prettier` before doing anything — **safe no-op today** since the codebase isn't scaffolded yet (verified: piping a synthetic edit event through it exits cleanly with no error when the tooling doesn't exist)
- Once the real apps are scaffolded and `eslint`/`prettier` are installed, it activates automatically — no reconfiguration needed

**Important:** this hook only runs in a Claude Code session whose project root *is* this folder (or a scaffolded repo inside it). Settings are also only picked up by sessions started after the file exists — if you're mid-session in this folder when `.claude/settings.json` is first created, open `/hooks` once or start a new session to pick it up.

**Still to add once `package.json` exists** (can't be usefully configured before there's an actual package manifest/git repo to hook into):
- `husky` + `lint-staged` pre-commit hook (blocks a commit if lint/format fails)
- `commitlint` pre-commit/commit-msg hook (enforces Conventional Commits)
- These are already in the package list (§8.1/8.2) — wiring them up is part of initial repo scaffolding, not before.

### 1.4 Custom subagent: Production Readiness Guardian
Reviews (`/code-review`, `security-review`) are reactive — they catch issues after code is written, in a session you have to remember to run. For a standing, judgment-based check tailored to this project's exact rules, use the custom subagent defined at `.claude/agents/production-readiness-guardian.md`.

- **What it checks, in order:** security (OWASP mapping from §6), design principles/patterns (§2-3), folder structure/naming (§4), simplicity, production-readiness (§7)
- **Why it's report-only:** it has `Read, Grep, Glob, Bash` but deliberately no `Edit`/`Write` — this keeps the review independent of the change instead of the same pass that wrote the code also grading itself
- **When to run it:** before merging any PR, after finishing a feature, or explicitly ("use the production-readiness-guardian agent to review this")

### 1.5 Mechanical enforcement — don't rely on AI judgment for what a rule can catch
Anything that *can* be enforced by a static rule should be, so it fails the build automatically rather than depending on a review catching it:

| Tool | Layer | Role |
|---|---|---|
| `eslint-plugin-boundaries` | Editor (instant feedback) | Define architectural layers (e.g. controllers can't import `@prisma/client` directly) — red squiggles the moment a boundary is crossed |
| `dependency-cruiser` | CI (hard gate) | Scans all imports project-wide, enforces the same architecture rules, detects circular dependencies, fails the build on violation |

Use both, not one — ESLint gives fast dev-time feedback, dependency-cruiser is the CI gate that catches anything an editor warning got ignored or missed. Concretely: a boundaries rule that blocks `*.controller.ts` importing `@prisma/client` mechanically enforces the Repository pattern from §3 — no agent judgment required.

### 1.6 Pre-built NestJS standards skill (external, install once repo exists)
[Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills) — free, open-source, "40 prioritized rules across 10 categories for building production-ready NestJS applications" (architecture, DI, security, performance, testing), each with incorrect-vs-correct code examples, built specifically for AI coding agents including Claude Code. Install via `npx skills add Kadajett/agent-nestjs-skills` once the backend repo exists — no need to hand-write NestJS-specific rules the community has already codified.

### 1.7 MCP connectors worth adding once the repo exists
Not connected yet (checked the registry — nothing matched today), but worth connecting once you have an actual GitHub repo and issue tracker:
- **GitHub** — PR review context, issue linking, CI status (currently the `gh` CLI via Bash covers most of this without an MCP)
- **Postgres** — direct DB inspection/query during development without leaving the session
- **Linear/Jira** — if using either for the AI-generated "action items" feature (Tier 4), connecting it lets Claude Code cross-reference tickets directly

---

## 2. Design principles

- **SOLID** — especially Single Responsibility and Dependency Inversion; NestJS's DI container makes this close to the default rather than extra effort
- **DRY** — but don't over-apply it prematurely; three similar lines across features is fine, a shared abstraction guessed at before the third real use case is not
- **KISS / YAGNI** — no speculative abstractions for Tier 3/4 features while building Tier 1; see `FEATURES.md` tiering
- **Separation of concerns** — Controller (HTTP/WS boundary) → Service (business logic) → Repository/Prisma (data access). Never put business logic in controllers or DB queries in services directly without a repository boundary.

## 3. Design patterns (mapped to this stack specifically)

| Pattern | Where it applies |
|---|---|
| Module-per-feature | NestJS: `AuthModule`, `RoomsModule`, `MeetingsModule`, `BillingModule` — each owns its controllers/services/DTOs |
| Dependency Injection | Native to NestJS — use constructor injection everywhere, avoid manual `new Service()` |
| Repository pattern | Wrap Prisma calls behind a repository/service layer per entity, don't call `prisma.*` directly from controllers |
| DTO + validation pipe | Every incoming request body/query gets a DTO class with `class-validator` decorators (or Zod schema, see below) — never trust raw `req.body` |
| Guard pattern | NestJS Guards for auth/role checks (`@UseGuards(RolesGuard)`) — centralizes authorization instead of scattering `if (user.role !== 'host')` checks through services |
| Interceptor pattern | Logging, response transformation, and timing metrics as interceptors, not duplicated in every controller |
| Custom hooks (frontend) | Encapsulate LiveKit room-connection logic, auth state, etc. in hooks (`useRoom`, `useAuth`) — keep components presentational |

### 3.1 Folder structure (confirmed against 2026 conventions for this exact stack)

**NestJS (backend) — feature-based module structure:**
```
src/
  rooms/
    rooms.module.ts
    rooms.controller.ts
    rooms.service.ts
    dto/create-room.dto.ts
    rooms.repository.ts
    rooms.spec.ts
  auth/
  meetings/
  billing/
```
Each feature owns its controller, service, DTOs, repository, and tests together — not scattered into generic `controllers/`, `services/` top-level folders.

**Next.js (frontend) — `app/` is routing only, logic lives in `features/`:**
```
src/
  app/                    # routing only — no business logic here
    (dashboard)/          # route group — shared layout, no URL segment
      rooms/page.tsx
  features/
    rooms/                # business logic by domain
      components/
      hooks/               # useRoom, etc.
      api.ts
    auth/
  lib/                    # data access, keeps Server Components thin
  components/             # truly shared/generic UI (buttons, inputs)
```
`_component`-prefixed folders (underscore) colocate private, non-route components inside `app/` without creating a route. Business logic in a route file itself is a smell — it belongs in `features/`.

## 4. Naming conventions

- **Files:** `kebab-case.ts` (NestJS convention: `rooms.controller.ts`, `rooms.service.ts`, `create-room.dto.ts`)
- **Classes/Components:** `PascalCase` (`RoomsController`, `VideoTile`)
- **Variables/functions:** `camelCase`
- **Database columns:** `snake_case` (Postgres convention) — Prisma maps this to `camelCase` in generated types automatically, keep that mapping explicit in schema
- **API routes:** plural nouns, resource-based — `/rooms`, `/rooms/:id/participants`, not verbs like `/getRoom`
- **Branches:** `feature/<ticket>-short-description`, `fix/<ticket>-short-description`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`) — enables auto-changelog generation later and keeps `git log` scannable

## 5. API versioning

**Decision: URI versioning** (`/api/v1/rooms`) — NestJS has native built-in support for this, and it's "the most widely adopted approach among REST APIs due to its simplicity and transparency."
- Use `VERSION_NEUTRAL` for endpoints that don't need version-gating (health checks, webhooks) so they work regardless of client version.
- Header versioning is the alternative if you want cleaner URLs — not chosen here because URI versioning is more transparent for external API consumers (relevant once the public API/SDK from Tier 3 ships).

## 6. Security checklist (mapped from OWASP API Security Top 10 to this stack)

| Risk | Mitigation in this stack |
|---|---|
| Broken Object Level Authorization *(found in ~88% of audited Node.js APIs — the single biggest real-world risk)* | Never trust a resource ID from the client alone — always verify the requesting user owns/has access to that room/meeting at the database query level, not just at the route level |
| Broken Authentication | Delegated to Clerk/Auth0 (from `TECH_STACK.md`) rather than hand-rolled — reduces this entire risk category |
| Broken Object Property Level Authorization | Use `class-validator`'s `whitelist: true` / `forbidNonWhitelisted: true` globally so DTOs strip any fields a client shouldn't be able to set (e.g. a user can't PATCH their own `role` field) |
| Unrestricted Resource Consumption | `@nestjs/throttler` for rate limiting on all public endpoints, especially auth and room-creation routes |
| Broken Function Level Authorization | NestJS Guards + RBAC (host/participant/viewer roles from `WEBRTC_LIVEKIT.md`) enforced server-side, never trust a client-side role check alone |
| SSRF | Relevant for the AI layer — validate/allowlist any outbound URLs before the backend calls out to Deepgram/Claude/ElevenLabs webhooks |
| Security misconfiguration | `helmet` for HTTP headers, strict CORS allowlist (not `*`), env var validation at startup (fail fast if a required secret is missing) |
| Improper inventory management | API versioning (section 5) + documented deprecation policy once v2 ships |
| Unsafe consumption of third-party APIs | Validate/sanitize responses from Deepgram/Claude/ElevenLabs before trusting them — don't assume external API responses are always well-formed |

**Also non-negotiable:**
- Secrets (API keys, DB credentials, LiveKit secret) — never in the repo, always env vars backed by a real secrets manager (AWS Secrets Manager/GCP Secret Manager) in production
- Dependency scanning — `npm audit` / Dependabot / Snyk wired into CI, not a manual occasional check
- Password/credential handling fully delegated to Clerk/Auth0 — no custom password hashing code in this app at all

## 7. Production-readiness checklist

- [ ] Health check endpoint (`/health`) for load balancer/orchestrator probes
- [ ] Structured logging (not `console.log`) — see Pino in package list below
- [ ] Centralized exception filter — never leak stack traces or internal file paths in API error responses
- [ ] Env var validation at startup (fail immediately if a required var is missing, not at first use 3 hours later)
- [ ] CI pipeline: lint + type-check + test must pass before merge, on every PR
- [ ] Error tracking (Sentry) wired in from day one, not added after the first incident
- [ ] Database migrations tracked in version control (Prisma Migrate), never manual schema edits in production
- [ ] Graceful shutdown handling (drain in-flight requests/WebSocket connections before process exit)
- [ ] Rate limiting on all public-facing endpoints

---

## 8. Package lists

### 8.1 Backend (NestJS)

**Core**
- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- `@nestjs/config` — env management
- `@nestjs/swagger` — OpenAPI docs generated from decorators

**Database / caching**
- `prisma` + `@prisma/client` — recommended ORM choice for new projects
- `ioredis` — Redis client (SFU room-state + app presence, kept as separate instances per `WEBRTC_LIVEKIT.md`)

**Validation**
- `class-validator` + `class-transformer` — NestJS-native DTO validation
- `zod` — for env var validation and any schema validation outside the DTO layer

**Auth / security**
- `@nestjs/passport` + `passport-jwt` — only if any auth flow isn't fully delegated to Clerk/Auth0
- `helmet` — HTTP security headers
- `@nestjs/throttler` — rate limiting

**Logging / observability**
- `nestjs-pino` (+ `pino-http`) — structured logging
- `@sentry/node` — error tracking

**Real-time / media**
- `livekit-server-sdk` — token generation + Room Service API calls

**Testing**
- `jest` + `supertest` — unit + e2e (NestJS default; Vitest is the emerging 2026 direction in newer Nest versions but Jest remains the stable, best-documented choice today)

**Linting / formatting**
- `eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`
- `prettier` + `eslint-config-prettier` (prevents ESLint and Prettier rules from conflicting)
- `husky` + `lint-staged` — pre-commit enforcement
- `@commitlint/cli` + `@commitlint/config-conventional` — enforce Conventional Commits
- `eslint-plugin-boundaries` — editor-time architecture boundary enforcement (§1.5)
- `dependency-cruiser` — CI-time architecture rule + circular dependency gate (§1.5)

---

### 8.2 Frontend (Next.js web)

**Core**
- `next`, `react`, `react-dom`, `typescript`

**State / data fetching**
- `zustand` — client-side state
- `@tanstack/react-query` — server state, caching, refetching

**Forms / validation**
- `react-hook-form`
- `zod` + `@hookform/resolvers` — shared validation schemas, can mirror backend DTOs conceptually

**Styling / UI**
- `tailwindcss`
- `shadcn/ui` (built on Radix primitives) — component library, not a heavy pre-styled kit, keeps full design control

**Real-time / media**
- `livekit-client`
- `@livekit/components-react` — pre-built call UI primitives (video tiles, controls)

**Auth**
- `@clerk/nextjs`

**Testing**
- `vitest` + `@testing-library/react` — unit/component tests
- `playwright` — e2e (including real WebRTC call flow testing between two browser contexts)

**Linting / formatting**
- `eslint` (via `next lint`, extends `next/core-web-vitals`)
- `prettier` + `eslint-config-prettier`
- `husky` + `lint-staged`
- `eslint-plugin-boundaries` — enforce `app/` (routing only) vs `features/` (logic) separation from §3.1

---

### 8.3 Mobile (React Native)

- `react-native` (or Expo, if choosing managed workflow for faster iteration)
- `@livekit/react-native-webrtc` + `livekit-react-native`
- `@clerk/clerk-expo` (if Expo) or LiveKit-compatible Clerk RN SDK
- `@react-navigation/native` — routing
- `zustand` + `@tanstack/react-query` — shared state patterns with web
- `eslint` + `prettier` — same shared config as web where possible

---

### 8.4 Monorepo tooling (recommended, since types/schemas/UI logic are shared across web, mobile, backend)

- **Turborepo** or **Nx** — build orchestration across `apps/web`, `apps/mobile`, `apps/backend`, `packages/shared`
- **pnpm** — package manager, more efficient for monorepos than npm/yarn (workspace-aware, single node_modules dedup)
- A `packages/shared` workspace for: Zod schemas used by both frontend forms and backend DTOs, shared TypeScript types (e.g. `Room`, `Participant`), and the RBAC role enum — single source of truth instead of duplicating types across apps

---

## Open items

- [x] `CLAUDE.md` — created at repo root with standing project instructions
- [x] Production Readiness Guardian subagent — created at `.claude/agents/production-readiness-guardian.md`
- [x] Lint-on-save hook — `.claude/settings.json` + `.claude/hooks/lint-on-save.js`, verified safe no-op pre-scaffolding
- [ ] `husky` + `lint-staged` + `commitlint` pre-commit hooks — wire up once `package.json`/git repo exist (part of scaffolding, not before)
- [ ] Configure `eslint-plugin-boundaries` rules + `dependency-cruiser` config once repo structure exists (§1.5)
- [ ] Install `Kadajett/agent-nestjs-skills` once backend repo exists (§1.6)
- [ ] Decide Turborepo vs Nx for the monorepo
- [ ] Wire up Sentry + CI pipeline as part of initial scaffolding, not after v1 ships
- [ ] Confirm Jest vs Vitest for backend once NestJS version is locked in

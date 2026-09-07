# Video Conferencing App — Tech Stack (Frozen)

**Status:** Finalized (v1)
**Date:** 2026-09-08
**Goal:** Build a Google Meet + Zoom hybrid, AI-driven, with a standout real-time translation feature.

---

## 1. Frontend

| Layer | Choice | Why |
|---|---|---|
| Web | **Next.js (React) + TypeScript** | Best WebRTC/LiveKit SDK support (React-first), huge ecosystem, SSR for fast dashboard/landing pages |
| Mobile | **React Native** | Shares logic/state with web React code, LiveKit has a first-class RN SDK, single codebase for iOS + Android |

**Rejected alternatives:**
- Vue/Nuxt, Angular — smaller ecosystem for real-time/video libraries, no advantage for this use case
- Flutter — community-maintained WebRTC support (`flutter_webrtc`) vs LiveKit's first-class RN SDK
- Native (Swift/Kotlin) — best performance but doubles team/timeline; only justified once RN hits real scale ceilings

---

## 2. Backend (polyglot — split by workload, matching real production systems)

| Layer | Choice | Why |
|---|---|---|
| App/API + signaling | **Node.js + NestJS** | I/O-bound work (CRUD, auth, billing, WebSocket signaling) — Node's event loop handles concurrency well here; NestJS adds structure (modules, DI, `@WebSocketGateway`) so the codebase stays organized as the team grows |
| Media server (SFU) | **LiveKit (Go, built on Pion)** | Self-hosted, open-source, production-proven — don't hand-roll RTP forwarding/congestion control; this exact problem is already solved |
| Perf-critical microservice | **Rust** (deferred) | Add later, only once profiling proves a specific CPU-bound bottleneck — mirrors Discord's approach (Rust added surgically via NIFs, not used wholesale) |

**Rejected / not chosen upfront:**
- **Go for everything** — Discord tried Go and phased it out entirely; Go's concurrency win applies to CPU-bound/high-throughput packet work (which LiveKit already handles), not typical CRUD APIs
- **Rust for everything** — highest raw performance but steep learning curve, slower iteration, smaller hiring pool; not justified until a measured bottleneck exists
- **Python (Django/FastAPI)** — weaker story for high-concurrency persistent WebSocket connections (GIL, less battle-tested async)
- **Java/Spring** — heavyweight for a lean real-time API/signaling layer

**Production precedent (researched):**
- Discord: Elixir (~60% backend) + Rust (CPU-heavy tasks via NIFs) + C++ (voice/video media)
- LiveKit: Go, built on Pion
- mediasoup: C++ workers (data plane) + Node.js (control plane)
- Zoom: Node.js/Python/Ruby (backend services) + proprietary C++ media router

---

## 3. Real-time Media

| Component | Choice | Why |
|---|---|---|
| Core protocol | **WebRTC** | Native browser/mobile standard for real-time A/V — building a custom protocol means reimplementing NAT traversal, jitter buffers, adaptive bitrate, and DTLS-SRTP encryption from scratch |
| Media routing | **SFU (via LiveKit)** — not P2P, not MCU | P2P mesh collapses past 3-4 participants (bandwidth explosion); MCU is CPU-expensive (server transcodes every stream); SFU forwards without re-encoding — what Zoom/Meet/Teams/Discord all use |
| NAT traversal | **coturn** (STUN/TURN) | ~15-20% of real connections need TURN relay fallback (symmetric NAT, corporate firewalls) — skipping this breaks calls for a meaningful chunk of users |

---

## 4. Data Layer

| Component | Choice | Why |
|---|---|---|
| Primary DB | **PostgreSQL** | Data is relational (users, orgs, rooms, billing) — real transactions, foreign keys, JSONB for flexible fields |
| Ephemeral/real-time state | **Redis** | Presence, mute/video state, pub/sub between signaling instances — fast, no durability needed, keeps load off Postgres |

**Rejected:** MongoDB (no real schema-flexibility need here, loses joins/transactions for nothing), MySQL (no advantage over Postgres for this stack's tooling — Prisma/Drizzle favor Postgres)

---

## 5. Auth

**Choice: Clerk or Auth0 (managed)**
- Why: avoids owning password hashing, OAuth flows, MFA, session/token rotation — all security-critical with no product upside to building in-house
- Enterprise SSO/SAML support needed once selling to companies

---

## 6. API Style

- **REST** for CRUD (rooms, users, billing)
- **WebSocket** for signaling (join/leave, SDP/ICE exchange, presence)
- **GraphQL rejected** — data shape is simple/known upfront, no payoff for the added complexity
- **tRPC optional** if staying full-TypeScript monorepo, for end-to-end type safety

---

## 7. Infrastructure

| Component | Choice | Why |
|---|---|---|
| Containers/orchestration | **Docker + Kubernetes (managed — EKS/GKE)** | SFU nodes need horizontal scaling based on load; K8s handles this natively without owning control-plane ops |
| Serverless | Used only for stateless jobs (webhooks, batch AI summary generation) | Signaling/media need long-lived persistent connections — the opposite of serverless's spin-up-and-die model |
| Cloud provider | AWS or GCP (either works) | Not a locking decision — pick based on team familiarity; GCP has a slight edge if going deep on Google's speech APIs later |

---

## 8. AI Layer (parked — to be detailed separately)

Server-side via APIs (decided), except two exceptions noted below.

| Feature | Pipeline | Why |
|---|---|---|
| Live transcription/captions | Audio → **Deepgram** streaming STT → captions via data channel | Purpose-built for low-latency streaming (Whisper is batch-oriented, not suited for live captions) |
| Meeting summary/action items | Full transcript → **Claude** (post-call, batch) → summary + action items | Better quality with full context; live summarization mid-call is disruptive |
| Noise cancellation / virtual backgrounds | **Client-side** (MediaPipe Selfie Segmentation + WASM noise suppression) | Exception to "server-side": must run on raw local feed before encoding; routing through server defeats the SFU's purpose and adds cost/latency |
| Real-time translation (standout/premium feature) | Audio → Deepgram STT → **Claude** (context-aware translation) → **ElevenLabs** (voice-cloned TTS) → published as per-listener dubbed track via **LiveKit Agents** | Differentiator vs Meet/Zoom — voice-preserved dubbing, not generic robotic translation. Realistic latency: 2-4s end-to-end (comparable to human simultaneous interpreters); show captions fast (~500ms) while dubbed audio catches up |

**Cost note:** STT/TTS/LLM usage is metered per-minute — gate translation/dubbing behind a paid tier.

---

## Final Architecture Diagram

```
Client (Next.js/React Native + WebRTC)
        │
        ├── WebSocket ──► Node.js + NestJS (signaling, API) ──► PostgreSQL + Redis
        │
        └── Media ──► LiveKit SFU (Go) ──► coturn (STUN/TURN)
                          │
                          └── LiveKit Agents (AI layer — STT/translation/TTS/summary)
```

---

## Sources (backend language research)

- [Discord Interview Guide 2026: Real-Time Messaging, Elixir + Rust, Voice Infrastructure](https://www.techinterview.org/companies/discord/)
- [Real time communication at scale with Elixir at Discord](https://elixir-lang.org/blog/2020/10/08/real-time-communication-at-scale-with-elixir-at-discord/)
- [LiveKit SFU | LiveKit Documentation](https://docs.livekit.io/reference/internals/livekit-sfu/)
- [LiveKit: a production WebRTC SFU written in Go](https://www.codeline.co/thoughts/repo-review/2025/livekit-webrtc-sfu-server)
- [mediasoup :: Design](https://mediasoup.org/documentation/v3/mediasoup/design/)
- [mediasoup :: F.A.Q.](https://mediasoup.org/faq/)
- [Node.js vs. Go vs. Rust: The 2025 Backend Performance Showdown](https://devproportal.com/languages/nodejs/node-vs-go-vs-rust-backend-performance/)
- [What's the tech stack behind Zoom?](https://blog.back4app.com/whats-the-tech-stack-behind-zoom/)
- [Zoom: Architected for Reliability](https://library.zoom.com/admin-corner/architecture-and-design/zoom-architected-for-reliability)

---

## Open items (next discussions)

- [x] Deep dive: LiveKit rooms/tracks/scaling mechanics — see [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md)
- [x] Full feature scope, tiered v1-v4 — see [FEATURES.md](./FEATURES.md)
- [x] Coding standards, security checklist, packages, Claude Code automation — see [DEV_STANDARDS.md](./DEV_STANDARDS.md)
- [ ] LiveKit Agents worker implementation for AI pipeline
- [ ] Recording/egress pipeline details — drafted in [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md), needs cloud provider pick to finalize
- [ ] Billing/subscription tier design (free vs premium AI features)
- [ ] Data model design (User, Org, Room, Meeting, Participant, Recording entities)

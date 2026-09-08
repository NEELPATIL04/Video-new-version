# WebRTC / LiveKit — Decisions Needed

**Status:** Core decisions implemented (self-hosted local server, token/grants, room lifecycle) — recording, waiting room, and client SDK still open
**Date:** 2026-09-08 (updated 2026-09-09)
**Related:** [TECH_STACK.md](./TECH_STACK.md)

---

## 1. Deployment model: LiveKit Cloud vs Self-hosted

| Option                       | When it wins                                                                            | Finding                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LiveKit Cloud                | Faster launch, zero ops burden                                                          | Removes the operational work of running/scaling the SFU, Redis, TURN, and egress infrastructure — but needs an external account, same tradeoff we rejected for auth |
| **Self-hosted** ✅ (decided) | Local dev now via Docker; matches the "own our infra" preference from the auth decision | No external account, no data leaves the machine                                                                                                                     |

**Decision (updated 2026-09-09):** **Self-hosted**, not Cloud — consistent with choosing custom auth over Clerk. Local dev runs `livekit/livekit-server` via `infra/livekit/docker-compose.yml` in `--dev` mode (single-node, in-memory, well-known placeholder `devkey`/`secret` credentials — fine for local-only, must be replaced before any real deployment). Production self-hosting (Redis for multi-node, coturn, K8s specifics) is still the future work described in §6-8 below.

---

## 2. Authentication & token architecture

- LiveKit uses **JWT access tokens**. NestJS backend holds the API key/secret (never exposed to client), generates a signed token per participant encoding **identity + room + grants**.
- **Implemented** (`apps/backend/src/livekit/livekit.service.ts`) — grant/role scheme, mapped directly from our existing `RoomRole` enum (`packages/shared`, `Participant.role`):
  - `host` → `roomAdmin: true`, `roomRecord: true`, `canPublish: true`, `canSubscribe: true`
  - `participant` → `canPublish: true`, `canSubscribe: true`, no admin/record
  - `viewer` → `canPublish: false`, `canSubscribe: true` (subscribe-only)
  - Role is never read from client input — always the caller's actual `Participant.role` row, looked up server-side in `RoomsController.join()` before the token is minted.
  - Tokens are short-lived (`ttl: "10m"`) rather than relying on a revocation/not-before mechanism — simpler, and matches the access-token pattern already used for our own auth (§5 of `TECH_STACK.md`).

---

## 3. Room & track model

- **Room** = a call session. **Participants** join and each publishes **Tracks** (camera, mic, screen-share — separate tracks each).
- **Implemented** (`apps/backend/src/rooms/`): capacity limits (`maxParticipants`, enforced in `RoomsService.joinRoom`), lifecycle (`scheduled → active` on first join, `ended` via host action, cancel-only-while-scheduled), who can publish tied to role via LiveKit grants above.
- **Still open:** host-must-admit waiting room — this is a real product feature (host approves each joiner before they enter), not just a token/grant setting, and needs its own design pass once there's an actual call UI to admit people into.

These map to the `RoomsService`/`RoomsController` in NestJS, which call LiveKit's `AccessToken` (join) — Room Service API (list/mute/kick via admin API) is still future work.

---

## 4. Video codec & simulcast

| Codec                         | Verdict                  | Why                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **VP8 + H.264 (baseline)** ✅ | Default                  | VP8 is the mandatory WebRTC baseline codec — universal compatibility. Expected to stay dominant through 2026+                                                                                                            |
| VP9/AV1                       | Enhancement, not default | Better compression (higher PSNR) but AV1 unlikely to dominate until ~2028; support still spotty outside recent Apple Silicon/iPhone                                                                                      |
| **Simulcast** ✅              | Enable                   | Publisher sends multiple quality layers; SFU forwards only the layer each subscriber's bandwidth supports. This is the core reason to use an SFU — without it, one slow connection drags quality down for the whole room |

**Decision:** VP8/H.264 default, simulcast on. Set target resolutions/bitrates per client tier (mobile vs desktop) in room config.

---

## 5. Recording / Egress

- LiveKit Egress runs as a **separate, horizontally scalable service** — joins a room like a hidden participant, renders via headless Chrome + HTML template (Room Composite), pipes through GStreamer, writes to S3/GCS.
- **Decisions needed:**
  - Storage target: S3 (if AWS) or GCS (if GCP) — match whichever cloud we land on from the core infra choice
  - Recording layout: default grid vs custom branded HTML template
  - Output format: MP4 (on-demand playback) vs HLS (if livestreaming added later)

---

## 6. TURN / STUN (NAT traversal)

- **Non-optional.** Without TURN, users behind symmetric NATs or restrictive corporate firewalls (~20-40% of real-world network conditions) get failed connections.
- **Decision:** On LiveKit Cloud, this is handled for us. If/when self-hosting: deploy **coturn** (LiveKit Helm chart can bundle it), rotate the shared secret on a schedule, restrict listening ports — an open/misconfigured TURN relay can be abused to relay unrelated traffic, needs a security review before going live.

---

## 7. Networking & infra specifics (self-hosted path only — future)

Non-standard vs typical Kubernetes apps — noting now so the self-host migration isn't a surprise later:

- LiveKit server needs a **real UDP port range (e.g. 50000-60000) open to the internet** for media — doesn't go through a normal load balancer.
- On Kubernetes: `hostNetwork: true` is effectively mandatory, and **one livekit-server pod per node** (DaemonSet) — two SFU instances can't share a node's port range.
- Only signaling (port 7880) sits behind the normal ingress/load balancer; media flows directly to node IPs.
- Needs its own domain + SSL cert (`wss://livekit.yourhost.com`), and a separate one for TURN if self-hosted.

---

## 8. Scaling / shared state

- Running more than one LiveKit server instance requires **Redis for shared room state** across replicas.
- **Decision:** keep this Redis instance separate from the app's presence/session Redis (from the core stack) so SFU room-state load doesn't contend with signaling-layer load.

---

## 9. Client SDKs

- Use LiveKit's **official SDKs only**:
  - `livekit-client` (JS) for the Next.js web app — **not yet installed**, needed for the actual call UI
  - `livekit-react-native` for mobile — deferred along with mobile generally
  - `livekit-server-sdk` (Node) in NestJS — **installed and in use** (`LiveKitService`) for token generation
- Do not hand-roll WebRTC (`RTCPeerConnection`) directly — SDKs handle reconnection, simulcast negotiation, and track lifecycle.

---

## Summary decision checklist

| #   | Decision                | Current recommendation                                    | Status                                          |
| --- | ----------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| 1   | Cloud vs self-hosted    | **Self-hosted**, local Docker for dev                     | **Implemented**                                 |
| 2   | Token/grant scheme      | host / participant / viewer roles                         | **Implemented**                                 |
| 3   | Room lifecycle rules    | Capacity, status transitions, cancel-vs-end               | **Implemented**; waiting room still open        |
| 4   | Codec                   | VP8/H.264 default, simulcast on                           | Recommended (client-side, not yet built)        |
| 5   | Recording               | S3/GCS + template choice                                  | Needs sign-off (depends on cloud provider pick) |
| 6   | TURN                    | coturn if self-hosting at scale; not needed for local dev | Deferred                                        |
| 7   | K8s networking (future) | hostNetwork + DaemonSet                                   | Noted for later migration                       |
| 8   | Redis scaling           | Separate SFU room-state Redis from app Redis              | Deferred to multi-node                          |
| 9   | SDKs                    | Server SDK in use; client SDK not yet installed           | Partially implemented                           |

---

## Sources

- [Access tokens & grants | LiveKit Documentation](https://docs.livekit.io/frontends/reference/tokens-grants/)
- [Self-hosting overview | LiveKit Documentation](https://docs.livekit.io/transport/self-hosting/)
- [Self-Hosted LiveKit vs LiveKit Cloud: Scale | Prodinit](https://prodinit.com/blog/self-hosted-livekit-vs-livekit-cloud)
- [RoomComposite & web egress | LiveKit Documentation](https://docs.livekit.io/transport/media/ingress-egress/egress/composite-recording/)
- [AV1 vs H.264 vs VP9 vs VP8 | Video Codec Guide 2026](https://www.digitalsamba.com/blog/video-codec-guide)
- [Deploying LiveKit on Kubernetes with Helm: Production Guide | KubeAce Blog](https://kubeace.com/blog/livekit-kubernetes-deployment/)
- [Self-Hosting LiveKit in Production: 2026 Ops Guide](https://fazliev.com/blog/livekit-production-guide)

---

## Open items

- [x] Finalize grant/role scheme (host/participant/viewer) — implemented in `LiveKitService`
- [x] Decide room lifecycle rules (capacity, transitions) — implemented in `RoomsService`
- [ ] Host-must-admit waiting room flow (needs its own design pass with a real call UI)
- [ ] Install `livekit-client` and build the actual call UI in `apps/web`
- [ ] Pick cloud provider (AWS vs GCP) to lock in S3 vs GCS for Egress storage
- [ ] Design custom recording template (branding) or use default grid
- [ ] Before any real deployment: replace the `devkey`/`secret` placeholder LiveKit credentials with real generated ones, not just for local dev

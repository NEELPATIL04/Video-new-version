# WebRTC / LiveKit — Decisions Needed

**Status:** Researched, decisions drafted — pending final sign-off per item
**Date:** 2026-09-08
**Related:** [TECH_STACK.md](./TECH_STACK.md)

---

## 1. Deployment model: LiveKit Cloud vs Self-hosted

| Option | When it wins | Finding |
|---|---|---|
| **LiveKit Cloud** ✅ (recommended for MVP) | Faster launch, zero ops burden | Removes the operational work of running/scaling the SFU, Redis, TURN, and egress infrastructure |
| Self-hosted | Only once at real scale | Meaningfully lower per-call cost beyond ~30K calls/month; cheaper in pure infra cost beyond ~100K calls/month — but requires someone to own version upgrades, autoscaling, on-call |

**Decision:** Start on **LiveKit Cloud** for MVP. Migrate to self-hosted once volume justifies the ops overhead. Note: Cloud plans cap concurrent agent sessions/egress minutes — becomes a real constraint at high scale, revisit before hitting limits.

---

## 2. Authentication & token architecture

- LiveKit uses **JWT access tokens**. NestJS backend holds the API key/secret (never exposed to client), generates a signed token per participant encoding **identity + room + grants**.
- **Decision needed — grant/role scheme:**
  - `host` — mute others, end meeting, start/stop recording
  - `participant` — publish/subscribe own tracks only
  - `viewer` — subscribe-only (for large/webinar-style rooms)
- **Token revocation:** LiveKit tracks a "not-before" cutoff. When a participant is kicked or permissions change, backend must record that timestamp so old tokens are rejected — needs a field on the `Participant`/`Room` record in Postgres.

---

## 3. Room & track model

- **Room** = a call session. **Participants** join and each publishes **Tracks** (camera, mic, screen-share — separate tracks each).
- **Decisions needed:**
  - Who can publish what (tied to role/grant scheme above)
  - Room capacity limits
  - Room lifecycle: auto-close when empty? idle timeout?
  - Waiting room / host-must-admit flow before someone joins?

These map directly to the `Room` service in NestJS calling LiveKit's Room Service API.

---

## 4. Video codec & simulcast

| Codec | Verdict | Why |
|---|---|---|
| **VP8 + H.264 (baseline)** ✅ | Default | VP8 is the mandatory WebRTC baseline codec — universal compatibility. Expected to stay dominant through 2026+ |
| VP9/AV1 | Enhancement, not default | Better compression (higher PSNR) but AV1 unlikely to dominate until ~2028; support still spotty outside recent Apple Silicon/iPhone |
| **Simulcast** ✅ | Enable | Publisher sends multiple quality layers; SFU forwards only the layer each subscriber's bandwidth supports. This is the core reason to use an SFU — without it, one slow connection drags quality down for the whole room |

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
  - `livekit-client` (JS) for the Next.js web app
  - `livekit-react-native` for mobile
  - `livekit-server-sdk` (Node) in NestJS for token generation + Room Service API calls
- Do not hand-roll WebRTC (`RTCPeerConnection`) directly — SDKs handle reconnection, simulcast negotiation, and track lifecycle.

---

## Summary decision checklist

| # | Decision | Current recommendation | Status |
|---|---|---|---|
| 1 | Cloud vs self-hosted | LiveKit Cloud for MVP | Recommended |
| 2 | Token/grant scheme | host / participant / viewer roles | Needs sign-off |
| 3 | Room lifecycle rules | Max size, auto-close, waiting room | Needs sign-off |
| 4 | Codec | VP8/H.264 default, simulcast on | Recommended |
| 5 | Recording | S3/GCS + template choice | Needs sign-off (depends on cloud provider pick) |
| 6 | TURN | Managed on Cloud; coturn if self-hosting later | Recommended |
| 7 | K8s networking (future) | hostNetwork + DaemonSet | Noted for later migration |
| 8 | Redis scaling | Separate SFU room-state Redis from app Redis | Recommended |
| 9 | SDKs | Official LiveKit SDKs only | Recommended |

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

- [ ] Finalize grant/role scheme (host/participant/viewer) with product requirements
- [ ] Decide room lifecycle rules (capacity, auto-close, waiting room)
- [ ] Pick cloud provider (AWS vs GCP) to lock in S3 vs GCS for Egress storage
- [ ] Design custom recording template (branding) or use default grid

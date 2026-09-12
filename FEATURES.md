# Feature List & Roadmap

**Status:** Scoped — basic to advanced
**Date:** 2026-09-08
**Related:** [TECH_STACK.md](./TECH_STACK.md), [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md)

**Rule of thumb:** build strictly in tier order. Do not start Tier 2 work until Tier 1 (v1) is shipped and stable. Trying to build multiple tiers in parallel is how these projects stall.

---

## Tier 1 — v1 / MVP (core, must-have — "a working video call app")

| Feature                            | Tag |
| ---------------------------------- | --- |
| User accounts: sign up/login       | v1  |
| Create meeting: instant            | v1  |
| Create meeting: scheduled          | v1  |
| Join via link or meeting code      | v1  |
| 1:1 video/audio calling            | v1  |
| Group video/audio calling          | v1  |
| Mute/unmute audio                  | v1  |
| Camera on/off                      | v1  |
| Screen sharing                     | v1  |
| In-call text chat                  | v1  |
| Participant list                   | v1  |
| Host controls: mute participant    | v1  |
| Host controls: remove participant  | v1  |
| Waiting room / lobby (host admits) | v1  |
| Web app                            | v1  |

Everything above is done. The remaining items originally scoped for v1 (SSO, recurring
meetings, cloud recording, real calendar sync, email/push notifications, mobile) each
turned out to need their own dedicated design/decision time — a new data model, a
third-party account, or a whole separate codebase — rather than being a natural extension
of what's already built. Moved to **Tier 5 — Deferred** below so Tier 1 can be considered
shipped and stable, per the tier-order rule.

---

## Tier 2 — v2 (standard — competitive parity with Meet/Zoom)

| Feature                                                                                                                  | Tag |
| ------------------------------------------------------------------------------------------------------------------------ | --- |
| Virtual backgrounds — **done**, via `@livekit/track-processors` (MediaPipe segmentation, client-side only)               | v2  |
| Background blur — **done**, same feature/implementation as virtual backgrounds above                                     | v2  |
| Noise cancellation — **done**, via RNNoise (not LiveKit's Krisp package — that's LiveKit Cloud-only, see Research notes) | v2  |
| Breakout rooms                                                                                                           | v2  |
| Reactions/emojis — **done**, via LiveKit's own data channel (`useDataChannel`) — see Research notes                      | v2  |
| Raise hand — **done**, via LiveKit participant metadata (not the data channel) — see Research notes                      | v2  |
| Polls & Q&A                                                                                                              | v2  |
| Collaborative whiteboard/annotation (in-app: blank canvas + draw-on-shared-screen, inside our own video call UI)         | v2  |
| In-chat file sharing                                                                                                     | v2  |
| Meeting lock — **done**, `Room.locked` + host-only lock/unlock endpoints — see Research notes                            | v2  |
| Co-host / multiple hosts                                                                                                 | v2  |
| Layout: grid view                                                                                                        | v2  |
| Layout: speaker view                                                                                                     | v2  |
| Layout: gallery view                                                                                                     | v2  |
| Picture-in-picture mode                                                                                                  | v2  |
| Device picker (mic/camera/speaker)                                                                                       | v2  |
| Network quality indicator                                                                                                | v2  |
| Meeting analytics (attendance, duration, join/leave times)                                                               | v2  |
| Recording sharing (permissioned link)                                                                                    | v2  |
| End-to-end encryption toggle                                                                                             | v2  |

---

## Tier 3 — v3 (advanced / enterprise)

| Feature                                                                                                                                                                                                                | Tag |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Large-scale webinar/broadcast mode (view-only, hundreds-thousands)                                                                                                                                                     | v3  |
| Live streaming out (YouTube/Facebook/custom RTMP)                                                                                                                                                                      | v3  |
| SIP/PSTN dial-in (join by phone number)                                                                                                                                                                                | v3  |
| Multi-device join (same user, multiple devices)                                                                                                                                                                        | v3  |
| Admin dashboard: org-wide user management                                                                                                                                                                              | v3  |
| Admin dashboard: usage reports                                                                                                                                                                                         | v3  |
| Admin dashboard: security policies                                                                                                                                                                                     | v3  |
| Enterprise SSO/SAML                                                                                                                                                                                                    | v3  |
| Role-based access control                                                                                                                                                                                              | v3  |
| Public API/SDK (embeddable video calls)                                                                                                                                                                                | v3  |
| Integration: Slack                                                                                                                                                                                                     | v3  |
| Integration: Jira                                                                                                                                                                                                      | v3  |
| Integration: Notion                                                                                                                                                                                                    | v3  |
| White-labeling / custom branding                                                                                                                                                                                       | v3  |
| Meeting templates & agendas                                                                                                                                                                                            | v3  |
| Security: watermarking                                                                                                                                                                                                 | v3  |
| Security: domain-restricted join                                                                                                                                                                                       | v3  |
| Security: enforced waiting room policies                                                                                                                                                                               | v3  |
| Cross-tab annotation overlay (draw on top of the presenter's OTHER browser tabs, not just inside our call UI) — requires a companion browser extension, separate codebase from the web app; see "Research notes" below | v3  |

---

## Tier 4 — v4 (AI-driven — the differentiator layer)

| Feature                                                                   | Tag |
| ------------------------------------------------------------------------- | --- |
| Live transcription & captions                                             | v4  |
| Multi-language captions                                                   | v4  |
| **Real-time translation with voice-preserved dubbing** (flagship feature) | v4  |
| Auto meeting summaries                                                    | v4  |
| Auto action items → push to Jira/Linear/Asana                             | v4  |
| AI-powered noise cancellation (smart, adaptive)                           | v4  |
| AI-powered virtual backgrounds (smart segmentation)                       | v4  |
| AI meeting co-pilot (live Q&A using meeting context)                      | v4  |
| Auto chapter markers / smart highlights in recordings                     | v4  |
| Searchable meeting history (semantic search across transcripts)           | v4  |
| Auto-generated agenda from calendar invite content                        | v4  |
| Engagement/sentiment signals for hosts (talk-time balance, disengagement) | v4  |

---

## Tier 5 — Deferred (each needs dedicated design/decision time before scheduling)

Not lower priority in the sense of "nice to have" — several of these are genuinely
important (SSO, recording, notifications). What they share is that none of them are a
natural extension of code that already exists: each needs a real decision (which OAuth
providers, which storage backend, which email provider) or a new data model before a
single line gets written. Moved here so Tier 1 isn't blocked waiting on decisions that
are the user's to make, not something to default into.

| Feature                                | Originally | Why it's separate                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud recording (start/stop, playback) | v1         | Needs LiveKit Egress + a real storage backend (S3 or similar) — an infra decision, not a code gap                                                                                                                                                       |
| Create meeting: recurring              | v1         | Needs a new `MeetingSeries` model, an RRULE-based recurrence engine, and single-vs-series edit/cancel semantics — a genuinely new data model, not a field added to scheduling                                                                           |
| Google/Microsoft SSO                   | v1         | OAuth provider integration alongside (not replacing) the custom auth system — its own consent flows and provider-specific quirks per provider                                                                                                           |
| Calendar integration (real OAuth sync) | v1         | The lightweight add-to-calendar links shipped instead (Tier 1, done). Full Google Calendar API / Microsoft Graph sync needs separate OAuth app registrations per provider and, at scale, Google's own security verification review — see Research notes |
| Email/push notifications & reminders   | v1         | Blocked on an email provider decision (managed like Resend/SES vs. self-hosted Postal, which needs a domain with DNS control) — deliberately not built against a stub                                                                                   |
| Mobile app (iOS/Android)               | v1         | A separate React Native codebase (per TECH_STACK.md), not an extension of the web app                                                                                                                                                                   |

---

## Cross-cutting / Non-functional (apply across all tiers — easy to forget, plan early)

| Requirement                                                    | Applies from    |
| -------------------------------------------------------------- | --------------- |
| Security & compliance: GDPR                                    | v1              |
| Security & compliance: SOC2                                    | v3              |
| Security & compliance: HIPAA (if targeting healthcare)         | future/optional |
| Accessibility: screen reader support                           | v1              |
| Accessibility: closed captions for deaf/hard-of-hearing        | v2              |
| i18n: multi-language UI                                        | v2              |
| Reconnection handling (graceful recovery from network drops)   | v1              |
| Cross-browser/device compatibility testing                     | v1 (ongoing)    |
| Observability: call quality metrics (jitter, packet loss, MOS) | v1              |
| Observability: error tracking                                  | v1              |
| Billing & subscription tiers (free / pro / enterprise)         | v2              |
| Usage-based AI feature gating                                  | v4              |

---

## Research notes

### Annotation — three distinct capabilities, three different amounts of work

"Annotation" turned out to mean three genuinely different features once scoped. Keep them
separate in planning — they don't share a codebase, and two of the three aren't achievable
as a normal web page at all.

**1. In-app whiteboard / draw-on-shared-screen (Tier 2 row above) — buildable in the current stack.**
Presenter or viewers draw on a blank canvas, or on top of the video element showing the
active screen share, rendered _inside our own call UI_. This is what Zoom/Meet/Teams mean
by "annotation" in their own feature lists.

- **Sync transport**: no new infra needed — LiveKit is already integrated, and
  `LocalParticipant.publishData()` + the `RoomEvent.DataReceived` event (confirmed in
  `livekit-client`'s own type defs) give us a ready-made low-latency broadcast channel for
  stroke events to everyone in the room.
- **Rendering**: an HTML5 `<canvas>` (or a library like `perfect-freehand` for stroke
  smoothing, or `tldraw` for a fuller whiteboard) absolutely-positioned over the shared-screen
  `<video>` element; pointer events converted to normalized (0–1) coordinates before
  broadcasting, so drawings stay aligned regardless of each viewer's own window size.
- **Open design question**: ephemeral (clears when screen share stops, matching most
  competitors' default) vs. persisted (needs a DB model + storage, closer to a real
  whiteboard product) — worth deciding before starting, not mid-build.

**2. Cross-tab overlay — drawing on top of the presenter's OTHER browser tabs (Tier 3 row above) — needs a separate browser extension.**
This is NOT achievable from our web app itself. Browsers deliberately sandbox a page so it
can never render pixels on top of a _different_ tab or origin — this restriction exists
specifically to prevent clickjacking/UI-redressing attacks, so there's no API or workaround
for a plain page to draw across tab boundaries.

- **What it actually requires**: a browser extension (Manifest V3) with either
  `host_permissions: ["<all_urls>"]` (works without the user clicking the extension first,
  but triggers the scariest permission prompt in the Chrome/Firefox store review — "Read and
  change all your data on all websites") or the lighter `activeTab` permission (extension
  only gets injected into whichever tab the user explicitly activates it on — much smaller
  privacy footprint, minor UX cost).
- **Mechanism**: the extension injects a content script that adds a full-viewport
  `position: fixed` canvas overlay into the target tab's DOM, toggling
  `pointer-events: none/auto` to switch between "draw mode" and "let clicks through to the
  page underneath."
- **Distribution cost, not just build cost**: this is a genuinely separate codebase and
  release pipeline from the Next.js app — its own manifest, its own Chrome Web
  Store / Firefox Add-ons listing and review process (can take days, and `<all_urls>`
  submissions get extra scrutiny), and its own update cadence independent of the main app.
- **Still browser-only**: even with the extension, this only reaches other _browser tabs_ —
  it still can't draw on top of a native app (Slack desktop, VS Code, a PDF viewer, the OS
  desktop itself). See #3.

**3. True screen-wide overlay — drawing on top of ANY application, not just browser tabs — needs a native desktop app, and is bigger than #2.**
This is what tools like CoScreen, Zoom's own desktop annotation, and ZoomIt (Sysinternals)
actually are: not web features at all, but native apps that open an OS-level transparent,
always-on-top, click-through-toggleable window spanning the whole screen. Confirms this
genuinely is native-app-class work, not something we're missing a trick for on the web.

- **How it's built**: Electron (or Tauri) `BrowserWindow` with `transparent: true`,
  `alwaysOnTop: true`, `frame: false`, and `setIgnoreMouseEvents()` toggled between draw
  mode and pass-through mode. Windows needs the layered/transparent window flags under the
  hood; macOS needs a borderless `NSWindow` with a clear background — Electron abstracts
  both, but packaging, code-signing, and (for macOS) notarization become real project
  costs on top of the feature itself.
- **Scope**: effectively a second product alongside the web app — its own build/release/
  auto-update pipeline, own installer, own platform-specific quirks — that then talks to the
  same backend/LiveKit room via the same data-channel approach as #1 for syncing strokes to
  other participants.
- **Not currently scoped anywhere in this roadmap.** Flagging it here so it's a known,
  deliberate non-goal rather than something that quietly falls off the list — revisit only
  if a native desktop client ever gets greenlit for other reasons (it would make sense to
  bundle this with that effort, not build it standalone).

### Noise cancellation — LiveKit's own official package doesn't work for a self-hosted server

Worth flagging clearly since it's the kind of thing that looks like the obvious choice at a
glance: LiveKit ships `@livekit/krisp-noise-filter`, wrapping the commercial Krisp noise
cancellation engine, as their own first-party solution. **It's locked to LiveKit Cloud
accounts** — confirmed against LiveKit's own docs, and against a GitHub issue on
`livekit/client-sdk-js` where someone asked exactly "is there any way to use Krisp with
self-hosted LiveKit?" — closed **"not planned"** by LiveKit's maintainers. This isn't a
pricing tier we could pay our way into; self-hosted deployments (this project's deliberate
choice — see TECH_STACK.md §5) simply aren't supported.

Shipped with **RNNoise** instead (`@sapphi-red/web-noise-suppressor`) — a genuinely
open-source (BSD-licensed, xiph.org) neural noise-suppression model, the same _class_ of
technology Krisp uses, just not tied to anyone's cloud billing. Implemented as a custom
LiveKit `TrackProcessor`, modeled directly on `@livekit/track-processors`' own
`GainAudioProcessor` — that class's source is explicitly documented as "a reference
implementation for building custom audio processors," which is exactly what made this
straightforward: same Web Audio graph shape (source → effect → destination), just a
different effect node.

Practical note for anyone touching this again: Next.js has no Vite-style `?url` import for
vendoring a package's binary assets, so the AudioWorklet script + WASM binaries are copied
from `node_modules` into `apps/web/public/rnnoise/` at install time
(`scripts/copy-rnnoise-assets.mjs`, wired to `postinstall`) rather than committed — commit
the script, not the copied output.

### Reactions/emojis — alternatives comparison (standing practice, not a one-off)

Per explicit instruction: before defaulting to a platform's own built-in mechanism for a
feature, compare it against real alternatives on two criteria — does it add any NEW security
surface, and is it genuinely open source (not just "has a free tier"). Applying that here:

| Option                                                      | Open source?                        | Security surface                                                                                                            |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **LiveKit's own data channel** (chosen)                     | Yes — Apache 2.0                    | None new — reuses the call's already-authenticated, already-encrypted WebRTC connection                                     |
| A new NestJS WebSocket gateway                              | Yes (Socket.IO, MIT)                | New authenticated connection + new room-broadcast logic to secure independently, for no functional gain                     |
| Third-party realtime SaaS (Pusher, Ably, Firebase Realtime) | **No** — commercial, fails outright | Also sends live user activity to a third party's servers regardless of cost                                                 |
| Self-hosted broker (Redis Pub/Sub, NATS, MQTT)              | Yes                                 | A whole extra network-exposed service to run, patch, and secure, duplicating a capability LiveKit already provides for free |

LiveKit's data channel won on the merits, not convenience — it's the only option that
requires building nothing new to secure at all. Implemented via
`@livekit/components-react`'s own `useDataChannel` hook (topic `"reactions"`, kept distinct
from LiveKit's built-in chat topic `"lk.chat"` — one data channel per room, topics just
filter). Sent lossy (not reliable) since a dropped reaction just never appears, which is
fine for something this ephemeral. Shown as a simple fading toast rather than attached to a
sender's video tile — the latter would mean forking `VideoConference`'s grid layout, a much
bigger change for a cosmetic touch.

### Raise hand — metadata vs. data channel (why this one couldn't reuse reactions' transport)

Reactions (shipped just before this) used LiveKit's data channel
(`useDataChannel`) as a fire-and-forget broadcast, and the standing rule from
that feature's research (compare real alternatives, not just reach for the
platform default) still applies here — but the comparison that actually
mattered for raise-hand wasn't "data channel vs. some other broker", it was
"data channel vs. LiveKit's OWN other sync mechanism, participant metadata",
because the two solve genuinely different problems:

| Property                                   | Data channel (reactions' choice)       | Participant metadata (raise-hand's choice)                                                                            |
| ------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| What it represents                         | A one-off event ("an emoji was sent")  | Current state ("whose hand is up right now")                                                                          |
| Delivered to a participant who joins LATER | No — fire-and-forget, already missed   | Yes — LiveKit resyncs every participant's current metadata to a newly-joined participant as part of normal room state |
| Correct behavior needed here               | N/A — reactions are meant to disappear | A late joiner MUST see an already-raised hand, or the feature is silently broken for them                             |

A pure data-channel implementation would have looked identical to the
metadata version in every manual two-person test, and would only fail the
one scenario that actually matters: a third participant joining after a hand
was already raised. That's specifically why `raise-hand.spec.ts` includes
"a participant who joins AFTER a hand is already raised also sees it" as its
own test, not just "does it broadcast" — it's the test that would have
caught the wrong transport choice.

**Security surface, checked before committing to metadata (per the standing
research-alternatives rule):** `localParticipant.setMetadata()` needs a new
LiveKit access-token grant, `canUpdateOwnMetadata` (off by default — checked
directly in `livekit-server-sdk`'s `VideoGrant` type rather than assumed).
Its name is the security argument: LiveKit enforces server-side that this
grant only ever lets a participant update THEIR OWN metadata — there's no
way to reach this API and forge another participant's state, so granting it
to every participant (host + participant, same viewer carve-out as
`canPublish`) adds no meaningful new attack surface. The one thing this
grant genuinely can't do is let a HOST lower ANOTHER participant's hand
(that's not "own" metadata from the host's perspective) — that path goes
through a real backend endpoint instead
(`POST /rooms/:id/participants/:userId/lower-hand`), using
`RoomServiceClient.updateParticipant()` server-side, guarded by the same
`assertActiveNonSelfParticipant` DB-level check as mute/remove.

**Why this isn't a DB field.** `Participant.admittedAt` is DB-tracked
because it's meaningful after the fact (audit trail, "when did this person
get let in") and needs to survive a reconnect. A raised hand is neither —
nobody needs to know an hour later that a hand was raised, and if
LiveKit itself restarted the room state would legitimately reset too. It's
live call state, matching how nothing else about the in-call UI (camera
background choice, noise cancellation on/off) is persisted to Postgres
either.

### Meeting lock — reusing joinRoom's existing-member check instead of writing a new one

The one design decision worth writing down for this feature: "locked"
had to mean "block brand-new joiners," not "kick out anyone who blinks."
`RoomsService.joinRoom` already had to answer a closely related question
for the capacity gate — is this caller a genuinely NEW joiner, or someone
who already has a `Participant` row and is just rejoining (duplicate tab,
flaky connection)? That existing lookup is reused as-is for the lock check
rather than writing separate "is this participant currently admitted"
logic, for two reasons:

- **It's simpler** — one lookup, two gates, instead of two lookups that
  are supposed to agree.
- **It's safer** — if the lock check and the capacity check ever used
  different definitions of "already a member," they could disagree with
  each other about who counts as new. A participant who somehow passed
  one check but not the other would be a confusing, hard-to-reproduce bug.
  Reusing the exact same value makes that class of bug impossible by
  construction.

A pleasant side effect: the host is automatically exempt from ever being
locked out of their own meeting, with no special-case code. Their own
`Participant` row is created transactionally in `createRoom`, so the
existing-member lookup is always truthy for them — "the host can't lock
themselves out" falls out of "an existing member can always get back in,"
rather than needing its own `if (userId === room.hostId)` branch to get
right (and potentially get wrong).

No new DB migration complexity either: `Room.locked` has a real default
(`false`), so unlike the `joinCode` migration (which needed a
nullable-column-then-backfill two-step because every existing row needed
a _unique_ generated value with no natural default), this one is a single
`ALTER TABLE ... ADD COLUMN ... DEFAULT false` — Postgres backfills every
existing row with that default directly, no manual UPDATE needed.

## Open items

- [ ] Confirm v1 scope with stakeholders before starting build
- [ ] Define pricing/tier boundaries (what's free vs pro vs enterprise) — ties to billing design
- [ ] Prioritize order within each tier once v1 scope is locked
- [ ] Decide ephemeral vs. persisted whiteboard state before starting the Tier 2 annotation feature (see Research notes)
- [ ] Decide whether cross-tab annotation (Tier 3) is worth a separate browser-extension codebase before scheduling it, given the store-review and maintenance overhead documented above

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

| Feature                                                                                                                                                                  | Tag |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| Virtual backgrounds — **done**, via `@livekit/track-processors` (MediaPipe segmentation, client-side only)                                                               | v2  |
| Background blur — **done**, same feature/implementation as virtual backgrounds above                                                                                     | v2  |
| Noise cancellation — **done**, via RNNoise (not LiveKit's Krisp package — that's LiveKit Cloud-only, see Research notes)                                                 | v2  |
| Breakout rooms — **done**, new `BreakoutRoom` model + real per-room LiveKit rooms — see Research notes                                                                   | v2  |
| Reactions/emojis — **done**, via LiveKit's own data channel (`useDataChannel`) — see Research notes                                                                      | v2  |
| Raise hand — **done**, via LiveKit participant metadata (not the data channel) — see Research notes                                                                      | v2  |
| Polls & Q&A — **done**, persisted in Postgres with a REST fetch-on-mount for late joiners — see Research notes                                                           | v2  |
| Collaborative whiteboard/annotation — **done**, plain HTML5 `<canvas>` + LiveKit data channel for live sync, persisted to Postgres for late joiners — see Research notes | v2  |
| Meeting lock — **done**, `Room.locked` + host-only lock/unlock endpoints — see Research notes                                                                            | v2  |
| Co-host / multiple hosts — **done**, `RoomRole.cohost` + `RoomHostOrCoHostGuard` — see Research notes                                                                    | v2  |
| Layout: grid view — **already done for free**, `VideoConference`'s default `GridLayout` — see Research notes                                                             | v2  |
| Layout: speaker view — **already done for free**, `VideoConference` auto-focuses a pinned/screen-shared track                                                            | v2  |
| Layout: gallery view — **already done for free**, same `GridLayout` as grid view above (paginated)                                                                       | v2  |
| Picture-in-picture mode — **done**, native `HTMLVideoElement.requestPictureInPicture()`, client-side only — see Research notes                                           | v2  |
| Device picker (mic/camera/speaker) — **already done for free**, `ControlBar`'s built-in `MediaDeviceMenu`                                                                | v2  |
| Network quality indicator — **already done for free**, `ParticipantTile`'s built-in `ConnectionQualityIndicator`                                                         | v2  |
| Meeting analytics (attendance, duration, join/leave times) — **done**, host-only, pure Postgres aggregation over `Participant` — see Research notes                      | v2  |
| End-to-end encryption toggle — **done**, via LiveKit's `ExternalE2EEKeyProvider` + a URL-fragment key — see Research notes                                               | v2  |

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
| Meeting templates & agendas — **done**, reusable `MeetingTemplate` presets + live per-room `AgendaItem` checklist — see Research notes                                                                                 | v3  |
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
| Recording sharing (permissioned link)  | v2         | Meaningless without recording itself, which is already deferred above on the same LiveKit Egress + storage backend decision — moved here alongside it rather than left looking independently buildable                                                  |
| In-chat file sharing                   | v2         | Needs a storage backend decision (S3-compatible bucket vs. self-hosted, upload size limits, virus scanning) — the same class of infra decision as cloud recording above, not a code gap                                                                 |

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
- **Design question, now resolved — see the dedicated Research notes entry below**:
  persisted to Postgres, not ephemeral, specifically so a participant who joins after
  strokes already exist doesn't see a blank canvas.

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

### Whiteboard — persisted-plus-REST-fetch, chosen specifically to close the same late-joiner gap raise-hand already documented

Raise hand's Research notes (above) already worked through the general shape
of this problem: a plain LiveKit data-channel broadcast is fire-and-forget,
so anyone connected before an event was sent will have already missed it —
fine for something disposable like a reaction, a real correctness bug for
anything that's supposed to represent current, persistent state. A
whiteboard's drawn strokes are exactly that kind of state, arguably more so
than a raised hand: nobody expects a raised hand to survive being lowered,
but everybody expects a shared whiteboard to still have last week's — or
even three minutes ago's — drawing on it when they join.

Raise hand solved its version of this with LiveKit participant metadata,
which LiveKit itself resyncs to new joiners. That mechanism doesn't fit
here: metadata is a small per-participant string, and a whiteboard's stroke
history is an unbounded, ordered, multi-author log — the wrong shape for a
value LiveKit treats as "this participant's current state blob." So the
fix has to be the more general one metadata was standing in for: persist
the actual history somewhere durable, and have a newly-joined client fetch
it directly instead of relying on having been present for every event that
built up to it.

Concretely: `WhiteboardStroke` rows in Postgres (one row per pen-down-to-
pen-up gesture, see `schema.prisma`), fetched via `GET
/rooms/:id/whiteboard/strokes` unconditionally on mount by
`WhiteboardControl` — not lazily on first opening the panel, since the
whole point is that a participant must see existing strokes the first time
they look, not only if they happened to be connected when each stroke was
drawn. Already-connected participants still get new strokes live over
LiveKit's data channel (topic `"whiteboard"`, sent `reliable: true` unlike
reactions' lossy sends — a dropped stroke would leave two canvases
silently disagreeing for the rest of the call, with no later re-sync short
of a full re-fetch); the REST fetch and the data channel are deliberately
two separate paths solving two separate problems (initial state vs. live
updates), the same split video-conferencing apps generally use for chat
history vs. live messages.

**Verified with `e2e/whiteboard.spec.ts`**, specifically a test named "a
participant who joins AFTER a stroke has already been drawn still sees
it" — guest B registers and gets admitted only after guest A has already
drawn and broadcast a stroke, so any implementation relying purely on the
data channel would leave guest B's canvas blank. The test reads the
canvas's own pixel data (`getImageData`) rather than trusting in-memory
React state, since the actual claim being verified is "this got painted,"
not "some variable updated." This is the exact test shape raise-hand's own
Research notes called out as the one that would have caught a wrong
(data-channel-only) transport choice, applied to the whiteboard.

### Whiteboard — hand-rolled `<canvas>`, not a third-party library

Per the standing rule from the reactions research above (compare real
alternatives on security surface and genuine open-source licensing before
reaching for a platform/library default), the options considered for
rendering were: a plain HTML5 `<canvas>` with hand-rolled pointer-event
handling, vs. a drawing library (`perfect-freehand` for smoother stroke
interpolation, or `tldraw` for a much fuller whiteboard editor — both
flagged as options in this doc's earlier annotation research).

Neither library earned its dependency for what FEATURES.md actually scopes
here: "a blank canvas participants can draw on with a pen tool," not a
full whiteboard editor with shapes, text, or infinite panning (that's
`tldraw`'s entire value proposition, and none of it is asked for) or
stroke-smoothing fidelity beyond what `ctx.lineTo` with `round` line
caps/joins already gives a mouse- or touchpad-driven freehand line
(`perfect-freehand`'s entire value proposition). Both are genuinely
open-source (MIT), so licensing wasn't the blocker — the actual reasoning
is the same KISS/YAGNI principle `DEV_STANDARDS.md` §2 already states for
this codebase: don't add a dependency for capability the feature doesn't
use. A plain `<canvas>` also has zero new security surface (no third-party
code parsing untrusted input, no new supply-chain dependency to audit),
which is the more usual thing this alternatives-comparison rule catches —
here it happens to point the same direction as simplicity, not against it.
Confirmed in `apps/web/package.json`: no drawing library was added for
this feature.

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

### Breakout rooms — two design decisions: the data model, and how a connected client learns the split changed

**Data model: a new, minimal `BreakoutRoom` model, not a self-referencing `Room`.** The obvious-looking shortcut was to give `Room` a nullable `parentRoomId` pointing at itself and reuse every existing Room field (`joinCode`, `scheduledFor`, `maxParticipants`, `status`, `locked`, ...) for a breakout. Rejected: almost none of that actually applies to a breakout room — it has no independent join code (see the BOLA point below, this is load-bearing, not cosmetic), is never scheduled, doesn't get its own lock toggle, and its lifecycle is "created and ended by the host mid-meeting," not "scheduled → active → ended" like a real meeting. Reusing `Room` would mean either leaving most of its columns meaningless for every breakout row, or building guard logic everywhere to stop a breakout from being treated like a real room (join-by-code lookup, the room list, scheduling, recording once that exists). That's exactly the "abstraction for a hypothetical second use case" DEV_STANDARDS.md says not to build — a breakout room and a top-level meeting only superficially resemble each other. Instead, `BreakoutRoom` is a new, deliberately small model (`id`, `label`, `createdAt`, `endedAt`, `roomId`) plus one new nullable `Participant.breakoutRoomId` column — a participant can only ever be in one breakout at a time, so this lives on the SAME row as their main-room membership rather than a separate join table with its own many-to-many shape that doesn't exist here.

This also directly answers the "can a stranger wander into a breakout" question: there is no `joinCode`, no `GET /rooms/by-code/:code`-equivalent, and no route that looks up a breakout room independently at all. The only way to ever get a breakout's LiveKit token is `GET /rooms/:id/breakout-rooms/my-assignment`, which is scoped to the CALLER's own `Participant` row (`roomId` + the authenticated JWT's `userId`, never a client-supplied target) — there is nothing here for a participant to peek into, let alone a stranger with no `Participant` row at all.

**Reconnect notification: polling `my-assignment`, not a LiveKit data-channel/metadata signal.** Same category of problem meeting-lock and raise-hand's own notes already worked through — how does an ALREADY-CONNECTED client learn about a host-initiated change — but a worse fit for the fire-and-forget option than either of those: a missed breakout assignment doesn't just miss a cosmetic update, it strands that participant in the main room with no way to ever receive their breakout access token. `BreakoutRoomAwareCallRoom` polls `GET /rooms/:id/breakout-rooms/my-assignment` every 3s and swaps between two fully separate `LiveKitRoom` connections (remounted via a fresh `key`, since moving between two real LiveKit rooms isn't a prop change on a live connection).

**Bug caught during live multi-room testing, not by the unit tests**: the polling design alone wasn't sufficient. `CallRoom`'s pre-existing `onDisconnected` handler unconditionally does `router.push("/rooms")` — correct for the main call (any disconnect there really does mean "you left the meeting"), but wrong for a breakout connection specifically when the HOST ends breakouts: `BreakoutRoomsService.endBreakoutRooms` calls `LiveKitService.deleteBreakoutRoom`, which tears down that LiveKit room server-side and force-disconnects everyone in it — firing `onDisconnected` well before the next 3s poll tick would otherwise have noticed. Without a fix, that race booted every breakout participant out of the meeting entirely instead of reconnecting them to the main room, and a real `breakout-rooms.spec.ts` end-to-end run (not the backend unit tests, which mock LiveKit and can't see this) caught it directly — the "Leave" button never came back. Fixed by giving `CallRoom` an overridable `onDisconnected` prop and checking `DisconnectReason.ROOM_DELETED` (LiveKit's own signal for "this room is gone," distinct from a genuine user-initiated leave or a host removal) in `BreakoutRoomAwareCallRoom`: that specific reason triggers an immediate reconnect to the main room instead of falling through to the default "exit to /rooms" behavior.

**Scoped out of v1, documented rather than silently missing:**

- **Automatic/random participant distribution.** The host designs the whole split client-side (who goes in which numbered room) and submits it as one request; there's no "auto-assign evenly" button. A real second use case (some hosts want manual control, e.g. breaking out by team) would need a genuine design decision about the algorithm, not just "call Math.random" — better to ship manual-only and revisit if it's actually requested.
- **Host moving between rooms mid-session.** The host stays in the main room for the whole breakout period in v1; visiting individual breakout rooms live would need the host's own client to gain the same poll/reconnect machinery participants have, plus a way to get back, which is a bigger surface than this pass covers.
- **E2EE meetings.** `createBreakoutRooms` refuses outright (`ConflictException`) for an `e2eeEnabled` room rather than silently connecting a participant to an unencrypted breakout — a breakout room has no key-distribution story of its own (see the E2EE notes below on why the key only ever travels via the main room URL's fragment), and silently downgrading security is exactly the failure mode this codebase refuses elsewhere too (join-by-code + E2EE).

Verified live against a real multi-room LiveKit setup, not just the mocked unit tests: `breakout-rooms.spec.ts` has a host split two guests into two breakout rooms and confirms via `RoomServiceClient.listParticipants` directly against LiveKit (not just the UI) that each guest lands in a genuinely separate LiveKit room (not a relabeled view of the same one), that both guests actually leave the main LiveKit room while breakouts are active, and that ending breakouts brings all three participants back together in the main LiveKit room with no action from the guests themselves.

### End-to-end encryption — why the key lives in the URL fragment, not the backend

LiveKit ships real E2EE support client-side (`ExternalE2EEKeyProvider`, a Web
Worker doing frame-level encryption via Insertable Streams), confirmed by
reading `livekit-client`'s actual shipped type definitions rather than
assuming from docs — worth calling out that both `BaseKeyProvider` and
`ExternalE2EEKeyProvider` are marked `@experimental` directly in the SDK's
own source. Browser support is real and gated: it only works where
`RTCRtpSender.prototype.createEncodedStreams` exists (Chromium-based
browsers reliably; Safari/Firefox inconsistently), checked via the SDK's own
`isE2EESupported()` rather than a hardcoded browser-agent guess.

The part LiveKit does NOT solve is key distribution: `ExternalE2EEKeyProvider`
is a single shared passphrase model — it encrypts once you hand it a key, but
how that key reaches every participant is entirely the application's
problem. Deriving or transmitting it through anything the backend already
sees (a `Room` field, the join API, `joinCode` — already flagged elsewhere in
this doc as a weak ~30-bit value) would mean the server could reconstruct
the key, which isn't end-to-end at all, just obfuscation. The key is
generated client-side (`crypto.getRandomValues`, see `e2ee.ts`) and shared
only via the room URL's **fragment** (`#key=...`) — fragments are never sent
to any server, by every browser, by spec — the same pattern real E2E group
call products use for exactly this reason. `Room.e2eeEnabled` is the only
piece of this that touches the database, and deliberately holds no key
material at all; it exists purely so `joinRoom`'s response can tell a client
"this room needs a key you don't have" instead of silently connecting with
broken, undecryptable media.

This has two concrete, deliberate consequences documented here rather than
discovered later:

- **Join-by-code cannot carry an E2EE key.** A 9-digit code has no way to
  also convey a full key, so `JoinByCodeForm` checks `room.e2eeEnabled` and
  refuses with a clear message rather than navigating into a join that would
  fail (or worse, silently degrade) at the call stage.
- **It's creation-time-only, not a live mid-call toggle.** LiveKit's E2EE is
  configured on the `Room` object's construction options (keyProvider +
  worker), not something turned on for an already-connected room without
  every participant reconnecting. Toggling it mid-call would mean forcing
  everyone to rejoin — a bigger, separate UX problem this doesn't attempt to
  solve. A host chooses it once, at creation, same as `maxParticipants`.
- **Scheduled meetings don't get the checkbox yet.** An instant meeting
  redirects straight to its own URL after creation, so the host sees the
  fragment-bearing link once, immediately, and can copy it from their
  address bar. A scheduled meeting's share surface (calendar links, the
  room list) never visits that URL at all — there'd be nowhere to recover
  the key from afterward without storing it server-side, defeating the
  whole point. Left out deliberately rather than half-built with a
  localStorage-based recovery hack.

**Recording will conflict with this later.** Whenever recording/Egress
(Tier 5) gets built, it needs to explicitly refuse to run on an
`e2eeEnabled` room — server-side Egress cannot decrypt client-side-encrypted
media, so recording an E2EE call wouldn't fail loudly, it would silently
save broken output. Noting this now so it isn't a surprise later.

Verified with `e2ee.spec.ts`: the generated key never appears in any request
URL or JSON body sent to the backend during the full create → join flow
(the actual security claim, not just "the UI shows a lock icon"), a guest
with the correct link reaches an encrypted call, join-by-code is refused
with a clear reason, and an already-admitted participant opening a link
with the fragment stripped is refused rather than silently joined
unencrypted.

### Four "v2" rows turned out to already be done — reading the prefab's actual source before building anything new

Before starting on Co-host, checked whether `VideoConference` (the LiveKit
prefab this app wraps rather than hand-rolls, per `DEV_STANDARDS.md` §9)
already covered any of the remaining Tier 2 rows — reading its and
`ControlBar`'s actual shipped source (`node_modules/@livekit/components-react`),
not assuming from the package's docs. It does, for four of them:

- **Grid view** — `VideoConference`'s default state (no pinned track) is
  already `GridLayout` with every participant's tile.
- **Speaker view** — the same component auto-pins a screen-share track, and
  `FocusLayoutContainer`/`FocusLayout` handle a manually-pinned participant,
  switching the whole layout automatically.
- **Gallery view** — same `GridLayout` as grid view; there's no separate
  "gallery" concept in this SDK, paginated grid IS the gallery view.
- **Device picker** — `ControlBar` already renders a `MediaDeviceMenu` next
  to both the microphone and camera toggle buttons, with device choices
  persisted via `usePersistentUserChoices`.
- **Network quality indicator** — `ParticipantTile` already renders a
  `ConnectionQualityIndicator` on every tile.

None of these needed a single line of new code — they were already shipping
the moment `VideoConference` was wired in for Tier 1. Marked done in the
table above rather than left looking unbuilt.

### Co-host / multiple hosts — why this stays a DB-backed role, not LiveKit metadata, and why it needs two separate guards

Unlike raised-hand state, a participant's role directly gates backend
authorization — `RoomHostGuard` and friends re-verify at the DB level on
every request (`DEV_STANDARDS.md` §6) — so it has to live on the DB's own
`Participant.role` column, not in LiveKit's live room state the way a
raised hand does. Extending `RoomRole` with a new `cohost` value keeps this
on the exact same column already used for `host`/`participant`/`viewer`,
rather than inventing a parallel field or reaching for participant
metadata (which would also mean a read-modify-write merge with the
already-stored `handRaised` field — a risk flagged when raise-hand was
built, avoided entirely here by keeping role out of metadata).

The one design decision worth writing down: **not every `RoomHostGuard`-
protected action extends to a co-host.** Room-lifecycle actions (`update`,
`cancel`, `end`) and appointing/revoking co-hosts themselves stay strictly
owner-only, checked against `Room.hostId` exactly (unchanged `RoomHostGuard`)
— a co-host promoting a rival co-host, demoting the real host, or renaming/
ending the meeting outright would be a real privilege-escalation bug, not a
feature. Call-control and queue-management actions (mute, remove, admit,
deny, lock, unlock, lower-hand) extend to co-hosts via a new, separate
`RoomHostOrCoHostGuard` — a deliberate two-guard split rather than loosening
`RoomHostGuard` itself, so the two privilege levels can never accidentally
drift into each other through one shared check. Verified live against the
real backend, not just in the UI: a plain participant is refused every
call-control action (403); once promoted, the exact same identity can lock
the room, but is still refused promoting a third participant, demoting the
real host, ending the room, or renaming it (403 on all four); demoting them
again immediately revokes the call-control access.

`LiveKitService.createAccessToken`'s `roomAdmin` grant now also covers
`cohost` (they perform genuinely admin-shaped actions), but `roomRecord`
stays host-only — recording isn't built yet, and there's no reason to
pre-grant it ahead of that feature's own access-control design. Neither
grant is actually consumed by any client-side code in this app today: every
host/co-host action goes through the backend's own `RoomServiceClient`
(the backend's API key/secret, not the caller's personal token), so a
promotion takes effect immediately for everything that matters, with no
reconnect needed — the token's own `roomAdmin` bit only catches up on the
co-host's next reconnect, which is fine precisely because nothing reads it
client-side.

Because a promotion/demotion has to visibly change what an
**already-connected** participant sees mid-call, `CallRoom` polls the
existing `GET /rooms/:id/join-status` endpoint every 5 seconds while
connected — the same endpoint `WaitingRoom` already polls while pending —
rather than inventing a new endpoint or a LiveKit data-channel signal.
Verified end-to-end with two real browser contexts: promoting a
currently-connected participant makes host-shaped panels (`HostControls`,
`MeetingLockControl`) appear on THEIR page without any refresh or
reconnect, and demoting removes them the same way; the co-host management
panel itself (`CoHostControl`) stays invisible to the co-host throughout,
confirming appoint/revoke power never leaks past the true owner.

### Picture-in-picture — no LiveKit API for this, a DOM query scoped by the SDK's own class names instead

Pure client-side feature, no backend involvement at all: the browser's
native `HTMLVideoElement.requestPictureInPicture()` on an existing
`<video>` element. The only real design question was _which_ `<video>`
element — this app wraps `VideoConference`, the LiveKit prefab, rather
than hand-rolling the video grid (`DEV_STANDARDS.md` §9), and that
component owns `GridLayout`/`FocusLayout`/`ParticipantTile` internally.
Checked both options before building, per this project's standing
research-before-building practice:

- **(a) A LiveKit-native API for "give me the current video element."**
  Doesn't exist. Read the actual shipped source, not just the `.d.ts`
  (`node_modules/@livekit/components-react/src/components/participant/
VideoTrack.tsx` and `.../hooks/useMediaTrackBySourceOrName.ts`) —
  `VideoTrack` renders a bare `<video>` internally and attaches the
  LiveKit `Track` to it via `track.attach(element)`, but `VideoConference`
  never forwards a ref or exposes a hook for "the currently focused/local
  track's element" to a consumer sitting outside the grid. There's
  nothing to call here that isn't itself a DOM query.
- **(b) A DOM query, scoped by the SDK's own markup rather than a blind
  `document.querySelectorAll("video")`.** Chosen. `components-core`'s
  `setupMediaTrack()` tags every video/audio element it manages with a
  stable, prefixed class (`lk-participant-media-video`, `cssPrefix +
"-participant-media-video"` — see `components-core/src/components/
mediaTrack.ts` and `.../constants.ts`) plus `data-lk-source` /
  `data-lk-local-participant` attributes. `PictureInPictureControl`
  queries `video.lk-participant-media-video` scoped inside the
  `LiveKitRoom`'s own `[data-lk-theme]` root (set by `CallRoom`), so it
  can never accidentally grab a stray `<video>` elsewhere on the page.
  This is a real fallback, not a hack: it relies on the SDK's own
  rendering contract (the class/attributes are part of its public
  styling API, not incidental), the same category of "read the shipped
  source before assuming" that turned up the grid/speaker/gallery/device-
  picker/network-quality rows as already-covered-for-free elsewhere in
  this doc.

**Picking which video, when several are on screen.** Not every tile is
worth popping out while multitasking: `findPipCandidate()` filters to
elements with actual decoded frames (`readyState`/`videoWidth`, so a
tile whose track hasn't attached yet is skipped), then prefers a REMOTE
participant's video over the local camera preview (the point of PiP is
watching everyone else, not your own preview), and among ties picks
whichever tile is currently rendered largest on screen — which tracks
whatever layout `VideoConference` is using (grid vs. a manually pinned
focus) without this component needing to know which one is active or
duplicate that layout logic.

**Feature detection, and why Safari isn't a maintained path here.**
Gated on `document.pictureInPictureEnabled`, checked directly rather than
assumed — same "real feature detection, not a browser-agent guess"
standard as E2EE's `isE2EESupported()`. Chromium and Firefox both keep
that flag accurate; Safari supports the same
`requestPictureInPicture()` API but doesn't reliably set
`document.pictureInPictureEnabled`, and would need a separate
webkit-prefixed capability check (`webkitSupportsPresentationMode`) to
detect properly. Not built: `playwright.config.ts` runs Chromium only
(see its own comment on why — `next dev`/register-throttle reasons
apply to every spec, this one included), so a Safari-specific code path
would be unverifiable in this project's e2e matrix and was left as
"control hides with an explanation" there rather than a maintained,
untested branch.

**What `picture-in-picture.spec.ts` can and can't prove.** Playwright
drives real Chromium, so the feature-detection gate and the click
handler's real `requestPictureInPicture()` call both run for real, not
mocked — covered: the control renders for both host and guest (unlike
`MeetingLockControl`, this isn't host-gated, since PiP is a personal
viewing preference); a real click resolves to one of exactly two visible
end states (entered PiP, or the try/catch's visible error message)
within 5 seconds with no unhandled page error; and the unsupported-
browser gate is verified against a _real_ forced
`document.pictureInPictureEnabled = false` (via `addInitScript`, before
the page loads), not a hardcoded stand-in. What it can't prove: the
resulting floating window is an OS-level surface entirely outside the
page's own DOM/accessibility tree, so there's nothing left for
Playwright to assert once `requestPictureInPicture()` resolves — that
part was confirmed by hand in a real browser session instead.

### Polls & Q&A — why the data channel alone would repeat raise-hand's bug, and how this one avoids it

Raise-hand's research already established the failure mode: a fire-and-forget
LiveKit data-channel broadcast never reaches a participant who wasn't
connected at the moment it fired. Polls have the exact same shape of risk —
a "poll created" event and every "vote cast" event are each one-off
broadcasts — but a WORSE consequence if mishandled, because a poll's
question/options/tally are real data that must be exactly correct (an
emoji that never rendered is a shrug; a vote count that's silently short by
one is the feature failing at its one job). That ruled out reusing
raise-hand's fix as-is too: participant metadata is a good fit for small
current-state values LiveKit already syncs (a boolean, a short string), but
a poll's shape — a question, a variable number of options, and a running
tally that changes on every vote — doesn't fit that primitive, and unlike a
raised hand, results need to survive a page refresh and be auditable after
the call ends. That combination (must be correct, must persist) means
Postgres is the actual source of truth here, not LiveKit state of any kind:
`Poll`/`PollOption`/`PollVote` in `schema.prisma`, with `PollOption` as its
own model (not a `String[]` on `Poll`) specifically so each option's vote
count is a DB-level aggregate (`_count: { select: { votes: true } }`)
instead of pulling every vote row into app memory to count client-side.

The design that follows from that: `PollControl` fetches
`GET /rooms/:id/polls/current` once on mount, for every participant, before
it ever looks at the data channel — this is what a late joiner actually
sees the poll from, regardless of whether they missed the "created"
broadcast, missed every "vote cast" broadcast, or joined after the poll was
already closed. `getCurrentPoll` deliberately returns the room's most
recent poll whether it's open OR closed (not "open only") — closing that
gap mattered too, since a participant joining right after a host closes a
poll needs to see the final results, not nothing. The data channel (topic
`"polls"`) still exists and still matters for responsiveness, but only as a
"something changed, go refetch" ping — never as the payload itself — so a
dropped or delayed broadcast degrades to "this client updates a little
late," never to "this client is wrong." `polls.spec.ts` is written to prove
this specifically: its two late-joiner tests connect a fresh participant
only AFTER a poll exists and votes were already cast, and again only AFTER
the poll was closed — the exact scenario a data-channel-only
implementation would pass in every manual two-person check and then fail
silently in production.

**Security surface, checked before writing new guards (per the standing
research-alternatives rule from the reactions feature).** Every polls route
is nested under `/rooms/:id/polls` specifically so it can reuse
`RoomsModule`'s existing `RoomHostGuard`/`RoomMemberGuard` as-is (now
exported from `RoomsModule` for this) rather than a new poll-specific guard
pair — create/close are host-only, vote/current are any active room member,
identical tiering to the rest of this app's room actions. Double-voting is
blocked at the database level with `@@unique([pollId, userId])` on
`PollVote`, not just an application-code check beforehand — the service
layer checks first for a clean `409`, but a caught `P2002` on the actual
insert is what closes the race a check-then-insert alone can't (two tabs
voting at the same instant). Every lookup follows the same BOLA-safe
`id + roomId` (and, for a vote's `optionId`, `id + pollId`) pattern used
throughout this codebase, so a valid poll or option ID from a DIFFERENT
room can never be read or voted on through another room's route.

### Meeting analytics — live-vs-post-hoc availability, and why duration doesn't come from a new column

The one real design question for this feature: should `GET /rooms/:id/analytics`
only work once a meeting has ended, or work anytime? Chose **anytime** —
the endpoint is a pure Postgres read over `Participant` rows the app
already writes (`joinedAt`/`leftAt`/`admittedAt` from `joinRoom`, `leaveRoom`,
`endRoom`), with no LiveKit call involved, so there's no live-connection
dependency forcing a "only after it ends" restriction the way something
built on live LiveKit room state would have. Real products (Zoom, Meet)
show attendance _during_ a call too, not just afterward, and a host
mid-meeting asking "who's actually here right now, and for how long" is a
genuinely useful question — restricting this to post-hoc review would
throw that away for no real reason. A participant who hasn't left yet
(`leftAt: null`) gets `stillInCall: true` and a duration computed against
`now` instead of a stored end time; the response shape is identical before
and after the meeting ends, so the same frontend page
(`apps/web/src/app/rooms/[id]/analytics/page.tsx`) works for both without
a mode flag.

One exception, decided for correctness rather than for the live/post-hoc
question: a **scheduled** room nobody has joined yet returns an explicit
empty shape (`participants: []`, `meetingStartedAt: null`) instead of
computing anything from data that exists but doesn't mean what it would
look like it means. The host's own `Participant` row is created
transactionally in `createRoom`, so it already has a `joinedAt` — but that
timestamp is the _room's creation time_, not a real call join, until the
host actually opens the call and hits `joinRoom` (which refreshes it,
and is also what flips `Room.status` from `scheduled` to `active`). Gating
on `RoomStatus.scheduled` rather than trying to special-case "the host's
row doesn't count yet" keeps the logic in one place and matches a signal
the codebase already treats as meaningful, instead of inventing a second
one.

**Why no new column for "meeting duration" or "ended at".** The task
brief specifically flagged checking `Room.status`/`RoomStatus` and whether
`updatedAt` already captures an end timestamp before adding anything new —
it doesn't, safely. `Room.updatedAt` is a blanket `@updatedAt` bumped by
_any_ write to the row (lock/unlock, a future rename, anything), including
ones that can legitimately happen after a room has already ended (nothing
in `lockRoom`/`unlockRoom` checks `RoomStatus`), so it can't be trusted to
mean "this is when the meeting ended." `endRoom` already sets `leftAt` for
every still-active participant in the same transaction that marks the room
`ended` — so once `status === 'ended'`, every participant row has a real
`leftAt`, and the latest of those _is_ exactly when the meeting ended,
derived from data already being recorded for an unrelated reason rather
than a new column that could itself drift out of sync with the participant
rows it would be describing.

**Why the service re-checks the host at the DB level, unlike every other
host-only method in `RoomsService`.** Every other host-gated method
(`lockRoom`, `unlockRoom`, `muteParticipant`, etc.) trusts `RoomHostGuard`
alone — the guard's own `isHost` check already satisfies CLAUDE.md's BOLA
rule ("verify ownership at the database query level, not just via a route
guard") since it _is_ a DB query, just one that happens to live in the
guard rather than the service. `getMeetingAnalytics` deliberately repeats
that check inside `RoomsService` itself: this is the one endpoint in the
Rooms module whose response is a full dump of every participant's name and
complete join/leave history, materially more sensitive than "toggle a
boolean" or "mute this one person," so applying the rule a second time
here — at the one call site where a mistake would leak the most — was
judged worth the small duplication. Covered directly in
`rooms.service.spec.ts` (`getMeetingAnalytics` → "refuses a non-host") and
in `meeting-analytics.spec.ts`, where a removed participant navigating
straight to the analytics URL is refused (in practice by `RoomHostGuard`,
which runs first — the service's own check is the defense-in-depth layer
for a request that reached the method some other way).

Verified with `meeting-analytics.spec.ts`: a real two-browser-context call
(host + guest, admitted through the actual waiting-room flow, same as
`two-user-call.spec.ts`), the guest genuinely removed mid-call (the one
path currently wired in the UI to set `Participant.leftAt` —
`leaveRoom`/`POST /rooms/:id/leave` exists in `RoomsService` and
`features/rooms/api.ts` but isn't yet called from any button; flagged as a
separate, pre-existing gap rather than fixed as part of this feature), then
the host's analytics page is asserted against the real outcome: 2 unique
participants, the host's row reading "still in call," the guest's row
showing a real (non-empty, non-"still in call") left timestamp and a
plausible non-zero duration, and the duration tile reading "so far" rather
than a final total since the room is still active. A non-host is separately
proven unable to reach the same room's analytics by navigating straight to
the URL. Only the single-room view was built — a cross-meeting/aggregate-
over-time dashboard was in scope as a stretch goal but wasn't attempted;
the single-room view alone was enough work to get fully right and tested.

### Meeting templates & agendas — two independently-lifecycled pieces, not one combined entity

Scoped as two small, cleanly separable pieces rather than one blob, because
they genuinely have different lifecycles: a `MeetingTemplate` is edited long
after any room it seeded is gone, while a room's live `AgendaItem` checklist
diverges from the template immediately after creation (items checked off,
new ones added ad hoc). Conflating them into one entity would mean
confusing "reusable preset" with "this call's live state" — the same
"don't build a hypothetical shared abstraction" reasoning breakout rooms'
own notes already worked through for why `BreakoutRoom` isn't a
self-referencing `Room`.

**`MeetingTemplate` is deliberately NOT room-scoped** — it belongs directly
to a `User` (`hostId`), with no relation to any `Room` row at all, unlike
every other Tier 2/3 feature so far (Polls, Whiteboard, Breakout Rooms),
which are all room-scoped. That means none of `RoomHostGuard`/
`RoomMemberGuard`/`RoomHostOrCoHostGuard` apply — they all answer "is this
caller allowed to act on THIS room," which isn't the question here.
Ownership is a plain `template.hostId === userId` check written directly in
`TemplatesService`, not a new guard class for one module's single call
site — the same proportionate amount of code `RoomsService` itself already
uses for its own `hostId` comparisons (e.g. `getMeetingAnalytics`).

**Agenda items live directly in `RoomsController`/`RoomsService`, not a new
module** — mirroring the precedent Meeting-analytics and Whiteboard already
set (folded into the existing Rooms module rather than getting their own,
reserved for genuinely large per-room features like Polls/Breakout-rooms
that need their own guards/DTOs wired through a dedicated module). Agenda's
CRUD surface (list/add/toggle/remove) is the same size as Whiteboard's, so
it gets the same treatment; `TemplatesModule` is the one genuinely new,
dedicated module, since it's a top-level resource with no Room relation to
extend.

**Agenda mutations use `RoomHostOrCoHostGuard`, not the stricter
`RoomHostGuard`** — running the agenda live ("check this off," "add
something that just came up") is exactly the kind of meeting-management
action co-host was built to share, consistent with its existing scope on
mute/remove/lock. Reading the agenda uses `RoomMemberGuard`, same as
`PollsController`'s `current` endpoint — any admitted participant,
including a plain viewer, can see it.

**No reorder endpoint in v1** — items keep creation order. The same kind of
deliberate scope cut as Breakout Rooms skipping host-movement-between-rooms
or Whiteboard only supporting undo-last: a host who wants a different order
can delete and re-add, and building drag-and-drop reorder now would be
speculative given nothing has asked for it yet.

**A real bug only live Playwright testing caught, not the mocked unit
tests**: `AgendaControl`'s checkbox toggle initially called `setPending(true)`
_before_ updating local item state, which triggered a React re-render that
briefly read the OLD (pre-toggle) `item.completed` for the checkbox's
`checked` prop — visibly forcing the just-clicked checkbox back to
unchecked for a moment before the real server response landed and it
re-checked itself. Playwright's `.check()` action correctly refused to
consider that a legitimate state change and failed the test outright,
catching a genuine UX flicker a human easily could have missed in casual
manual testing. Fixed by updating `items` optimistically in the SAME tick
as `setPending`, so the checkbox's `checked` value never regresses to stale
data mid-flight; a failed request still rolls back via a real `refresh()`
rather than trusting the optimistic guess.

Verified with `meeting-templates.spec.ts`, whose core test is the same
late-joiner shape as Polls/Whiteboard's own: a template's starter agenda is
confirmed seeded into a brand-new room's `AgendaItem` rows at creation, the
host live-edits the checklist (add/complete/remove), and a guest who
registers and joins only AFTER those edits already happened sees the exact
resulting state via `GET /rooms/:id/agenda`'s fetch-on-mount — not a stale
or missing view, the scenario a data-channel-only implementation would pass
in casual testing and then silently fail in production. A non-host/
non-cohost participant is also confirmed to have no add/delete controls at
all, not just non-functional ones.

## Open items

- [ ] Confirm v1 scope with stakeholders before starting build
- [ ] Define pricing/tier boundaries (what's free vs pro vs enterprise) — ties to billing design
- [ ] Prioritize order within each tier once v1 scope is locked
- [ ] Decide whether cross-tab annotation (Tier 3) is worth a separate browser-extension codebase before scheduling it, given the store-review and maintenance overhead documented above

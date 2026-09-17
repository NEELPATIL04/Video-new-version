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

| Feature                                                                                                                        | Tag |
| ------------------------------------------------------------------------------------------------------------------------------ | --- |
| Virtual backgrounds — **done**, via `@livekit/track-processors` (MediaPipe segmentation, client-side only)                     | v2  |
| Background blur — **done**, same feature/implementation as virtual backgrounds above                                           | v2  |
| Noise cancellation — **done**, via RNNoise (not LiveKit's Krisp package — that's LiveKit Cloud-only, see Research notes)       | v2  |
| Breakout rooms                                                                                                                 | v2  |
| Reactions/emojis — **done**, via LiveKit's own data channel (`useDataChannel`) — see Research notes                            | v2  |
| Raise hand — **done**, via LiveKit participant metadata (not the data channel) — see Research notes                            | v2  |
| Polls & Q&A                                                                                                                    | v2  |
| Collaborative whiteboard/annotation (in-app: blank canvas + draw-on-shared-screen, inside our own video call UI)               | v2  |
| Meeting lock — **done**, `Room.locked` + host-only lock/unlock endpoints — see Research notes                                  | v2  |
| Co-host / multiple hosts — **done**, `RoomRole.cohost` + `RoomHostOrCoHostGuard` — see Research notes                          | v2  |
| Layout: grid view — **already done for free**, `VideoConference`'s default `GridLayout` — see Research notes                   | v2  |
| Layout: speaker view — **already done for free**, `VideoConference` auto-focuses a pinned/screen-shared track                  | v2  |
| Layout: gallery view — **already done for free**, same `GridLayout` as grid view above (paginated)                             | v2  |
| Picture-in-picture mode — **done**, native `HTMLVideoElement.requestPictureInPicture()`, client-side only — see Research notes | v2  |
| Device picker (mic/camera/speaker) — **already done for free**, `ControlBar`'s built-in `MediaDeviceMenu`                      | v2  |
| Network quality indicator — **already done for free**, `ParticipantTile`'s built-in `ConnectionQualityIndicator`               | v2  |
| Meeting analytics (attendance, duration, join/leave times)                                                                     | v2  |
| End-to-end encryption toggle — **done**, via LiveKit's `ExternalE2EEKeyProvider` + a URL-fragment key — see Research notes     | v2  |

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

## Open items

- [ ] Confirm v1 scope with stakeholders before starting build
- [ ] Define pricing/tier boundaries (what's free vs pro vs enterprise) — ties to billing design
- [ ] Prioritize order within each tier once v1 scope is locked
- [ ] Decide ephemeral vs. persisted whiteboard state before starting the Tier 2 annotation feature (see Research notes)
- [ ] Decide whether cross-tab annotation (Tier 3) is worth a separate browser-extension codebase before scheduling it, given the store-review and maintenance overhead documented above

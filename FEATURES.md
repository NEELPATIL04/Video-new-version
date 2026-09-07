# Feature List & Roadmap

**Status:** Scoped — basic to advanced
**Date:** 2026-09-08
**Related:** [TECH_STACK.md](./TECH_STACK.md), [WEBRTC_LIVEKIT.md](./WEBRTC_LIVEKIT.md)

**Rule of thumb:** build strictly in tier order. Do not start Tier 2 work until Tier 1 (v1) is shipped and stable. Trying to build multiple tiers in parallel is how these projects stall.

---

## Tier 1 — v1 / MVP (core, must-have — "a working video call app")

| Feature | Tag |
|---|---|
| User accounts: sign up/login | v1 |
| Google/Microsoft SSO | v1 |
| Create meeting: instant | v1 |
| Create meeting: scheduled | v1 |
| Create meeting: recurring | v1 |
| Join via link or meeting code | v1 |
| 1:1 video/audio calling | v1 |
| Group video/audio calling | v1 |
| Mute/unmute audio | v1 |
| Camera on/off | v1 |
| Screen sharing | v1 |
| In-call text chat | v1 |
| Participant list | v1 |
| Host controls: mute participant | v1 |
| Host controls: remove participant | v1 |
| Waiting room / lobby (host admits) | v1 |
| Cloud recording (start/stop, playback) | v1 |
| Calendar integration (Google Calendar, Outlook) | v1 |
| Email/push notifications & reminders | v1 |
| Web app | v1 |
| Mobile app (iOS/Android) | v1 |

---

## Tier 2 — v2 (standard — competitive parity with Meet/Zoom)

| Feature | Tag |
|---|---|
| Virtual backgrounds | v2 |
| Background blur | v2 |
| Noise cancellation | v2 |
| Breakout rooms | v2 |
| Reactions/emojis | v2 |
| Raise hand | v2 |
| Polls & Q&A | v2 |
| Collaborative whiteboard/annotation | v2 |
| In-chat file sharing | v2 |
| Meeting lock (block new joiners mid-call) | v2 |
| Co-host / multiple hosts | v2 |
| Layout: grid view | v2 |
| Layout: speaker view | v2 |
| Layout: gallery view | v2 |
| Picture-in-picture mode | v2 |
| Device picker (mic/camera/speaker) | v2 |
| Network quality indicator | v2 |
| Meeting analytics (attendance, duration, join/leave times) | v2 |
| Recording sharing (permissioned link) | v2 |
| End-to-end encryption toggle | v2 |

---

## Tier 3 — v3 (advanced / enterprise)

| Feature | Tag |
|---|---|
| Large-scale webinar/broadcast mode (view-only, hundreds-thousands) | v3 |
| Live streaming out (YouTube/Facebook/custom RTMP) | v3 |
| SIP/PSTN dial-in (join by phone number) | v3 |
| Multi-device join (same user, multiple devices) | v3 |
| Admin dashboard: org-wide user management | v3 |
| Admin dashboard: usage reports | v3 |
| Admin dashboard: security policies | v3 |
| Enterprise SSO/SAML | v3 |
| Role-based access control | v3 |
| Public API/SDK (embeddable video calls) | v3 |
| Integration: Slack | v3 |
| Integration: Jira | v3 |
| Integration: Notion | v3 |
| White-labeling / custom branding | v3 |
| Meeting templates & agendas | v3 |
| Security: watermarking | v3 |
| Security: domain-restricted join | v3 |
| Security: enforced waiting room policies | v3 |

---

## Tier 4 — v4 (AI-driven — the differentiator layer)

| Feature | Tag |
|---|---|
| Live transcription & captions | v4 |
| Multi-language captions | v4 |
| **Real-time translation with voice-preserved dubbing** (flagship feature) | v4 |
| Auto meeting summaries | v4 |
| Auto action items → push to Jira/Linear/Asana | v4 |
| AI-powered noise cancellation (smart, adaptive) | v4 |
| AI-powered virtual backgrounds (smart segmentation) | v4 |
| AI meeting co-pilot (live Q&A using meeting context) | v4 |
| Auto chapter markers / smart highlights in recordings | v4 |
| Searchable meeting history (semantic search across transcripts) | v4 |
| Auto-generated agenda from calendar invite content | v4 |
| Engagement/sentiment signals for hosts (talk-time balance, disengagement) | v4 |

---

## Cross-cutting / Non-functional (apply across all tiers — easy to forget, plan early)

| Requirement | Applies from |
|---|---|
| Security & compliance: GDPR | v1 |
| Security & compliance: SOC2 | v3 |
| Security & compliance: HIPAA (if targeting healthcare) | future/optional |
| Accessibility: screen reader support | v1 |
| Accessibility: closed captions for deaf/hard-of-hearing | v2 |
| i18n: multi-language UI | v2 |
| Reconnection handling (graceful recovery from network drops) | v1 |
| Cross-browser/device compatibility testing | v1 (ongoing) |
| Observability: call quality metrics (jitter, packet loss, MOS) | v1 |
| Observability: error tracking | v1 |
| Billing & subscription tiers (free / pro / enterprise) | v2 |
| Usage-based AI feature gating | v4 |

---

## Open items

- [ ] Confirm v1 scope with stakeholders before starting build
- [ ] Define pricing/tier boundaries (what's free vs pro vs enterprise) — ties to billing design
- [ ] Prioritize order within each tier once v1 scope is locked

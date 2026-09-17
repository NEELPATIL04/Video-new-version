// LiveKit's own KeyProvider (ExternalE2EEKeyProvider) is a single shared
// passphrase between all participants — it doesn't solve how that
// passphrase reaches everyone, only what to do with it once you have one.
// Putting it in the URL fragment (after "#") is what actually makes this
// end-to-end: fragments are never sent to any server by any browser, by
// spec, unlike a query param or a field in the join API. Whoever we
// derived or transmitted the key through the backend would already have
// it, which defeats the point. See FEATURES.md's Research notes for the
// fuller writeup, including why this is creation-time-only (no live
// mid-call toggle) and why join-by-code can't carry an E2EE key at all.
const KEY_PARAM = "key";

// crypto.getRandomValues, not Math.random — this is a real encryption key,
// not a display code like joinCode. base64url so it's URL-fragment-safe
// with no manual encoding.
export function generateE2eeKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Reads the key out of the CURRENT page's URL fragment. Must only ever be
// called client-side (window.location) — there is deliberately no
// server-side equivalent, since the whole point is the backend never sees
// this value.
export function getE2eeKeyFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get(KEY_PARAM);
}

// Builds the shareable path for a room, embedding the key in the fragment
// when encryption is enabled. Callers use this for the post-creation
// redirect (instant meetings) or a "copy link" action — never for
// anything that goes through fetch/apiFetch, since fragments aren't part
// of what a server request even sees.
export function buildRoomPath(roomId: string, e2eeKey?: string): string {
  return e2eeKey ? `/rooms/${roomId}#${KEY_PARAM}=${e2eeKey}` : `/rooms/${roomId}`;
}

"use client";

import { useEffect } from "react";
import { useAuthStore } from "../store";
import { me, refresh } from "../api";
import { ApiError } from "@/lib/api-client";

// Runs once on app mount: tries to silently restore a session from the
// httpOnly refresh cookie. If there's no valid cookie (first visit, or it
// expired), this just settles to "anonymous" — that's the normal logged-out
// path, not an error.
//
// React Strict Mode double-invokes this effect on every mount in dev,
// which fires two refresh calls. Don't "fix" that with a ref guard that
// skips the second invocation — the cleanup below runs synchronously on
// the simulated unmount, marking the FIRST invocation's in-flight call
// cancelled before it resolves; a guard that blocks the second invocation
// from ever running leaves nothing left to call setAuth, so the page gets
// stuck on "Loading..." forever even though the request succeeded. The
// plain cancelled-flag pattern here is what actually works: each
// invocation gets its own cancelled flag, the stale (first) one's result
// is discarded, and the surviving (second) one updates state normally.
export function useAuthInit() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { accessToken } = await refresh();
        const user = await me(accessToken);
        if (!cancelled) setAuth(accessToken, user);
      } catch (err) {
        if (!cancelled) {
          if (!(err instanceof ApiError && err.status === 401)) {
            console.error("Unexpected error restoring session", err);
          }
          clearAuth();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

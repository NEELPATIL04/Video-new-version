import { apiFetch } from "@/lib/api-client";
import type { SafeUser } from "./store";

interface AuthResponse {
  user: SafeUser;
  accessToken: string;
}

export function register(input: { email: string; name: string; password: string }) {
  return apiFetch<AuthResponse>("/auth/register", { method: "POST", body: input });
}

export function login(input: { email: string; password: string }) {
  return apiFetch<AuthResponse>("/auth/login", { method: "POST", body: input });
}

// Uses the httpOnly refresh cookie (sent automatically via credentials:
// "include") — no token passed explicitly. Called once on app load to
// restore a session after a page reload, since the access token itself is
// memory-only and doesn't survive one.
//
// De-duplicated against concurrent callers: the refresh token is single-use
// (the backend rotates it and revokes the old one on every call — see
// auth.service.ts's reuse detection). React Strict Mode double-invokes
// useAuthInit's mount effect in dev, and without this, both invocations
// could fire a refresh request with the same not-yet-rotated cookie; if
// the second one reaches the backend just after the first has already
// rotated the token, it looks like a stolen-token replay and the backend
// revokes the whole session. Sharing one in-flight promise means only one
// HTTP request is ever actually sent for concurrent callers, so the race
// can't happen — this isn't dev-only insurance, either: two tabs silently
// refreshing from the same stored cookie at once would hit the exact same
// race in production.
let inFlightRefresh: Promise<{ accessToken: string }> | null = null;

export function refresh() {
  if (!inFlightRefresh) {
    inFlightRefresh = apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" }).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

export function me(accessToken: string) {
  return apiFetch<SafeUser>("/auth/me", { accessToken });
}

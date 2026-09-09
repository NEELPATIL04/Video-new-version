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
export function refresh() {
  return apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" });
}

export function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

export function me(accessToken: string) {
  return apiFetch<SafeUser>("/auth/me", { accessToken });
}

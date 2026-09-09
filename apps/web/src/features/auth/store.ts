import { create } from "zustand";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: SafeUser | null;
  // "checking" until the initial silent-refresh attempt (useAuthInit)
  // resolves — lets the UI show a loading state instead of flashing the
  // login page for a split second on every page load.
  status: "checking" | "authenticated" | "anonymous";
  setAuth: (accessToken: string, user: SafeUser) => void;
  clearAuth: () => void;
}

// Deliberately NOT persisted to localStorage/sessionStorage — the access
// token only ever lives in memory, per the XSS mitigation decided in
// TECH_STACK.md §5. A page reload always starts from "checking" and relies
// on the httpOnly refresh cookie (useAuthInit) to restore the session.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "checking",
  setAuth: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  clearAuth: () => set({ accessToken: null, user: null, status: "anonymous" }),
}));

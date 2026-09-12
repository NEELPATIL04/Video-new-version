const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
}

// Every call sends credentials: "include" so the httpOnly refresh cookie
// (set by the backend on /auth/*) travels with the request — required for
// the refresh/logout flow to work at all across the localhost:3000 →
// localhost:3001 origin boundary.
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, data.message ?? "Request failed");
  }

  // Several host-action endpoints (admit/deny/mute/remove/lower-hand/
  // lock/unlock) reply 200 OK with no body at all (the service methods
  // return void) — not just 204. res.json() on a genuinely empty body
  // throws "Unexpected end of JSON input", which surfaces as an unhandled
  // rejection in whatever called apiFetch (e.g. WaitingRoomHostPanel's
  // handleAdmit) — caught live via Playwright while writing e2e coverage
  // for both raise-hand and meeting-lock independently. Reading as text
  // first and treating an empty body as "no payload" handles both the
  // 204 case and this 200-with-empty-body case the same way, without
  // guessing at which endpoints do which.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

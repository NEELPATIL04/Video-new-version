"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Video as VideoIcon, Link2, ClipboardList } from "lucide-react";
import { useAuthStore } from "@/features/auth/store";
import { listMyRooms } from "@/features/rooms/api";
import { CreateRoomForm } from "@/features/rooms/components/CreateRoomForm";
import { JoinByCodeForm } from "@/features/rooms/components/JoinByCodeForm";
import { RoomList } from "@/features/rooms/components/RoomList";
import { TemplateManager } from "@/features/rooms/components/TemplateManager";
import { RoomsSidebar } from "@/features/rooms/components/RoomsSidebar";
import { DashboardStats } from "@/features/rooms/components/DashboardStats";
import { UpNextCard } from "@/features/rooms/components/UpNextCard";
import { logout } from "@/features/auth/api";

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// A ticking clock is exactly the "subscribe to an external source" case
// useSyncExternalStore exists for — same reasoning as CreateRoomForm's
// e2eeSupported check, just ticking instead of one-shot. The server (and
// the client's first hydration pass) render `null`; the real time only
// ever appears once mounted, so there's nothing to mismatch.
//
// getSnapshot must return the SAME value between renders unless the
// store actually changed — calling Date.now() directly here would return
// a new number on every call, which React reads as "the store changed
// mid-render" and re-renders forever (a real bug this exact code hit).
// Caching the value and only updating it inside the interval callback
// (which also notifies React) keeps it stable in between ticks.
let cachedNowMs = Date.now();
function subscribeClock(onChange: () => void) {
  const id = setInterval(() => {
    cachedNowMs = Date.now();
    onChange();
  }, 1000);
  return () => clearInterval(id);
}
function getClockSnapshot() {
  return cachedNowMs;
}
function getServerClockSnapshot() {
  return null;
}

export default function RoomsPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Purely decorative clock/greeting — see subscribeClock above for why
  // this ticks via useSyncExternalStore instead of a setState-in-effect.
  const nowMs = useSyncExternalStore(subscribeClock, getClockSnapshot, getServerClockSnapshot);
  const now = nowMs === null ? null : new Date(nowMs);

  // Real keyboard shortcut (not just a decorative hint) — Ctrl/Cmd+K
  // focuses the search field below.
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.push("/login");
  }, [status, router]);

  // The single source of truth for this whole dashboard — DashboardStats,
  // UpNextCard, and RoomList all render from this ONE query result
  // (passed down as props) instead of each independently calling
  // useQuery for the identical data.
  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ["rooms", accessToken],
    queryFn: () => listMyRooms(accessToken as string),
    enabled: !!accessToken,
  });

  // Plain client-side filter over the same list — no separate search
  // endpoint, matches by name or by join code (spaces/dashes ignored).
  const filteredRooms = useMemo(() => {
    if (!rooms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    // "".includes("") is always true — only try a join-code match when
    // the query actually has digits in it, or a purely-alphabetic search
    // would match every room via its code instead of filtering by name.
    const digits = q.replace(/\D/g, "");
    return rooms.filter(
      (r) => r.name.toLowerCase().includes(q) || (digits.length > 0 && r.joinCode.includes(digits)),
    );
  }, [rooms, search]);

  if (status !== "authenticated") {
    return (
      <main className="flex items-center justify-center flex-1" style={{ minHeight: "100vh", backgroundColor: "var(--color-surface-0)" }}>
        <p className="text-sm text-muted">Loading...</p>
      </main>
    );
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    clearAuth();
    router.push("/login");
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const upcomingCount = (rooms ?? []).filter((r) => r.status === "scheduled").length;

  return (
    <>
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-blob dash-blob-1" />
        <div className="dash-blob dash-blob-2" />
        <div className="dash-blob dash-blob-3" />
      </div>

      <div className="dash-shell">
        <RoomsSidebar onSignOut={handleLogout} />

        <main className="dash-main dash-glass">
          <header className="flex items-center justify-between gap-4 px-5 lg:px-6 h-16 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="text-lg font-light tracking-wide shrink-0">Meetings</h2>

            <div className="flex-1 max-w-md mx-4 hidden md:block relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your meetings..."
                className="dash-input w-full pl-9 pr-16"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
                <kbd className="px-1.5 py-0.5 rounded text-[10px] text-muted" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  Ctrl
                </kbd>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] text-muted" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  K
                </kbd>
              </div>
            </div>

            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 p-[2px]"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.5), var(--color-surface-3))" }}
              title={user?.name}
            >
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-xs font-medium"
                style={{ backgroundColor: "var(--color-surface-1)" }}
              >
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto dash-scroll p-5 lg:p-6">
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-medium tracking-widest uppercase mb-1 text-secondary">
                  {now
                    ? now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase()
                    : " "}
                </p>
                <h1 className="text-2xl md:text-3xl font-light">
                  {now ? greetingFor(now) : "Welcome"}, <span className="font-medium">{firstName}</span>
                </h1>
                <p className="text-sm text-muted mt-1">
                  {upcomingCount > 0
                    ? `You have ${upcomingCount} upcoming meeting${upcomingCount === 1 ? "" : "s"}.`
                    : "No upcoming meetings — plan one below."}
                </p>
              </div>
              <div className="text-3xl md:text-4xl font-light tracking-tight">
                {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </div>
            </section>

            {/* One wide primary card (the richest form: name, template,
                schedule, e2ee) beside two short secondary actions STACKED
                in their own column — three equal-width cards left the
                two short ones stranded next to a wall of dead space
                under the taller form. */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5 items-start">
              <div className="dash-quick-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="dash-quick-icon">
                    <VideoIcon size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">New meeting</h3>
                    <p className="text-xs text-muted">Instant or scheduled</p>
                  </div>
                </div>
                <CreateRoomForm />
              </div>

              <div className="flex flex-col gap-3">
                <div className="dash-quick-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="dash-quick-icon">
                      <Link2 size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Join meeting</h3>
                      <p className="text-xs text-muted">Enter a code to hop in</p>
                    </div>
                  </div>
                  <JoinByCodeForm />
                </div>

                <div className="dash-quick-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="dash-quick-icon">
                      <ClipboardList size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Templates</h3>
                      <p className="text-xs text-muted">Reuse saved agendas & settings</p>
                    </div>
                  </div>
                  <a href="#templates" className="dash-button-secondary text-sm text-center block">
                    Manage templates
                  </a>
                </div>
              </div>
            </section>

            <div className="mb-5">
              <DashboardStats rooms={rooms ?? []} />
            </div>

            {/* Same 4-column track as DashboardStats above (2+2, not the
                earlier 2-of-3 split) so this row's boundary lines up
                exactly under "Active now" / "Scheduled". */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
              <div className="dash-card lg:col-span-2">
                <p className="dash-card-title mb-3">Your meetings</p>
                <RoomList rooms={filteredRooms} isLoading={isLoading} error={!!error} filtered={search.trim().length > 0} />
              </div>

              <div className="flex flex-col gap-3 lg:col-span-2">
                <UpNextCard rooms={rooms ?? []} />
                <div id="templates">
                  <TemplateManager />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

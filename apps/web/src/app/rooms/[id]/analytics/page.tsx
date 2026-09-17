"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store";
import { MeetingAnalytics } from "@/features/rooms/components/MeetingAnalytics";

// Routing only, per DEV_STANDARDS.md §3.1 — all the actual behavior lives
// in features/rooms/components/MeetingAnalytics.tsx.
export default function RoomAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (authStatus === "anonymous") router.push("/login");
  }, [authStatus, router]);

  if (authStatus !== "authenticated") {
    return (
      <main className="flex items-center justify-center flex-1">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  return <MeetingAnalytics roomId={id} />;
}

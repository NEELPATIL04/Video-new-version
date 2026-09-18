"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store";
import { CreateRoomForm } from "@/features/rooms/components/CreateRoomForm";
import { JoinByCodeForm } from "@/features/rooms/components/JoinByCodeForm";
import { RoomList } from "@/features/rooms/components/RoomList";
import { TemplateManager } from "@/features/rooms/components/TemplateManager";
import { logout } from "@/features/auth/api";

export default function RoomsPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (status === "anonymous") router.push("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <main className="flex items-center justify-center flex-1">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    clearAuth();
    router.push("/login");
  };

  return (
    <main className="flex flex-col items-center gap-8 p-8 flex-1">
      <div className="flex justify-between items-center w-full max-w-md">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm underline">
            Sign out
          </button>
        </div>
      </div>
      <CreateRoomForm />
      <JoinByCodeForm />
      <TemplateManager />
      <RoomList />
    </main>
  );
}

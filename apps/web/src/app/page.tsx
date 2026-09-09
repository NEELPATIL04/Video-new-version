"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store";

export default function Home() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/rooms");
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  return (
    <main className="flex items-center justify-center flex-1">
      <p className="text-sm text-gray-500">Loading...</p>
    </main>
  );
}

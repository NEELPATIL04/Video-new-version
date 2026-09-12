"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getRoomByCode } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const schema = z.object({
  code: z.string().min(1, "Enter a meeting code"),
});

type FormValues = z.infer<typeof schema>;

// Resolves the code to a room, then hands off to the normal join flow at
// /rooms/:id — no separate join logic here, so this gets the exact same
// waiting-room gating, capacity checks, and auth as joining via a link.
export function JoinByCodeForm() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!accessToken) return;
    setServerError(null);
    try {
      const room = await getRoomByCode(values.code, accessToken);
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.status === 404
          ? "No meeting found with that code"
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-start w-full max-w-md">
      <div className="flex flex-col gap-1 flex-1">
        <input
          {...register("code")}
          placeholder="Enter meeting code"
          className="border rounded px-3 py-2 w-full"
        />
        {errors.code && <p className="text-sm text-red-600">{errors.code.message}</p>}
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="border rounded px-4 py-2 disabled:opacity-50 whitespace-nowrap"
      >
        {isSubmitting ? "Joining..." : "Join with code"}
      </button>
    </form>
  );
}

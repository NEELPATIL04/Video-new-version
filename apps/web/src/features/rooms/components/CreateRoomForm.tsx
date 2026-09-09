"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRoom } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const schema = z.object({
  name: z.string().min(1).max(100),
});

type FormValues = z.infer<typeof schema>;

export function CreateRoomForm() {
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
      const room = await createRoom(values, accessToken);
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-start">
      <div className="flex flex-col gap-1">
        <input
          {...register("name")}
          placeholder="Meeting name"
          className="border rounded px-3 py-2"
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {isSubmitting ? "Starting..." : "Start instant meeting"}
      </button>
    </form>
  );
}

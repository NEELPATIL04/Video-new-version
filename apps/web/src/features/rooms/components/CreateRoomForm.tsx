"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRoom } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const schema = z
  .object({
    name: z.string().min(1).max(100),
    scheduleForLater: z.boolean(),
    // datetime-local inputs give "YYYY-MM-DDTHH:mm" with no timezone —
    // treated as the browser's local time when passed to `new Date(...)`,
    // which is what a person picking a time in their own calendar expects.
    scheduledFor: z.string().optional(),
  })
  .refine((v) => !v.scheduleForLater || !!v.scheduledFor, {
    message: "Pick a date and time",
    path: ["scheduledFor"],
  })
  .refine((v) => !v.scheduleForLater || !v.scheduledFor || new Date(v.scheduledFor) > new Date(), {
    message: "Must be in the future",
    path: ["scheduledFor"],
  });

type FormValues = z.infer<typeof schema>;

export function CreateRoomForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { scheduleForLater: false },
  });

  // useWatch (not the `watch` method off useForm()) — it's the React
  // Compiler-friendly variant; `watch()` returns a function the compiler
  // can't safely memoize.
  const scheduleForLater = useWatch({ control, name: "scheduleForLater" });

  const onSubmit = async (values: FormValues) => {
    if (!accessToken) return;
    setServerError(null);
    try {
      const room = await createRoom(
        {
          name: values.name,
          // new Date(...).toISOString() converts the local datetime-local
          // value to the UTC instant the backend's @IsDateString expects.
          scheduledFor: values.scheduleForLater && values.scheduledFor
            ? new Date(values.scheduledFor).toISOString()
            : undefined,
        },
        accessToken,
      );

      if (values.scheduleForLater) {
        // A scheduled meeting shouldn't auto-join the host into a live
        // LiveKit room possibly days early — just refresh the list so it
        // shows up, same as any other room the host now owns.
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      } else {
        router.push(`/rooms/${room.id}`);
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex gap-2 items-start">
        <div className="flex flex-col gap-1 flex-1">
          <input
            {...register("name")}
            placeholder="Meeting name"
            className="border rounded px-3 py-2 w-full"
          />
          {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {isSubmitting
            ? "Starting..."
            : scheduleForLater
              ? "Schedule meeting"
              : "Start instant meeting"}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" {...register("scheduleForLater")} />
        Schedule for later
      </label>

      {scheduleForLater && (
        <div className="flex flex-col gap-1">
          <input
            type="datetime-local"
            {...register("scheduledFor")}
            className="border rounded px-3 py-2"
          />
          {errors.scheduledFor && (
            <p className="text-sm text-red-600">{errors.scheduledFor.message}</p>
          )}
        </div>
      )}

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}

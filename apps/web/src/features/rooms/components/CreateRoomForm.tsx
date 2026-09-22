"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isE2EESupported } from "livekit-client";
import { createRoom, listTemplates } from "../api";
import { generateE2eeKey, buildRoomPath } from "../e2ee";
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
    // Only meaningful for an instant meeting — see the checkbox's own
    // note below for why a scheduled meeting can't offer this yet.
    e2eeEnabled: z.boolean(),
    webinarMode: z.boolean(),
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

// isE2EESupported() itself is SSR-safe (it checks `typeof window` before
// touching any browser API), but its real answer only exists client-side
// — the server always sees "no window" and would report false whether or
// not the requesting browser actually supports it. useSyncExternalStore
// is the tool React provides for exactly this "value legitimately
// differs between server and client" case: getServerSnapshot fixes what
// the server (and the client's first hydration pass) renders, avoiding a
// hydration mismatch, and React re-invokes getSnapshot once hydrated to
// pick up the real client-side answer — no manual effect + setState
// needed, which is also what this repo's lint config (justifiably) flags
// as an anti-pattern for exactly this kind of "sync on mount" logic.
const noopSubscribe = () => () => {};
const getServerE2eeSupport = () => false;

export function CreateRoomForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [serverError, setServerError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const e2eeSupported = useSyncExternalStore(
    noopSubscribe,
    isE2EESupported,
    getServerE2eeSupport,
  );

  // Own list of the user's templates, not room-scoped — populates
  // template-select below. See TemplateManager.tsx for create/delete.
  const { data: templates } = useQuery({
    queryKey: ["templates", accessToken],
    queryFn: () => listTemplates(accessToken as string),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { scheduleForLater: false, e2eeEnabled: false, webinarMode: false },
  });

  // useWatch (not the `watch` method off useForm()) — it's the React
  // Compiler-friendly variant; `watch()` returns a function the compiler
  // can't safely memoize.
  const scheduleForLater = useWatch({ control, name: "scheduleForLater" });

  // Prefills name/e2eeEnabled from the chosen template — still editable by
  // the user afterward (a prefill, not a lock). templateId itself is
  // tracked separately from react-hook-form's own state since it isn't a
  // field the form itself validates or submits as part of FormValues; it's
  // only carried through to the createRoom() call below.
  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const template = templates?.find((t) => t.id === id);
    if (!template) return;
    setValue("name", template.name);
    setValue("e2eeEnabled", template.defaultE2eeEnabled);
  };

  const onSubmit = async (values: FormValues) => {
    if (!accessToken) return;
    setServerError(null);
    // Only an instant meeting redirects to its own room URL right after
    // creation — that's the one moment this key exists anywhere, so it's
    // also the only flow that can currently embed it in a shareable link.
    // A scheduled meeting's "share later" links (calendar invites, etc.)
    // never visit /rooms/:id themselves, so there'd be nowhere to recover
    // the key from afterward without storing it server-side and breaking
    // the whole point — deliberately out of scope until that's solved
    // (see FEATURES.md's Research notes).
    const e2eeKey =
      values.e2eeEnabled && !values.scheduleForLater ? generateE2eeKey() : undefined;
    try {
      const room = await createRoom(
        {
          name: values.name,
          // new Date(...).toISOString() converts the local datetime-local
          // value to the UTC instant the backend's @IsDateString expects.
          scheduledFor: values.scheduleForLater && values.scheduledFor
            ? new Date(values.scheduledFor).toISOString()
            : undefined,
          e2eeEnabled: !!e2eeKey,
          webinarMode: values.webinarMode,
          // Omitted entirely (not empty string) when "None" is selected —
          // the backend DTO's @IsOptional() @IsUUID() would reject "".
          templateId: templateId || undefined,
        },
        accessToken,
      );

      if (values.scheduleForLater) {
        // A scheduled meeting shouldn't auto-join the host into a live
        // LiveKit room possibly days early — just refresh the list so it
        // shows up, same as any other room the host now owns.
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      } else {
        router.push(buildRoomPath(room.id, e2eeKey));
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 w-full">
      <div className="flex gap-2 items-start">
        <div className="flex flex-col gap-1 flex-1">
          <input
            {...register("name")}
            placeholder="Meeting name"
            className="dash-input w-full"
          />
          {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="dash-button-primary disabled:opacity-50 whitespace-nowrap"
        >
          {isSubmitting
            ? "Starting..."
            : scheduleForLater
              ? "Schedule meeting"
              : "Start instant meeting"}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm text-secondary">
        Start from template (optional)
        <select
          data-testid="template-select"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="dash-input"
        >
          <option value="">None</option>
          {templates?.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-secondary">
        <input type="checkbox" {...register("scheduleForLater")} />
        Schedule for later
      </label>

      <label className="flex items-center gap-2 text-sm text-secondary">
        <input type="checkbox" {...register("webinarMode")} />
        Webinar mode — attendees join view-only; promote anyone to present
      </label>

      {e2eeSupported && !scheduleForLater && (
        <>
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" {...register("e2eeEnabled")} />
            Enable end-to-end encryption
          </label>
          <p className="text-xs text-muted -mt-1">
            Only works with the full meeting link, not the join code — anyone joining will need
            the exact link you share right after starting the meeting.
          </p>
        </>
      )}
      {!e2eeSupported && !scheduleForLater && (
        <p className="text-xs text-muted">
          End-to-end encryption isn&apos;t available in this browser.
        </p>
      )}

      {scheduleForLater && (
        <div className="flex flex-col gap-1">
          <input
            type="datetime-local"
            {...register("scheduledFor")}
            className="dash-input"
          />
          {errors.scheduledFor && (
            <p className="text-sm text-danger">{errors.scheduledFor.message}</p>
          )}
        </div>
      )}

      {serverError && <p className="text-sm text-danger">{serverError}</p>}
    </form>
  );
}

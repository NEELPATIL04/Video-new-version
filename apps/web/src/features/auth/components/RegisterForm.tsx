"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { register as registerUser } from "../api";
import { useAuthStore } from "../store";
import { ApiError } from "@/lib/api-client";

// Mirrors the backend's actual policy (RegisterDto) so the client gives
// real-time feedback instead of a round-trip 400 for an obviously weak
// password.
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
      message: "Must contain an uppercase letter, a lowercase letter, and a number",
    }),
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const { accessToken, user } = await registerUser(values);
      setAuth(accessToken, user);
      router.push("/rooms");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm text-secondary">
          Name
        </label>
        <input id="name" {...registerField("name")} className="dash-input w-full" autoComplete="name" />
        {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm text-secondary">
          Email
        </label>
        <input
          id="email"
          type="email"
          {...registerField("email")}
          className="dash-input w-full"
          autoComplete="email"
        />
        {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm text-secondary">
          Password
        </label>
        <input
          id="password"
          type="password"
          {...registerField("password")}
          className="dash-input w-full"
          autoComplete="new-password"
        />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>

      {serverError && <p className="text-sm text-danger">{serverError}</p>}

      <button type="submit" disabled={isSubmitting} className="dash-button-primary disabled:opacity-50">
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}

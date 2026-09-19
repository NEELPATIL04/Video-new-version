import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export default function RegisterPage() {
  return (
    <>
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-blob dash-blob-1" />
        <div className="dash-blob dash-blob-2" />
      </div>
      <main
        className="flex flex-col items-center justify-center flex-1 p-8"
        style={{ minHeight: "100vh", color: "var(--color-text-primary)" }}
      >
        <div className="dash-card" style={{ width: "100%", maxWidth: "380px" }}>
          <h1 className="text-xl font-medium mb-1">Create an account</h1>
          <p className="text-sm text-muted mb-5">Set up your account to start meeting.</p>
          <RegisterForm />
          <p className="text-sm text-muted mt-5 text-center">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

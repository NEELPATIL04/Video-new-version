import Link from "next/link";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
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
          <h1 className="text-xl font-medium mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-5">Welcome back — sign in to continue.</p>
          <LoginForm />
          <p className="text-sm text-muted mt-5 text-center">
            No account?{" "}
            <Link
              href="/register"
              className="text-primary underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

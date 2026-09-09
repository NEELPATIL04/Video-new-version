import Link from "next/link";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm />
      <p className="text-sm text-gray-500">
        No account?{" "}
        <Link href="/register" className="underline">
          Create one
        </Link>
      </p>
    </main>
  );
}

import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <RegisterForm />
      <p className="text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}

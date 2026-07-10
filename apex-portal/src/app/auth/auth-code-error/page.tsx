import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-card">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-xl font-semibold text-forest-900">
          That login link didn&apos;t work
        </h1>
        <p className="mt-2 text-sm text-forest-600">
          Login links expire after a short time and can only be used once.
          Please request a new one.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-forest-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-800"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}

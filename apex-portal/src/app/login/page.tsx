import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";

export const metadata = {
  title: "Client Login | Apex Leads",
};

export default function LoginPage() {
  return (
    <div className="topo-texture flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="animate-fade-up w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-card">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-center text-xl font-semibold text-forest-900">
          Client login
        </h1>
        <p className="mt-1 text-center text-sm text-forest-600">
          Enter your email and we&apos;ll send you a secure login link.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-stone-500">
          Not a client yet?{" "}
          <a
            href="mailto:info@apex-leads.co.uk"
            className="font-medium text-forest-600 hover:text-forest-800"
          >
            Contact us
          </a>{" "}
          to get set up.
        </p>
        <p className="mt-4 text-center text-xs text-stone-400">
          <Link href="/" className="hover:text-forest-600">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

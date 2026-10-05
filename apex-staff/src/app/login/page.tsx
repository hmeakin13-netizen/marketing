import { StaffLoginForm } from "@/components/staff/StaffLoginForm";

export const metadata = { title: "Team Login | Apex Leads" };

export default function StaffLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_60%)]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/70 p-8 shadow-2xl backdrop-blur">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          Apex Leads
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-white">
          Team portal
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-400">
          Enter your work email and we&apos;ll send you a login link.
        </p>
        {searchParams.error ? (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-200">
            That login link didn&apos;t work or has expired. Enter your email to get a new one.
          </p>
        ) : null}
        <div className="mt-6">
          <StaffLoginForm />
        </div>
      </div>
    </div>
  );
}

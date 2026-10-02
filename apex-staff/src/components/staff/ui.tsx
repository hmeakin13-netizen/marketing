import Link from "next/link";
import type { ReactNode } from "react";
import { RANGES, type Range } from "@/lib/staff/dates";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-zinc-900/60 p-5 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </h2>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const color = {
    default: "text-white",
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-rose-400",
  }[tone];
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
        error
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      }`}
    >
      {error ?? ok}
    </div>
  );
}

export function RangeTabs({ base, range }: { base: string; range: Range }) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-zinc-900 p-1">
      {RANGES.map((r) => (
        <Link
          key={r.value}
          href={`${base}?range=${r.value}`}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            r.value === range
              ? "bg-emerald-500 text-zinc-950"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const c = {
    default: "bg-white/5 text-zinc-300",
    good: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-amber-500/15 text-amber-300",
    bad: "bg-rose-500/15 text-rose-300",
    info: "bg-sky-500/15 text-sky-300",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>
      {children}
    </span>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30";
export const labelCls = "mb-1 block text-xs font-medium text-zinc-400";
export const btnPrimary =
  "rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60";
export const btnGhost =
  "rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/5";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

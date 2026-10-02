import { StaffLogoutButton } from "@/components/staff/StaffLogoutButton";

export const metadata = { title: "No access | Apex Leads" };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/70 p-8 text-center">
        <h1 className="text-xl font-semibold text-white">No team access</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This email isn&apos;t set up as an active team member. If you should
          have access, ask an admin to add you.
        </p>
        <div className="mt-6 flex justify-center">
          <StaffLogoutButton />
        </div>
      </div>
    </div>
  );
}

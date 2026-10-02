import { requireStaff, isManager } from "@/lib/staff/auth";
import { StaffNav, type NavItem } from "@/components/staff/StaffNav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireStaff();

  const items: NavItem[] = [
    { href: "/staff", label: "Dashboard", icon: "◧" },
    { href: "/staff/calls", label: "Calls", icon: "☎" },
    { href: "/staff/deals", label: "Deals & cash", icon: "£" },
    { href: "/staff/leaderboard", label: "Leaderboard", icon: "🏆" },
    { href: "/staff/targets", label: "Targets", icon: "◎" },
  ];
  if (isManager(me.role)) items.push({ href: "/staff/audit", label: "Audit trail", icon: "✎" });
  if (me.role === "admin") {
    items.push({ href: "/staff/team", label: "Team", icon: "☺" });
    items.push({ href: "/staff/pay", label: "Pay & commission", icon: "◈" });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_55%)]" />
      <StaffNav items={items} name={me.full_name} role={me.role} />
      <main className="relative px-4 py-8 sm:px-8 lg:ml-60">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

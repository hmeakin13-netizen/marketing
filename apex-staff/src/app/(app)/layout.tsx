import { requireStaff, isManager } from "@/lib/staff/auth";
import { StaffNav, type NavItem } from "@/components/staff/StaffNav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireStaff();
  const manager = isManager(me.role);

  // Three groups so the sidebar reads as "my work", "the AI team" and "admin" rather than one long list.
  // The ad-maker sub-pages only show while you are inside Ads, which is where they belong.
  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "◧", group: "Sales" },
    { href: "/calls", label: "Calls", icon: "☎", group: "Sales" },
    { href: "/calendar", label: "Calendar", icon: "▦", group: "Sales" },
    { href: "/call-grades", label: "Call grades", icon: "★", group: "Sales" },
  ];
  if (manager) items.push({ href: "/setters", label: "Setters", icon: "⇄", group: "Sales" });
  if (me.role === "setter" || manager) items.push({ href: "/report", label: "End of day report", icon: "✍", group: "Sales" });
  items.push(
    { href: "/attention", label: "Needs attention", icon: "⚑", group: "Sales" },
    { href: "/deals", label: "Deals & cash", icon: "£", group: "Sales" },
    { href: "/leaderboard", label: "Leaderboard", icon: "🏆", group: "Sales" },
    { href: "/targets", label: "Targets", icon: "◎", group: "Sales" },
    { href: "/territories", label: "Territory map", icon: "⌖", group: "Sales" }
  );
  if (manager) {
    items.push(
      { href: "/ads", label: "Ads", icon: "▤", group: "AI team" },
      { href: "/ad-maker", label: "Rules", icon: "⚖", group: "AI team", indent: true, under: "/ads" },
      { href: "/ad-maker/learnings", label: "Learnings", icon: "✦", group: "AI team", indent: true, under: "/ads" },
      { href: "/ad-maker/activity", label: "Activity", icon: "≣", group: "AI team", indent: true, under: "/ads" },
      { href: "/ad-maker/team", label: "Desks", icon: "◎", group: "AI team", indent: true, under: "/ads" },
      { href: "/care", label: "Client care", icon: "☺", group: "AI team" },
      { href: "/sales", label: "Sales recovery", icon: "☏", group: "AI team" },
      { href: "/marketing", label: "Marketing", icon: "✦", group: "AI team" }
    );
  }
  if (me.role === "admin") {
    items.push(
      { href: "/team", label: "Team", icon: "☺", group: "Admin" },
      { href: "/clients", label: "Clients", icon: "★", group: "Admin" },
      { href: "/pay", label: "Pay & commission", icon: "◈", group: "Admin" },
      { href: "/invoices", label: "Invoices", icon: "🧾", group: "Admin" },
      { href: "/settings", label: "Settings", icon: "⚙", group: "Admin" }
    );
  }
  if (manager) items.push({ href: "/audit", label: "Audit trail", icon: "✎", group: "Admin" });

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

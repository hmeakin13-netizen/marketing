import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

export function DashboardHeader({ businessName }: { businessName: string }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="hidden h-6 w-px bg-stone-200 sm:block" />
          <span className="hidden text-sm font-medium text-forest-700 sm:block">
            {businessName}
          </span>
        </div>
        <LogoutButton />
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-4 sm:hidden">
        <span className="text-sm font-medium text-forest-700">{businessName}</span>
      </div>
    </header>
  );
}

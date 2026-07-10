import Image from "next/image";
import Link from "next/link";

/**
 * Placeholder mark — swap public/logo.svg for the real Apex Leads asset.
 */
export function Logo({ subtitle, href = "/" }: { subtitle?: string; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 shrink-0">
      <Image src="/logo.svg" alt="Apex Leads" width={30} height={30} priority />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-semibold tracking-tight text-forest-900">
          Apex Leads
        </span>
        {subtitle ? (
          <span className="text-[11px] font-medium uppercase tracking-widest text-forest-500">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

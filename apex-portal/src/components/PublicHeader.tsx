import Link from "next/link";
import { Logo } from "./Logo";

export function PublicHeader() {
  return (
    <header className="border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo subtitle="Client Portal" />
        <nav className="hidden items-center gap-8 text-sm font-medium text-forest-800 md:flex">
          <Link href="/" className="hover:text-forest-600">
            Home
          </Link>
          <Link href="/faq" className="hover:text-forest-600">
            FAQ
          </Link>
          <Link href="/contact" className="hover:text-forest-600">
            Contact
          </Link>
        </nav>
        <Link
          href="/login"
          className="rounded-full bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-800"
        >
          Client Login
        </Link>
      </div>
    </header>
  );
}

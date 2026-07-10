import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-forest-700 md:flex-row md:items-center md:justify-between">
        <p>&copy; {new Date().getFullYear()} Apex Leads. Built for landscapers, by people who get the trade.</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/faq" className="hover:text-forest-900">
            FAQ
          </Link>
          <Link href="/privacy" className="hover:text-forest-900">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-forest-900">
            Terms &amp; Conditions
          </Link>
          <Link href="/contact" className="hover:text-forest-900">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}

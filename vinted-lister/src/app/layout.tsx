import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vinted Lister",
  description: "Photos in, finished Vinted listing out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-ink text-body antialiased">{children}</body>
    </html>
  );
}

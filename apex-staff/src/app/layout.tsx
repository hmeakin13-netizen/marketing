import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { FreshApp } from "@/components/staff/FreshApp";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Team Portal | Apex Leads",
  description: "Apex Leads internal team portal.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Apex Ads", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#09090b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return (
    <html lang="en" className="bg-zinc-950">
      <body className={`${inter.variable} font-sans antialiased`}>
        <FreshApp version={version} />
        {children}
      </body>
    </html>
  );
}

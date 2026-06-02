import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthHashHandler from "@/components/AuthHashHandler";
import AuthHeader from "@/components/AuthHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spoticker — Spot Matrix",
  description: "Spot pricing and eviction rates across AWS, Azure, and GCP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthHashHandler />
        <AuthHeader />
        <div className="flex-1">{children}</div>
        <footer className="relative z-10 py-4 text-center font-mono text-[11px] text-[#80b898] tracking-wide">
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/anna-kislenkova/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#42c880] hover:text-[#a0dfc0] underline underline-offset-2 transition-colors"
          >
            Anna Kislenkova
          </a>
        </footer>
      </body>
    </html>
  );
}

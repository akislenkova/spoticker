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
        {children}
      </body>
    </html>
  );
}

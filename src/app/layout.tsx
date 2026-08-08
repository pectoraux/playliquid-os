import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Playliquid OS — Virtual World Operating System",
  description:
    "The frozen kernel and contracts for virtual worlds. Packages, Specifications, Interfaces, Worlds, Builds, Entities, Kernel, Runtime Adapters, and World Nodes.",
  keywords: [
    "Playliquid",
    "virtual world",
    "operating system",
    "packages",
    "specifications",
    "world build",
    "runtime",
  ],
  authors: [{ name: "Playliquid" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

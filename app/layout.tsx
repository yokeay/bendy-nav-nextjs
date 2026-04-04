import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "bendy-nav-nextjs",
  description: "A Next.js rewrite of the original mtab project with legacy route compatibility.",
  icons: {
    icon: [
      { url: "/brand/logo-64.png", type: "image/png", sizes: "64x64" },
      { url: "/brand/logo-192.png", type: "image/png", sizes: "192x192" }
    ],
    shortcut: "/brand/logo-64.png",
    apple: "/brand/logo-192.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "笨迪导航",
  description: "笨迪导航本地导航页。",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/brand/logo-64.png", type: "image/png", sizes: "64x64" },
      { url: "/brand/logo-192.png", type: "image/png", sizes: "192x192" }
    ],
    shortcut: "/favicon.png",
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

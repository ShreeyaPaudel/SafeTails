import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SafeTails",
  description:
    "A gamified, AI-supported geo-spatial reporting framework for stray, lost, and injured animals in the Kathmandu Valley.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

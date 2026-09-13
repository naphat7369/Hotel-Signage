import type { Metadata } from "next";
import "./globals.css";
import "./manage.css";

export const metadata: Metadata = {
  title: "Shotel — Hotel Signage",
  description: "ระบบจัดการ Digital Signage สำหรับโรงแรมหลายสาขา",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}

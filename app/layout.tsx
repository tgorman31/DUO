import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shared HYROX Training",
  description:
    "Plan, train and progress together across HYROX Dublin and London.",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

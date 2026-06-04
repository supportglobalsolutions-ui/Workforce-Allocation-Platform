import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlobalSolutions Platform",
  description: "Workforce Session Allocation Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

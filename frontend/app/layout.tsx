import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlobalSolutions Platform",
  description: "Workforce Session Allocation Platform",
};

import Sidebar from "../components/Sidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen bg-[#001712] text-[#cbe9df]">
          <Sidebar />
          <main className="flex-1 p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

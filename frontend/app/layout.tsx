import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/theme/Providers";
import { themeInitScript } from "@/lib/theme/ThemeProvider";

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
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

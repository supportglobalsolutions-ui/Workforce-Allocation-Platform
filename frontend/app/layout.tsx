import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/theme/Providers";
import { themeInitScript } from "@/lib/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "Global Solutions",
  description: "Workforce Session Allocation Platform",
  icons: {
    icon: [
      { url: "/images/logo-mark.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/images/logo-mark.png", sizes: "256x256" }],
    shortcut: ["/images/logo-mark.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#010e0b" },
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Do not hardcode className="dark" — ThemeProvider + themeInitScript own the mode.
    // Hardcoding fought light mode on every React hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="icon" href="/images/logo-mark.png" type="image/png" sizes="256x256" />
        <link rel="apple-touch-icon" href="/images/logo-mark.png" sizes="256x256" />
        <style
          dangerouslySetInnerHTML={{
            __html: 'html,body{background-color:var(--background,#021D17);margin:0;min-height:100%}',
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

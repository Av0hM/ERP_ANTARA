import { Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const font = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "AntaraERP",
  description: "AI-powered operations and collaboration platform for the ANTARA CubeSat mission.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}



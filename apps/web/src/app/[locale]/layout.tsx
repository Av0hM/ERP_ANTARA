import { Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import "@/globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const font = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "AntaraERP",
  description: "AI-powered operations and collaboration platform for the ANTARA CubeSat mission.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <html lang="en" className={font.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}